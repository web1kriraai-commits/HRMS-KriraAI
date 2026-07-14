/**
 * Recalculate general OT so late-check-in penalty minutes are not counted.
 * Uses getFlags() (post-penalty) and overwrites sticky inflated generalOvertimeMinutes.
 *
 * Run: node scripts/fix_penalty_inflated_general_ot.js
 */
import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import SystemSettings from '../models/SystemSettings.js';
import {
  calculateWorkedSeconds,
  getFlags,
  resolveLatePenaltyStartTime,
  hasCheckoutOverrideForDate,
  syncAllOvertimeRecords,
  recalculateOvertimeBuckets,
  getMonthKey,
} from '../utils/attendanceUtils.js';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const getExtraTimeLeaveMinutes = (leave) => {
  if (!leave?.startTime || !leave?.endTime) return 0;
  const [startH, startM] = leave.startTime.split(':').map(Number);
  const [endH, endM] = leave.endTime.split(':').map(Number);
  return Math.max(0, endH * 60 + endM - (startH * 60 + startM));
};

async function getSameMonthDeficitRecords(userId, dateStr, excludeId = null) {
  const monthKey = getMonthKey(dateStr);
  const query = {
    userId,
    date: { $regex: `^${monthKey}` },
    'earlyOvertime.deficitMinutes': { $gt: 0 },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Attendance.find(query).sort({ date: 1 });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  console.log('Connected.\n');

  const settings = await SystemSettings.getSettings();
  const tz = settings?.timezone || 'Asia/Kolkata';

  // Focus on records that had a late penalty (those most likely to have inflated OT)
  const records = await Attendance.find({
    checkIn: { $exists: true, $ne: null },
    checkOut: { $exists: true, $ne: null },
    $or: [
      { penaltySeconds: { $gt: 0 } },
      { lateCheckIn: true },
    ],
  });

  console.log(`Scanning ${records.length} late-penalty attendance record(s)...\n`);

  const holidayDates = new Set(
    (await CompanyHoliday.find({}, 'date').lean()).map((h) => h.date)
  );

  let updated = 0;
  let unchanged = 0;
  const samples = [];

  for (const record of records) {
    const uid = record.userId;
    const dateStr = record.date;
    const isHoliday = holidayDates.has(dateStr);

    const leaves = await LeaveRequest.find({
      userId: uid,
      startDate: dateStr,
      status: 'Approved',
      category: { $in: ['Half Day Leave', 'Extra Time Leave'] },
    }).lean();

    const hasHalfDay = leaves.some((l) => l.category === 'Half Day Leave');
    const etl = leaves.find((l) => l.category === 'Extra Time Leave');
    const extraTimeLeaveMinutes = getExtraTimeLeaveMinutes(etl);
    const isEarlyReleaseDay = hasCheckoutOverrideForDate(settings, dateStr);

    const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());
    const flags = getFlags(
      worked,
      hasHalfDay,
      extraTimeLeaveMinutes,
      isHoliday,
      record.checkIn,
      record.isPenaltyDisabled,
      0,
      dateStr,
      isEarlyReleaseDay,
      resolveLatePenaltyStartTime(settings, dateStr),
      tz
    );

    const beforeOT = record.generalOvertimeMinutes || 0;
    const beforeOtReq = record.overtimeRequest?.completedMinutes || 0;
    const beforeWorked = record.totalWorkedSeconds || 0;
    const correctOT = flags.completedGeneralOvertime ?? flags.completedOvertime ?? 0;
    const adjustedWorked = isHoliday
      ? worked
      : Math.max(0, worked - (flags.penaltySeconds || 0));

    if (
      beforeOT === correctOT &&
      beforeOtReq === correctOT &&
      Math.abs(beforeWorked - adjustedWorked) < 1 &&
      record.penaltySeconds === flags.penaltySeconds
    ) {
      unchanged++;
      continue;
    }

    record.totalWorkedSeconds = adjustedWorked;
    record.penaltySeconds = flags.penaltySeconds || 0;
    record.lateCheckIn = flags.lateCheckIn || false;
    record.lowTimeFlag = flags.lowTime;

    // Clear sticky inflated values first so sync writes calculated OT
    record.generalOvertimeMinutes = correctOT;
    record.rawOvertimeSurplusMinutes = correctOT;

    syncAllOvertimeRecords(record, flags, {
      isHalfDayApproved: hasHalfDay,
      earlyLogoutApproved: record.earlyLogoutRequest === 'Approved',
      workedMinutes: Math.floor(adjustedWorked / 60) + extraTimeLeaveMinutes,
    });

    const sameMonth = await getSameMonthDeficitRecords(uid, dateStr, record._id);
    recalculateOvertimeBuckets(record, sameMonth);

    // Re-assert post-penalty OT after bucket carve-outs for non-mgmt days stay correct
    // (recalculateOvertimeBuckets only reallocates surplus; raw should stay = calculated)
    if (!isHoliday) {
      record.rawOvertimeSurplusMinutes = correctOT;
      // Keep general after carving management/early repayment
      // recalculateOvertimeBuckets already set generalOvertimeMinutes from raw
    }

    await record.save();
    if (sameMonth.length) await Promise.all(sameMonth.map((r) => r.save()));

    updated++;
    if (samples.length < 25) {
      samples.push({
        date: dateStr,
        userId: String(uid).slice(-6),
        penaltyMin: Math.round((flags.penaltySeconds || 0) / 60),
        beforeOT,
        afterOT: record.generalOvertimeMinutes || 0,
        correctOT,
      });
    }
  }

  console.log(`Updated: ${updated} | Already correct: ${unchanged}\n`);
  console.log('Samples:');
  samples.forEach((s) =>
    console.log(
      `  ${s.date} …${s.userId}: OT ${s.beforeOT}m → ${s.afterOT}m (expected ${s.correctOT}m, penalty ${s.penaltyMin}m)`
    )
  );

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
