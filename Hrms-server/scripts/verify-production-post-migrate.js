import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });
const db = mongoose.connection.db;

console.log('=== Post-migration integrity check ===\n');

const users = await db.collection('users').find({ role: 'Employee' }).project({ name: 1, email: 1, paidLeaveAccess: 1, bonds: 1 }).toArray();
console.log(`Employees: ${users.length} (all have paidLeaveAccess: ${users.every(u => u.paidLeaveAccess !== undefined)})`);

const pendingEarly = await db.collection('attendances').find({
  $or: [
    { earlyLogoutRequest: 'Pending' },
    { 'earlyOvertime.requestStatus': 'Pending' }
  ]
}).project({ date: 1, earlyLogoutRequest: 1, 'earlyOvertime.requestStatus': 1, userId: 1 }).limit(5).toArray();

console.log(`\nPending early checkout records: ${pendingEarly.length} (sample)`);
pendingEarly.forEach(r => {
  console.log(`  date=${r.date}, earlyLogout=${r.earlyLogoutRequest}, earlyOT.requestStatus=${r.earlyOvertime?.requestStatus}`);
});

const otSample = await db.collection('attendances').find({
  generalOvertimeMinutes: { $gt: 0 }
}).project({
  date: 1,
  generalOvertimeMinutes: 1,
  rawOvertimeSurplusMinutes: 1,
  'overtimeRequest.completedMinutes': 1,
  managementOvertime: 1,
  earlyOvertime: 1,
  earlyOvertimeRepayment: 1
}).limit(3).toArray();

console.log('\nOvertime sample (fields preserved):');
otSample.forEach(r => {
  console.log(`  ${r.date}: general=${r.generalOvertimeMinutes}, raw=${r.rawOvertimeSurplusMinutes}, legacy=${r.overtimeRequest?.completedMinutes}, hasMgmt=${!!r.managementOvertime}, hasEarly=${!!r.earlyOvertime}, hasRepay=${!!r.earlyOvertimeRepayment}`);
});

const missingAny = await db.collection('attendances').countDocuments({
  $or: [
    { managementOvertime: { $exists: false } },
    { earlyOvertime: { $exists: false } },
    { earlyOvertimeRepayment: { $exists: false } }
  ]
});
console.log(`\nRecords still missing new OT fields: ${missingAny}`);

await mongoose.disconnect();
console.log('\nIntegrity check complete.');
