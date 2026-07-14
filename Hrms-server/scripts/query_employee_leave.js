import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const targetId = process.argv[2] || '69c0ce9a455163e81f9c25de';

const calcDays = (start, end, holidaySet) => {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const ds = cur.toISOString().split('T')[0];
    if (cur.getDay() !== 0 && !holidaySet.has(ds)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

const effectiveCat = (l) => {
  if (l.category !== 'Half Day Leave') return l.category;
  const r = l.reason || '';
  if (r.includes('[Extra Time Leave]')) return 'Extra Time Leave';
  if (r.includes('[Unpaid Leave]')) return 'Unpaid Leave';
  return 'Paid Leave';
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({
    _id: new mongoose.Types.ObjectId(targetId),
  });

  if (!user) {
    console.log('User not found');
    process.exit(1);
  }

  const leaves = await db
    .collection('leaverequests')
    .find({ userId: new mongoose.Types.ObjectId(targetId) })
    .sort({ startDate: 1 })
    .toArray();

  const holidays = await db.collection('holidays').find({}).toArray();
  const holidaySet = new Set(holidays.map((h) => (h.date || '').split('T')[0]));

  const byStatus = {};
  for (const l of leaves) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  }

  const approved = leaves.filter((l) => l.status === 'Approved');
  const approvedByCat = {};

  for (const l of approved) {
    const c = effectiveCat(l);
    const days =
      l.category === 'Half Day Leave'
        ? 0.5
        : calcDays(l.startDate, l.endDate, holidaySet);
    approvedByCat[c] = (approvedByCat[c] || 0) + days;
  }

  const bonds = user.bonds || [];
  const bondMonths = bonds.reduce((s, b) => s + (b.periodMonths || 0), 0);
  const allocated = bondMonths > 0 ? bondMonths : user.paidLeaveAllocation || 0;

  const manualPaid = user.manualPaidLeaveAdjustment || 0;
  const manualHalf = user.manualHalfDayLeaveAdjustment || 0;
  const manualUnpaid = user.manualUnpaidLeaveAdjustment || 0;
  const manualExtra = user.manualExtraTimeAdjustment || 0;

  const paidUsed =
    (approvedByCat['Paid Leave'] || 0) + manualPaid + manualHalf;
  const unpaidUsed = (approvedByCat['Unpaid Leave'] || 0) + manualUnpaid;
  const extraUsed = (approvedByCat['Extra Time Leave'] || 0) + manualExtra;

  // Bond leave summary (matches UI calculateBondLeaveSummary)
  const BOND_LEAVE_EFFECTIVE_DATE = '2025-03-01';
  const todayStr = new Date().toISOString().split('T')[0];

  const convertToYYYYMMDD = (ddmmyyyy) => {
    if (!ddmmyyyy || !ddmmyyyy.includes('-')) return ddmmyyyy;
    const parts = ddmmyyyy.split('-');
    if (parts[0].length === 4) return ddmmyyyy;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const bondStart = convertToYYYYMMDD(user.joiningDate);
  const bondEnd = bonds.length
    ? convertToYYYYMMDD(bonds[bonds.length - 1].endDate)
    : todayStr;
  const countStart =
    bondStart > BOND_LEAVE_EFFECTIVE_DATE ? bondStart : BOND_LEAVE_EFFECTIVE_DATE;
  const countEnd = bondEnd > todayStr ? todayStr : bondEnd;

  const attendance = await db
    .collection('attendances')
    .find({ userId: new mongoose.Types.ObjectId(targetId) })
    .toArray();

  const isPresent = (r) => {
    if (!r) return false;
    if (r.checkIn) return true;
    if (r.manualHours && r.manualHours.length > 0) return true;
    if ((r.totalWorkedSeconds || 0) > 0) return true;
    return false;
  };

  const leaveDates = new Set();
  for (const l of approved) {
    let cur = new Date(l.startDate + 'T00:00:00');
    const end = new Date(l.endDate + 'T00:00:00');
    while (cur <= end) {
      leaveDates.add(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const firstCheckIn = attendance
    .filter((r) => r.checkIn)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const firstCheckInStr = firstCheckIn
    ? String(firstCheckIn.date).split('T')[0]
    : undefined;
  const absenceStart = firstCheckInStr || '9999-12-31';

  const absentDaysList = [];
  const iter = new Date(countStart + 'T00:00:00');
  const cappedEnd = new Date(countEnd + 'T23:59:59');
  const now = new Date();
  const endCap = cappedEnd < now ? cappedEnd : now;

  while (iter <= endCap) {
    const dateStr = iter.toISOString().split('T')[0];
    const dayOfWeek = iter.getDay();
    const record = attendance.find(
      (r) => String(r.date).split('T')[0] === dateStr
    );
    if (
      dateStr >= countStart &&
      dateStr <= countEnd &&
      dateStr >= absenceStart &&
      dateStr < todayStr &&
      dayOfWeek !== 0 &&
      !holidaySet.has(dateStr) &&
      !isPresent(record) &&
      !leaveDates.has(dateStr)
    ) {
      absentDaysList.push(dateStr);
    }
    iter.setDate(iter.getDate() + 1);
  }

  let appliedDays = 0;
  for (const l of approved) {
    const cat = l.category;
    if (cat === 'Extra Time Leave') continue;
    if (cat === 'Half Day Leave' && (l.reason || '').includes('[Extra Time Leave]'))
      continue;
    if (l.startDate > countEnd || l.endDate < countStart) continue;
    if (cat === 'Half Day Leave') {
      const day = l.startDate.split('T')[0];
      if (day >= countStart && day <= countEnd) appliedDays += 0.5;
    } else {
      appliedDays += calcDays(l.startDate, l.endDate, holidaySet);
    }
  }

  const absentDays = absentDaysList.length;
  const manualTotal = manualPaid + manualHalf + manualUnpaid;
  const totalTaken = appliedDays + manualTotal;
  const remaining = Math.max(0, allocated - totalTaken);
  const used = Math.min(totalTaken, allocated);

  console.log(
    JSON.stringify(
      {
        employee: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          department: user.department,
          joiningDate: user.joiningDate,
          bonds: user.bonds,
        },
        bondLeaveSummary: {
          countStart,
          countEnd,
          absenceStart,
          allocated,
          appliedDays,
          absentDays,
          absentDaysList,
          manualTotal,
          totalTaken,
          used,
          remaining,
          extra: Math.max(0, totalTaken - allocated),
        },
        leaveRequests: {
          total: leaves.length,
          byStatus,
          approved: approved.length,
          pending: leaves.filter((l) => l.status === 'Pending').length,
          rejected: leaves.filter((l) => l.status === 'Rejected').length,
          cancelled: leaves.filter((l) => l.status === 'Cancelled').length,
        },
        approvedLeaveDays: approvedByCat,
        paidLeave: {
          allocated,
          paidLeaveAllocation: user.paidLeaveAllocation || 0,
          bondMonths,
          used: paidUsed,
          remaining: Math.max(0, allocated - paidUsed),
          paidLeaveAccess: user.paidLeaveAccess !== false,
        },
        unpaidLeaveDays: unpaidUsed,
        extraTimeLeaveDays: extraUsed,
        manualAdjustments: { manualPaid, manualHalf, manualUnpaid, manualExtra },
        approvedLeaveDetails: approved.map((l) => ({
          category: l.category,
          effectiveCategory: effectiveCat(l),
          startDate: l.startDate,
          endDate: l.endDate,
          days:
            l.category === 'Half Day Leave'
              ? 0.5
              : calcDays(l.startDate, l.endDate, holidaySet),
          reason: (l.reason || '').slice(0, 80),
          status: l.status,
        })),
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
