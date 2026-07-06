/**
 * Fix today's late check-in penalties for employees who checked in before 09:15 AM.
 * Restores totalWorkedSeconds and recalculates flags/OT — does not remove any other data.
 *
 * Run: node scripts/fix-today-late-penalty.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import SystemSettings from '../models/SystemSettings.js';
import User from '../models/User.js';
import {
  calculateWorkedSeconds,
  getFlags,
  getDateStrInTimezone,
  getWallClockHM,
  parseCheckInTime,
  resolveLatePenaltyStartTime,
  syncAllOvertimeRecords,
  hasCheckoutOverrideForDate,
  getLegacyGeneralOvertimeMinutes,
  LATE_PENALTY_915_EFFECTIVE_DATE
} from '../utils/attendanceUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const PENALTY_CUTOFF = '09:15'; // only for dates >= LATE_PENALTY_915_EFFECTIVE_DATE

const renderProgress = (current, total, label = 'Fix penalty') => {
  const pct = total === 0 ? 100 : Math.round((current / total) * 100);
  const filled = Math.round(pct / 2);
  const bar = `[${'='.repeat(filled)}${' '.repeat(50 - filled)}]`;
  process.stdout.write(`\r${label}: ${bar} ${pct}% (${current}/${total})`);
};

const formatCheckInTime = (checkIn, timeZone) => {
  const { hour, minute } = getWallClockHM(new Date(checkIn), timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const isBeforeCutoff = (checkIn, cutoff, timeZone) => {
  const { hour, minute } = getWallClockHM(new Date(checkIn), timeZone);
  const { hour: cutoffH, minute: cutoffM } = parseCheckInTime(cutoff);
  const checkInSecs = hour * 3600 + minute * 60;
  const cutoffSecs = cutoffH * 3600 + cutoffM * 60;
  return checkInSecs <= cutoffSecs;
};

const applyFlagsToRecord = (attendance, flags, worked, context = {}) => {
  attendance.totalWorkedSeconds = Math.max(0, worked - (flags.penaltySeconds || 0));
  attendance.lowTimeFlag = flags.lowTime;
  attendance.extraTimeFlag = flags.extraTime;
  attendance.penaltySeconds = flags.penaltySeconds || 0;
  attendance.lateCheckIn = flags.lateCheckIn || false;
  syncAllOvertimeRecords(attendance, flags, {
    isHalfDayApproved: context.isHalfDayApproved ?? false,
    earlyLogoutApproved: context.earlyLogoutApproved ?? (attendance.earlyLogoutRequest === 'Approved'),
    extraTimeLeaveMinutes: context.extraTimeLeaveMinutes ?? 0,
    workedMinutes:
      Math.floor(Math.max(0, worked - (flags.penaltySeconds || 0)) / 60) +
      (context.extraTimeLeaveMinutes ?? 0)
  });
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms'
  });
  console.log('Connected to MongoDB.\n');

  const settings = await SystemSettings.getSettings();
  const timeZone = settings.timezone || 'Asia/Kolkata';
  const today = getDateStrInTimezone(new Date(), timeZone);

  console.log(`Company timezone: ${timeZone}`);
  console.log(`Today: ${today}`);
  console.log(`Late penalty cutoff: ${PENALTY_CUTOFF} from ${LATE_PENALTY_915_EFFECTIVE_DATE} (before uses 09:00)\n`);

  if (settings.latePenaltyStartTime !== PENALTY_CUTOFF) {
    settings.latePenaltyStartTime = PENALTY_CUTOFF;
    await settings.save();
    console.log(`Updated system settings: latePenaltyStartTime → ${PENALTY_CUTOFF}\n`);
  }

  const records = await Attendance.find({
    date: today,
    checkIn: { $exists: true, $ne: null }
  }).populate('userId', 'name');

  console.log(`Today's attendance with check-in: ${records.length}\n`);

  let fixed = 0;
  let skippedLate = 0;
  let skippedNoPenalty = 0;
  const fixedSamples = [];

  for (let i = 0; i < records.length; i++) {
    renderProgress(i + 1, records.length);
    const record = records[i];

    if (!isBeforeCutoff(record.checkIn, PENALTY_CUTOFF, timeZone)) {
      skippedLate++;
      continue;
    }

    const hadPenalty = (record.penaltySeconds || 0) > 0 || record.lateCheckIn;
    if (!hadPenalty) {
      skippedNoPenalty++;
      continue;
    }

    const worked = calculateWorkedSeconds(record, record.checkOut?.toISOString?.() || record.checkOut);

    const hasHalfDay = await LeaveRequest.findOne({
      userId: record.userId?._id || record.userId,
      startDate: record.date,
      category: 'Half Day Leave',
      status: 'Approved'
    });

    const isHoliday = !!(await CompanyHoliday.findOne({ date: record.date }));

    const approvedOT =
      record.managementOvertime?.status === 'Approved'
        ? (record.managementOvertime.completedMinutes || record.managementOvertime.durationMinutes || 0)
        : getLegacyGeneralOvertimeMinutes(record);

    const flags = getFlags(
      worked,
      !!hasHalfDay,
      0,
      isHoliday,
      record.checkIn,
      record.isPenaltyDisabled,
      approvedOT,
      record.date,
      hasCheckoutOverrideForDate(settings, record.date),
      resolveLatePenaltyStartTime(settings, record.date),
      timeZone
    );

    const prevPenalty = record.penaltySeconds || 0;
    const prevWorked = record.totalWorkedSeconds || 0;

    applyFlagsToRecord(record, flags, worked, {
      isHalfDayApproved: !!hasHalfDay,
      earlyLogoutApproved: record.earlyLogoutRequest === 'Approved'
    });

    await record.save();
    fixed++;

    if (fixedSamples.length < 8) {
      fixedSamples.push({
        name: record.userId?.name || 'Unknown',
        checkIn: formatCheckInTime(record.checkIn, timeZone),
        penaltyRemoved: prevPenalty,
        workedBefore: prevWorked,
        workedAfter: record.totalWorkedSeconds
      });
    }
  }

  renderProgress(records.length, records.length);
  console.log('\n');
  console.log('=== Summary ===');
  console.log(`Fixed (penalty removed): ${fixed}`);
  console.log(`Skipped (check-in after ${PENALTY_CUTOFF}): ${skippedLate}`);
  console.log(`Skipped (already no penalty): ${skippedNoPenalty}`);

  if (fixedSamples.length) {
    console.log('\nSample fixes:');
    fixedSamples.forEach((s) => {
      console.log(
        `  ${s.name} | check-in ${s.checkIn} | penalty -${Math.round(s.penaltyRemoved / 60)}m | worked ${s.workedBefore}s → ${s.workedAfter}s`
      );
    });
  }

  console.log('\nDone. No other attendance fields were removed.');
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('\nFix failed:', err);
  process.exit(1);
});
