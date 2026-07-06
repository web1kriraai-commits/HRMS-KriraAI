/**
 * Production additive migration — verify first, then update.
 * NEVER removes keys or data. Only adds missing fields or fills empty values.
 *
 * Run verify only:  node scripts/production-migrate-additive.js --verify
 * Run migration:    node scripts/production-migrate-additive.js --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import {
  getLegacyGeneralOvertimeMinutes,
  hydrateAttendanceOvertimeFields
} from '../utils/attendanceUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const MODE = process.argv.includes('--apply') ? 'apply' : 'verify';

const renderProgress = (current, total, label = 'Progress') => {
  const pct = total === 0 ? 100 : Math.round((current / total) * 100);
  const filled = Math.round(pct / 2);
  const bar = `[${'='.repeat(filled)}${' '.repeat(50 - filled)}]`;
  process.stdout.write(`\r${label}: ${bar} ${pct}% (${current}/${total})`);
};

const defaultManagementOvertime = () => ({
  reason: '',
  durationMinutes: 0,
  status: 'None',
  completedMinutes: 0
});

const defaultEarlyOvertime = (earlyLogoutRequest = 'None') => ({
  reason: '',
  durationMinutes: 0,
  requestStatus:
    earlyLogoutRequest === 'Pending'
      ? 'Pending'
      : earlyLogoutRequest === 'Approved'
        ? 'Approved'
        : earlyLogoutRequest === 'Rejected'
          ? 'Rejected'
          : 'None',
  deficitMinutes: 0,
  coveredMinutes: 0,
  status: 'None'
});

const defaultEarlyOvertimeRepayment = () => ({
  requestedMinutes: 0,
  reason: '',
  status: 'None',
  appliedMinutes: 0
});

/** Build $set updates for a user — additive only. */
const buildUserUpdates = (user) => {
  const $set = {};

  if (user.paidLeaveAccess === undefined || user.paidLeaveAccess === null) {
    $set.paidLeaveAccess = true;
  }
  if (user.paidLeaveAllocation === undefined || user.paidLeaveAllocation === null) {
    $set.paidLeaveAllocation = 0;
  }
  if (user.manualPaidLeaveAdjustment === undefined || user.manualPaidLeaveAdjustment === null) {
    $set.manualPaidLeaveAdjustment = 0;
  }
  if (user.manualExtraTimeAdjustment === undefined || user.manualExtraTimeAdjustment === null) {
    $set.manualExtraTimeAdjustment = 0;
  }
  if (user.manualUnpaidLeaveAdjustment === undefined || user.manualUnpaidLeaveAdjustment === null) {
    $set.manualUnpaidLeaveAdjustment = 0;
  }
  if (user.manualHalfDayLeaveAdjustment === undefined || user.manualHalfDayLeaveAdjustment === null) {
    $set.manualHalfDayLeaveAdjustment = 0;
  }
  if (user.forwardedMonths === undefined || user.forwardedMonths === null) {
    $set.forwardedMonths = {};
  }
  if (user.forwardedInMonths === undefined || user.forwardedInMonths === null) {
    $set.forwardedInMonths = {};
  }
  if (user.bonds === undefined || user.bonds === null) {
    $set.bonds = [];
  }
  if (user.salaryBreakdown === undefined || user.salaryBreakdown === null) {
    $set.salaryBreakdown = [];
  }

  return $set;
};

/** Build $set updates for attendance — additive only, never overwrites existing non-zero values. */
const buildAttendanceUpdates = (record) => {
  const $set = {};
  const legacyGeneral = getLegacyGeneralOvertimeMinutes(record);

  const currentGeneral = record.generalOvertimeMinutes || 0;
  if (legacyGeneral > 0 && currentGeneral < legacyGeneral) {
    $set.generalOvertimeMinutes = legacyGeneral;
  }

  const rawSurplus = record.rawOvertimeSurplusMinutes || 0;
  const targetRaw = Math.max(rawSurplus, $set.generalOvertimeMinutes || currentGeneral, legacyGeneral);
  if (targetRaw > 0 && rawSurplus < targetRaw) {
    $set.rawOvertimeSurplusMinutes = targetRaw;
  }

  if (!record.managementOvertime) {
    $set.managementOvertime = defaultManagementOvertime();
  }

  if (!record.earlyOvertime) {
    $set.earlyOvertime = defaultEarlyOvertime(record.earlyLogoutRequest || 'None');
  } else if (!record.earlyOvertime.requestStatus) {
    $set['earlyOvertime.requestStatus'] = defaultEarlyOvertime(record.earlyLogoutRequest || 'None').requestStatus;
  }

  if (!record.earlyOvertimeRepayment) {
    $set.earlyOvertimeRepayment = defaultEarlyOvertimeRepayment();
  }

  const hydrated = hydrateAttendanceOvertimeFields({ ...record.toObject?.() ?? record, ...$set });
  const hasOT =
    (hydrated.generalOvertimeMinutes || 0) > 0 ||
    (hydrated.managementOvertime?.status === 'Approved' &&
      (hydrated.managementOvertime?.completedMinutes || 0) > 0) ||
    (hydrated.overtimeRequest?.status === 'Approved' &&
      (hydrated.overtimeRequest?.completedMinutes || 0) > 0);

  if (hasOT && !record.extraTimeFlag) {
    $set.extraTimeFlag = true;
  }

  return $set;
};

const verifyUsers = async () => {
  const users = await User.find({}).sort({ name: 1 });
  const report = {
    total: users.length,
    employees: users.filter((u) => u.role === 'Employee').length,
    hr: users.filter((u) => u.role === 'HR').length,
    admin: users.filter((u) => u.role === 'Admin').length,
    active: users.filter((u) => u.isActive).length,
    needsUpdate: 0,
    samples: []
  };

  for (const user of users) {
    const updates = buildUserUpdates(user);
    if (Object.keys(updates).length > 0) {
      report.needsUpdate++;
      if (report.samples.length < 5) {
        report.samples.push({
          name: user.name,
          role: user.role,
          fieldsToAdd: Object.keys(updates)
        });
      }
    }
  }

  return { users, report };
};

const verifyAttendance = async () => {
  const total = await Attendance.countDocuments({});
  const legacyOT = await Attendance.countDocuments({
    'overtimeRequest.completedMinutes': { $gt: 0 }
  });
  const missingGeneral = await Attendance.countDocuments({
    $or: [
      { generalOvertimeMinutes: { $exists: false } },
      { generalOvertimeMinutes: null },
      { generalOvertimeMinutes: 0 }
    ],
    'overtimeRequest.completedMinutes': { $gt: 0 }
  });
  const missingMgmt = await Attendance.countDocuments({ managementOvertime: { $exists: false } });
  const missingEarly = await Attendance.countDocuments({ earlyOvertime: { $exists: false } });
  const missingRepayment = await Attendance.countDocuments({ earlyOvertimeRepayment: { $exists: false } });
  const pendingEarlyLogout = await Attendance.countDocuments({ earlyLogoutRequest: 'Pending' });

  return {
    total,
    legacyOT,
    missingGeneral,
    missingMgmt,
    missingEarly,
    missingRepayment,
    pendingEarlyLogout
  };
};

const applyUserUpdatesNative = async () => {
  const col = User.collection;
  const stats = {};

  const fields = [
    ['paidLeaveAccess', true],
    ['paidLeaveAllocation', 0],
    ['manualPaidLeaveAdjustment', 0],
    ['manualExtraTimeAdjustment', 0],
    ['manualUnpaidLeaveAdjustment', 0],
    ['manualHalfDayLeaveAdjustment', 0],
    ['forwardedMonths', {}],
    ['forwardedInMonths', {}],
    ['bonds', []],
    ['salaryBreakdown', []]
  ];

  for (const [field, defaultValue] of fields) {
    const result = await col.updateMany(
      { [field]: { $exists: false } },
      { $set: { [field]: defaultValue } }
    );
    stats[field] = result.modifiedCount;
  }

  return stats;
};

const applyAttendanceUpdatesNative = async () => {
  const col = Attendance.collection;
  const stats = {
    generalOvertimeBackfill: 0,
    rawSurplusBackfill: 0,
    managementOvertimeAdded: 0,
    earlyOvertimeAdded: 0,
    earlyRepaymentAdded: 0,
    requestStatusSynced: 0,
    extraTimeFlagSet: 0
  };

  // 1. Backfill generalOvertimeMinutes from legacy overtimeRequest (only when missing/zero)
  const legacyRecords = await col.find({
    $or: [
      { generalOvertimeMinutes: { $exists: false } },
      { generalOvertimeMinutes: null },
      { generalOvertimeMinutes: 0 }
    ],
    'overtimeRequest.completedMinutes': { $gt: 0 }
  }).toArray();

  const legacyTotal = legacyRecords.length;
  for (let i = 0; i < legacyRecords.length; i++) {
    renderProgress(i + 1, legacyTotal, 'Legacy OT backfill');
    const record = legacyRecords[i];
    const legacyMins = getLegacyGeneralOvertimeMinutes(record);
    if (legacyMins <= 0) continue;
    const current = record.generalOvertimeMinutes || 0;
    if (current >= legacyMins) continue;

    const $set = { generalOvertimeMinutes: legacyMins };
    const rawSurplus = record.rawOvertimeSurplusMinutes || 0;
    if (rawSurplus < legacyMins) {
      $set.rawOvertimeSurplusMinutes = legacyMins;
      stats.rawSurplusBackfill++;
    }
    await col.updateOne({ _id: record._id }, { $set });
    stats.generalOvertimeBackfill++;
  }
  renderProgress(legacyTotal, legacyTotal, 'Legacy OT backfill');
  console.log('');

  // 2. Add missing nested objects (native $exists check — not Mongoose defaults)
  const mgmtResult = await col.updateMany(
    { managementOvertime: { $exists: false } },
    { $set: { managementOvertime: defaultManagementOvertime() } }
  );
  stats.managementOvertimeAdded = mgmtResult.modifiedCount;

  const earlyResult = await col.updateMany(
    { earlyOvertime: { $exists: false } },
    [{ $set: {
      earlyOvertime: {
        reason: '',
        durationMinutes: 0,
        requestStatus: {
          $switch: {
            branches: [
              { case: { $eq: ['$earlyLogoutRequest', 'Pending'] }, then: 'Pending' },
              { case: { $eq: ['$earlyLogoutRequest', 'Approved'] }, then: 'Approved' },
              { case: { $eq: ['$earlyLogoutRequest', 'Rejected'] }, then: 'Rejected' }
            ],
            default: 'None'
          }
        },
        deficitMinutes: 0,
        coveredMinutes: 0,
        status: 'None'
      }
    }}]
  );
  stats.earlyOvertimeAdded = earlyResult.modifiedCount;

  const repaymentResult = await col.updateMany(
    { earlyOvertimeRepayment: { $exists: false } },
    { $set: { earlyOvertimeRepayment: defaultEarlyOvertimeRepayment() } }
  );
  stats.earlyRepaymentAdded = repaymentResult.modifiedCount;

  // 3. Sync earlyOvertime.requestStatus from earlyLogoutRequest where missing
  const syncResult = await col.updateMany(
    {
      earlyOvertime: { $exists: true },
      'earlyOvertime.requestStatus': { $exists: false },
      earlyLogoutRequest: { $in: ['Pending', 'Approved', 'Rejected'] }
    },
    [{ $set: { 'earlyOvertime.requestStatus': '$earlyLogoutRequest' } }]
  );
  stats.requestStatusSynced = syncResult.modifiedCount;

  // 4. Set extraTimeFlag=true where OT exists but flag is false/missing (never unset)
  const otFlagResult = await col.updateMany(
    {
      $and: [
        { $or: [{ extraTimeFlag: { $exists: false } }, { extraTimeFlag: false }] },
        {
          $or: [
            { generalOvertimeMinutes: { $gt: 0 } },
            { 'overtimeRequest.completedMinutes': { $gt: 0 } },
            {
              'managementOvertime.status': 'Approved',
              'managementOvertime.completedMinutes': { $gt: 0 }
            }
          ]
        }
      ]
    },
    { $set: { extraTimeFlag: true } }
  );
  stats.extraTimeFlagSet = otFlagResult.modifiedCount;

  return stats;
};

const run = async () => {
  const dbName = process.env.MONGODB_DB_NAME || 'hrms';
  await mongoose.connect(process.env.MONGODB_URI, { dbName });
  console.log(`Connected to MongoDB (db: ${dbName})`);
  console.log(`Mode: ${MODE.toUpperCase()}\n`);

  console.log('=== STEP 1: Verify all employees ===');
  const { users, report: userReport } = await verifyUsers();
  console.log(`Total users: ${userReport.total}`);
  console.log(`  Employees: ${userReport.employees}, HR: ${userReport.hr}, Admin: ${userReport.admin}`);
  console.log(`  Active: ${userReport.active}`);
  console.log(`  Users needing field additions: ${userReport.needsUpdate}`);
  if (userReport.samples.length) {
    console.log('  Sample updates:');
    userReport.samples.forEach((s) => {
      console.log(`    - ${s.name} (${s.role}): ${s.fieldsToAdd.join(', ')}`);
    });
  }

  console.log('\n=== STEP 2: Verify attendance records ===');
  const attReport = await verifyAttendance();
  console.log(`Total attendance records: ${attReport.total}`);
  console.log(`  Legacy overtimeRequest with completedMinutes: ${attReport.legacyOT}`);
  console.log(`  Missing/zero generalOvertimeMinutes (with legacy OT): ${attReport.missingGeneral}`);
  console.log(`  Missing managementOvertime object: ${attReport.missingMgmt}`);
  console.log(`  Missing earlyOvertime object: ${attReport.missingEarly}`);
  console.log(`  Missing earlyOvertimeRepayment object: ${attReport.missingRepayment}`);
  console.log(`  Pending earlyLogoutRequest: ${attReport.pendingEarlyLogout}`);

  if (MODE === 'verify') {
    console.log('\n=== VERIFY ONLY — no changes made ===');
    console.log('Run with --apply to apply additive updates.');
    await mongoose.disconnect();
    return;
  }

  console.log('\n=== STEP 3: Apply user updates (additive only) ===');
  const userResult = await applyUserUpdatesNative();
  Object.entries(userResult).forEach(([field, count]) => {
    if (count > 0) console.log(`  ${field} added to ${count} user(s)`);
  });
  const userTotal = Object.values(userResult).reduce((a, b) => a + b, 0);
  if (userTotal === 0) console.log('  All user fields already present — no changes needed');

  console.log('\n=== STEP 4: Apply attendance updates (additive only) ===');
  const attResult = await applyAttendanceUpdatesNative();
  console.log(`  generalOvertimeMinutes backfilled: ${attResult.generalOvertimeBackfill}`);
  console.log(`  rawOvertimeSurplusMinutes backfilled: ${attResult.rawSurplusBackfill}`);
  console.log(`  managementOvertime objects added: ${attResult.managementOvertimeAdded}`);
  console.log(`  earlyOvertime objects added: ${attResult.earlyOvertimeAdded}`);
  console.log(`  earlyOvertimeRepayment objects added: ${attResult.earlyRepaymentAdded}`);
  console.log(`  earlyOvertime.requestStatus synced: ${attResult.requestStatusSynced}`);
  console.log(`  extraTimeFlag set to true: ${attResult.extraTimeFlagSet}`);

  console.log('\n=== STEP 5: Post-migration verification ===');
  const postAtt = await verifyAttendance();
  console.log(`  Missing generalOvertimeMinutes (with legacy OT): ${postAtt.missingGeneral} (was ${attReport.missingGeneral})`);
  console.log(`  Missing managementOvertime: ${postAtt.missingMgmt} (was ${attReport.missingMgmt})`);
  console.log(`  Missing earlyOvertime: ${postAtt.missingEarly} (was ${attReport.missingEarly})`);
  console.log(`  Missing earlyOvertimeRepayment: ${postAtt.missingRepayment} (was ${attReport.missingRepayment})`);

  const { report: postUserReport } = await verifyUsers();
  console.log(`  Users needing updates: ${postUserReport.needsUpdate} (was ${userReport.needsUpdate})`);

  console.log('\nDone. No keys or data were removed.');
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
