/**
 * One-time fix:
 * 1. Remove company holiday on 2026-07-11
 * 2. Add company holiday on 2026-07-08
 * 3. Recalculate Jul 11 attendance as normal workday (remove holiday work / holiday OT)
 * 4. Recalculate Jul 8 attendance as holiday work for anyone who checked in
 *
 * Run: node scripts/fix_jul8_jul11_holiday.js
 */
import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Attendance from '../models/Attendance.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import LeaveRequest from '../models/LeaveRequest.js';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REMOVE_DATE = '2026-07-11';
const ADD_DATE = '2026-07-08';
const ADD_DESCRIPTION = 'Holiday';

const formatMins = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;

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

/**
 * Force-recalculate flags + OT for a date.
 * When converting off holiday work, legacy OT must be overwritten (not max()'d).
 */
async function recalculateRecordsForDate(dateStr, isHolidayWork, systemSettings) {
  const records = await Attendance.find({ date: dateStr });
  const userIds = records.map((r) => r.userId);

  const leaves = userIds.length
    ? await LeaveRequest.find({
        userId: { $in: userIds },
        startDate: dateStr,
        status: 'Approved',
        category: { $in: ['Half Day Leave', 'Extra Time Leave'] },
      }).lean()
    : [];

  const leaveMap = {};
  for (const leave of leaves) {
    leaveMap[`${leave.userId.toString()}-${leave.category}`] = leave;
  }

  const summary = [];
  let updated = 0;

  for (const record of records) {
    const uid = record.userId.toString();
    const before = {
      low: record.lowTimeFlag,
      extra: record.extraTimeFlag,
      generalOT: record.generalOvertimeMinutes || 0,
      otReq: record.overtimeRequest?.completedMinutes || 0,
      penalty: record.penaltySeconds || 0,
      late: record.lateCheckIn,
      worked: record.totalWorkedSeconds || 0,
    };

    // Skip empty / no-checkin records (unless manual hours exist)
    const hasManual = (record.manualHours || []).length > 0;
    if (!record.checkIn && !hasManual) {
      summary.push({ userId: uid, skipped: 'no check-in' });
      continue;
    }

    const worked = record.checkIn
      ? calculateWorkedSeconds(record, record.checkOut ? record.checkOut.toISOString() : null)
      : 0;
    // If still checked in (no checkout), don't finalize OT flags aggressively
    if (record.checkIn && !record.checkOut && !hasManual) {
      summary.push({ userId: uid, skipped: 'open session (no checkout yet)' });
      continue;
    }

    const hasHalfDay = !!leaveMap[`${uid}-Half Day Leave`];
    const extraTimeLeaveMinutes = getExtraTimeLeaveMinutes(leaveMap[`${uid}-Extra Time Leave`]);
    const isEarlyReleaseDay = hasCheckoutOverrideForDate(systemSettings, dateStr);

    const flags = getFlags(
      worked,
      hasHalfDay,
      extraTimeLeaveMinutes,
      isHolidayWork,
      record.checkIn,
      record.isPenaltyDisabled,
      0,
      dateStr,
      isEarlyReleaseDay,
      resolveLatePenaltyStartTime(systemSettings, dateStr),
      systemSettings?.timezone || 'Asia/Kolkata'
    );

    const adjustedWorked = isHolidayWork ? worked : Math.max(0, worked - (flags.penaltySeconds || 0));

    record.lowTimeFlag = flags.lowTime;
    record.extraTimeFlag = flags.extraTime;
    record.lateCheckIn = flags.lateCheckIn || false;
    record.penaltySeconds = flags.penaltySeconds || 0;
    record.totalWorkedSeconds = adjustedWorked;

    // Clear inflated holiday OT before sync so normal-day calc is authoritative
    const calculatedMins = flags.completedGeneralOvertime ?? flags.completedOvertime ?? 0;
    record.generalOvertimeMinutes = calculatedMins;
    record.rawOvertimeSurplusMinutes = calculatedMins;

    if (record.overtimeRequest) {
      if (calculatedMins > 0 && flags.extraTime) {
        record.overtimeRequest.durationMinutes = calculatedMins;
        record.overtimeRequest.completedMinutes = calculatedMins;
        record.overtimeRequest.status = 'Approved';
        record.overtimeRequest.reason =
          record.overtimeRequest.reason ||
          (isHolidayWork ? 'Holiday work (all hours overtime)' : 'Automatic (worked beyond 8h 15m)');
      } else {
        // Remove holiday-inflated OT that no longer applies
        record.overtimeRequest.completedMinutes = 0;
        record.overtimeRequest.durationMinutes = 0;
        if (record.overtimeRequest.status === 'Approved') {
          record.overtimeRequest.status = 'None';
        }
      }
    } else if (calculatedMins > 0 && flags.extraTime) {
      record.overtimeRequest = {
        reason: isHolidayWork
          ? 'Holiday work (all hours overtime)'
          : 'Automatic (worked beyond 8h 15m)',
        durationMinutes: calculatedMins,
        status: 'Approved',
        requestedAt: new Date(),
        approvedAt: new Date(),
        completedMinutes: calculatedMins,
        unfulfilledMinutes: 0,
      };
    }

    const workedMinutes =
      Math.floor(adjustedWorked / 60) + extraTimeLeaveMinutes;

    syncAllOvertimeRecords(record, flags, {
      isHalfDayApproved: hasHalfDay,
      earlyLogoutApproved: record.earlyLogoutRequest === 'Approved',
      workedMinutes,
    });

    // Ensure final OT equals recalculated value (syncAllOvertimeRecords may max with legacy)
    record.generalOvertimeMinutes = calculatedMins;
    record.rawOvertimeSurplusMinutes = calculatedMins;
    if (record.overtimeRequest) {
      record.overtimeRequest.completedMinutes = calculatedMins;
      record.overtimeRequest.durationMinutes = calculatedMins;
      if (calculatedMins <= 0) {
        record.overtimeRequest.status = 'None';
      }
    }
    record.extraTimeFlag =
      calculatedMins > 0 ||
      (record.managementOvertime?.status === 'Approved' &&
        (record.managementOvertime?.completedMinutes || 0) > 0);

    const sameMonthDeficitRecords = await getSameMonthDeficitRecords(
      record.userId,
      dateStr,
      record._id
    );
    recalculateOvertimeBuckets(record, sameMonthDeficitRecords);

    // After bucket recalc, on holiday work keep full minutes as general OT
    // (recalculateOvertimeBuckets may carve management/early OT — that's fine)
    if (isHolidayWork) {
      // Holiday: entire day is OT; ensure extraTimeFlag stays true when work exists
      if (worked > 0) record.extraTimeFlag = true;
    }

    await record.save();
    if (sameMonthDeficitRecords.length > 0) {
      await Promise.all(sameMonthDeficitRecords.map((r) => r.save()));
    }

    updated++;
    summary.push({
      userId: uid,
      before,
      after: {
        low: record.lowTimeFlag,
        extra: record.extraTimeFlag,
        generalOT: record.generalOvertimeMinutes || 0,
        otReq: record.overtimeRequest?.completedMinutes || 0,
        penalty: record.penaltySeconds || 0,
        late: record.lateCheckIn,
        worked: Math.round(record.totalWorkedSeconds || 0),
      },
    });
  }

  return { total: records.length, updated, summary };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  console.log('Connected to MongoDB.\n');

  const systemSettings = await SystemSettings.getSettings();

  // --- Step 1: Remove Jul 11 holiday ---
  console.log('=== Step 1: Remove holiday', REMOVE_DATE, '===');
  const removed = await CompanyHoliday.findOneAndDelete({ date: REMOVE_DATE });
  if (removed) {
    console.log(`Removed: ${removed.date} (${removed.description})`);
  } else {
    console.log(`No holiday found for ${REMOVE_DATE} (already removed?)`);
  }

  // --- Step 2: Add Jul 8 holiday ---
  console.log('\n=== Step 2: Add holiday', ADD_DATE, '===');
  let added = await CompanyHoliday.findOne({ date: ADD_DATE });
  if (added) {
    console.log(`Already exists: ${added.date} (${added.description})`);
  } else {
    added = await CompanyHoliday.create({
      date: ADD_DATE,
      description: ADD_DESCRIPTION,
      createdByName: 'System',
      createdByRole: 'Admin',
    });
    console.log(`Created: ${added.date} (${added.description})`);
  }

  // --- Step 3: Recalc Jul 11 as normal day (remove holiday work) ---
  console.log('\n=== Step 3: Recalculate', REMOVE_DATE, 'as NORMAL day ===');
  const jul11 = await recalculateRecordsForDate(REMOVE_DATE, false, systemSettings);
  console.log(`Records: ${jul11.total}, Updated: ${jul11.updated}`);
  for (const row of jul11.summary) {
    if (row.skipped) {
      console.log(`  skip ${row.userId}: ${row.skipped}`);
      continue;
    }
    console.log(
      `  ${row.userId}: OT ${row.before.generalOT}m → ${row.after.generalOT}m ` +
        `(${formatMins(row.before.generalOT)} → ${formatMins(row.after.generalOT)}) | ` +
        `extra ${row.before.extra}→${row.after.extra} | low ${row.before.low}→${row.after.low} | ` +
        `penalty ${row.before.penalty}→${row.after.penalty} | late ${row.before.late}→${row.after.late}`
    );
  }

  // --- Step 4: Recalc Jul 8 as holiday work ---
  console.log('\n=== Step 4: Recalculate', ADD_DATE, 'as HOLIDAY work ===');
  const jul8 = await recalculateRecordsForDate(ADD_DATE, true, systemSettings);
  console.log(`Records: ${jul8.total}, Updated: ${jul8.updated}`);
  if (jul8.total === 0) {
    console.log('  No attendance on Jul 8. Holiday is set; future check-ins will count as holiday work.');
  } else {
    for (const row of jul8.summary) {
      if (row.skipped) {
        console.log(`  skip ${row.userId}: ${row.skipped}`);
        continue;
      }
      console.log(
        `  ${row.userId}: OT ${row.before.generalOT}m → ${row.after.generalOT}m | ` +
          `extra ${row.before.extra}→${row.after.extra}`
      );
    }
  }

  // --- Verify holidays ---
  console.log('\n=== Verify July holidays ===');
  const julyHolidays = await CompanyHoliday.find({
    date: { $gte: '2026-07-01', $lte: '2026-07-31' },
  }).sort({ date: 1 });
  julyHolidays.forEach((h) => console.log(`  ${h.date} | ${h.description}`));

  const has8 = julyHolidays.some((h) => h.date === ADD_DATE);
  const has11 = julyHolidays.some((h) => h.date === REMOVE_DATE);
  console.log(`\nJul 8 holiday present: ${has8}`);
  console.log(`Jul 11 holiday present: ${has11}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
