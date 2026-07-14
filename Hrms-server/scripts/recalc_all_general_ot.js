/**
 * Recalculate general OT for all completed (and incomplete) attendance records so
 * values match worked time after late penalty. Fixes inflated/manual stale OT.
 *
 * Run: node scripts/recalc_all_general_ot.js [YYYY-MM]
 * Example: node scripts/recalc_all_general_ot.js 2026-07
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

const monthFilter = process.argv[2] || null;

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

const clearAutomaticOt = (record) => {
  record.generalOvertimeMinutes = 0;
  record.rawOvertimeSurplusMinutes = 0;
  if (record.overtimeRequest) {
    const reason = record.overtimeRequest.reason || '';
    const isAutomatic =
      !reason ||
      reason.includes('Automatic') ||
      reason.includes('worked beyond') ||
      reason.includes('Holiday work');
    if (isAutomatic) {
      record.overtimeRequest.completedMinutes = 0;
      record.overtimeRequest.durationMinutes = 0;
      if (record.overtimeRequest.status === 'Approved') {
        record.overtimeRequest.status = 'None';
      }
    }
  }
  record.extraTimeFlag =
    (record.managementOvertime?.status === 'Approved' &&
      (record.managementOvertime?.completedMinutes || 0) > 0) ||
    false;
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  console.log('Connected.\n');

  const settings = await SystemSettings.getSettings();
  const tz = settings?.timezone || 'Asia/Kolkata';
  const holidaySet = new Set(
    (await CompanyHoliday.find({}, 'date').lean()).map((h) => h.date)
  );

  const query = {};
  if (monthFilter) query.date = { $regex: `^${monthFilter}` };

  const records = await Attendance.find(query).sort({ date: 1 });
  console.log(`Scanning ${records.length} record(s)${monthFilter ? ` for ${monthFilter}` : ''}...\n`);

  let updated = 0;
  let unchanged = 0;
  const samples = [];

  for (const record of records) {
    const beforeOT = record.generalOvertimeMinutes || 0;
    const beforeOtReq = record.overtimeRequest?.completedMinutes || 0;

    // Incomplete day → no automatic general OT
    if (!record.checkIn || !record.checkOut) {
      if (beforeOT > 0 || beforeOtReq > 0) {
        clearAutomaticOt(record);
        await record.save();
        updated++;
        if (samples.length < 30) {
          samples.push({
            date: record.date,
            user: String(record.userId).slice(-6),
            beforeOT,
            afterOT: 0,
            note: 'cleared (no checkout)',
          });
        }
      } else {
        unchanged++;
      }
      continue;
    }

    const isHoliday = holidaySet.has(record.date);
    const leaves = await LeaveRequest.find({
      userId: record.userId,
      startDate: record.date,
      status: 'Approved',
      category: { $in: ['Half Day Leave', 'Extra Time Leave'] },
    }).lean();
    const hasHalfDay = leaves.some((l) => l.category === 'Half Day Leave');
    const etl = leaves.find((l) => l.category === 'Extra Time Leave');
    const extraTimeLeaveMinutes = getExtraTimeLeaveMinutes(etl);
    const isEarlyReleaseDay = hasCheckoutOverrideForDate(settings, record.date);

    const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());
    const flags = getFlags(
      worked,
      hasHalfDay,
      extraTimeLeaveMinutes,
      isHoliday,
      record.checkIn,
      record.isPenaltyDisabled,
      0,
      record.date,
      isEarlyReleaseDay,
      resolveLatePenaltyStartTime(settings, record.date),
      tz
    );

    const correctOT = flags.completedGeneralOvertime ?? flags.completedOvertime ?? 0;
    const adjustedWorked = isHoliday
      ? worked
      : Math.max(0, worked - (flags.penaltySeconds || 0));

    const alreadyOk =
      beforeOT === correctOT &&
      beforeOtReq === correctOT &&
      Math.abs((record.totalWorkedSeconds || 0) - adjustedWorked) < 1 &&
      (record.penaltySeconds || 0) === (flags.penaltySeconds || 0);

    if (alreadyOk) {
      unchanged++;
      continue;
    }

    const prevLow = record.lowTimeFlag;
    const prevExtra = record.extraTimeFlag;

    record.totalWorkedSeconds = adjustedWorked;
    record.penaltySeconds = flags.penaltySeconds || 0;
    record.lateCheckIn = flags.lateCheckIn || false;
    record.generalOvertimeMinutes = correctOT;
    record.rawOvertimeSurplusMinutes = correctOT;

    syncAllOvertimeRecords(record, flags, {
      isHalfDayApproved: hasHalfDay,
      earlyLogoutApproved: record.earlyLogoutRequest === 'Approved',
      workedMinutes: Math.floor(adjustedWorked / 60) + extraTimeLeaveMinutes,
    });

    const sameMonth = await getSameMonthDeficitRecords(record.userId, record.date, record._id);
    recalculateOvertimeBuckets(record, sameMonth);
    record.rawOvertimeSurplusMinutes = correctOT;

    // Preserve admin-forced status flags
    if (record.isManualFlag) {
      record.lowTimeFlag = prevLow;
      record.extraTimeFlag = prevExtra;
    }

    await record.save();
    if (sameMonth.length) await Promise.all(sameMonth.map((r) => r.save()));

    updated++;
    if (samples.length < 40) {
      samples.push({
        date: record.date,
        user: String(record.userId).slice(-6),
        beforeOT,
        afterOT: record.generalOvertimeMinutes || 0,
        note: `penalty ${Math.round((flags.penaltySeconds || 0) / 60)}m`,
      });
    }
  }

  console.log(`Updated: ${updated} | Unchanged: ${unchanged}\n`);
  samples.forEach((s) =>
    console.log(`  ${s.date} …${s.user}: ${s.beforeOT}m → ${s.afterOT}m (${s.note})`)
  );

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
