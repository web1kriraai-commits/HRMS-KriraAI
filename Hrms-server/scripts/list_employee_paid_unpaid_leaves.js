import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const getLocalYmd = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const calcWorkingDays = (start, end, holidaySet) => {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return 0;

  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const ds = getLocalYmd(cur);
    if (cur.getDay() !== 0 && !holidaySet.has(ds)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

const effectiveCategory = (leave) => {
  const cat = leave.category || '';
  if (cat !== 'Half Day Leave') return cat;
  const reason = leave.reason || '';
  if (reason.includes('[Extra Time Leave]')) return 'Extra Time Leave';
  if (reason.includes('[Unpaid Leave]')) return 'Unpaid Leave';
  return 'Paid Leave';
};

const leaveDays = (leave, holidaySet) => {
  if (leave.category === 'Half Day Leave') return 0.5;
  return calcWorkingDays(leave.startDate, leave.endDate, holidaySet);
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  const db = mongoose.connection.db;

  const users = await db
    .collection('users')
    .find({ role: { $in: ['Employee', 'HR'] }, isActive: { $ne: false } })
    .sort({ name: 1 })
    .toArray();

  const leaves = await db
    .collection('leaverequests')
    .find({ status: 'Approved' })
    .sort({ startDate: 1 })
    .toArray();

  const holidays = await db.collection('holidays').find({}).toArray();
  const holidaySet = new Set(holidays.map((h) => (h.date || '').split('T')[0]));

  const report = users.map((user) => {
    const userId = user._id.toString();
    const userLeaves = leaves.filter((l) => l.userId?.toString() === userId);

    const paidLeaves = [];
    const unpaidLeaves = [];

    let paidDays = 0;
    let unpaidDays = 0;

    for (const leave of userLeaves) {
      const category = effectiveCategory(leave);
      const days = leaveDays(leave, holidaySet);
      const entry = {
        startDate: leave.startDate,
        endDate: leave.endDate,
        days,
        category: leave.category,
        reason: (leave.reason || '').trim(),
      };

      if (category === 'Paid Leave') {
        paidDays += days;
        paidLeaves.push(entry);
      } else if (category === 'Unpaid Leave') {
        unpaidDays += days;
        unpaidLeaves.push(entry);
      }
    }

    paidDays += user.manualPaidLeaveAdjustment || 0;
    paidDays += user.manualHalfDayLeaveAdjustment || 0;
    unpaidDays += user.manualUnpaidLeaveAdjustment || 0;

    return {
      id: userId,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      paidDays,
      unpaidDays,
      totalLeaveDays: paidDays + unpaidDays,
      paidLeaves,
      unpaidLeaves,
    };
  });

  const withAnyLeave = report.filter(
    (r) => r.paidDays > 0 || r.unpaidDays > 0 || r.paidLeaves.length || r.unpaidLeaves.length
  );

  console.log('\n=== EMPLOYEE PAID & UNPAID LEAVE LIST (Approved) ===\n');
  console.log(
    'Name'.padEnd(28) +
      'Dept'.padEnd(10) +
      'Paid'.padStart(6) +
      'Unpaid'.padStart(8) +
      'Total'.padStart(7)
  );
  console.log('-'.repeat(59));

  for (const row of report) {
    console.log(
      row.name.slice(0, 27).padEnd(28) +
        (row.department || '-').slice(0, 9).padEnd(10) +
        String(row.paidDays).padStart(6) +
        String(row.unpaidDays).padStart(8) +
        String(row.totalLeaveDays).padStart(7)
    );
  }

  console.log('\n=== DETAILED LEAVE BREAKDOWN ===\n');

  for (const row of withAnyLeave) {
    console.log(`${row.name} (${row.department || 'N/A'}) — ${row.role}`);
    console.log(`  Paid: ${row.paidDays} day(s) | Unpaid: ${row.unpaidDays} day(s)`);

    if (row.paidLeaves.length) {
      console.log('  Paid leave list:');
      for (const l of row.paidLeaves) {
        const range = l.startDate === l.endDate ? l.startDate : `${l.startDate} to ${l.endDate}`;
        console.log(`    - ${range} (${l.days}d) [${l.category}] ${l.reason}`);
      }
    } else {
      console.log('  Paid leave list: none');
    }

    if (row.unpaidLeaves.length) {
      console.log('  Unpaid leave list:');
      for (const l of row.unpaidLeaves) {
        const range = l.startDate === l.endDate ? l.startDate : `${l.startDate} to ${l.endDate}`;
        console.log(`    - ${range} (${l.days}d) [${l.category}] ${l.reason}`);
      }
    } else {
      console.log('  Unpaid leave list: none');
    }

    console.log('');
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        employeeCount: report.length,
        employeesWithLeave: withAnyLeave.length,
        employees: report,
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
