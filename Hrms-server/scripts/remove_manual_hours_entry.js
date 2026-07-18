/**
 * Remove one specific admin manual-hours entry (and its audit log) without touching other data.
 *
 * Target: 2.3333333333333335 h added 2026-07-09 for Chandrika Dholakiya
 *
 * Run: node scripts/remove_manual_hours_entry.js
 */
import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Attendance from '../models/Attendance.js';
import AuditLog from '../models/AuditLog.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import SystemSettings from '../models/SystemSettings.js';
import {
  calculateWorkedSeconds,
  getFlags,
  resolveLatePenaltyStartTime,
  hasCheckoutOverrideForDate,
  syncAllOvertimeRecords
} from '../utils/attendanceUtils.js';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const USER_ID = '6a4f1e8ea9290d228ba385c7';
const DATE = '2026-07-09';
const MANUAL_HOUR_ID = '6a4f3332a9290d228ba5a042';
const AUDIT_LOG_ID = '6a4f3332a9290d228ba5a047';
const HOURS_TO_REMOVE = 2.3333333333333335;

const applyFlagsToAttendance = (attendance, flags, worked) => {
  attendance.totalWorkedSeconds = Math.max(0, worked - (flags.penaltySeconds || 0));
  attendance.lowTimeFlag = flags.lowTime;
  attendance.extraTimeFlag = flags.extraTime;
  attendance.penaltySeconds = flags.penaltySeconds || 0;
  attendance.lateCheckIn = flags.lateCheckIn || false;
  syncAllOvertimeRecords(attendance, flags, {
    isHalfDayApproved: false,
    earlyLogoutApproved: attendance.earlyLogoutRequest === 'Approved',
    extraTimeLeaveMinutes: 0,
    workedMinutes: Math.floor(Math.max(0, worked - (flags.penaltySeconds || 0)) / 60)
  });
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms'
  });

  const attendance = await Attendance.findOne({
    userId: USER_ID,
    date: DATE
  });

  if (!attendance) {
    throw new Error(`No attendance found for user ${USER_ID} on ${DATE}`);
  }

  const before = attendance.manualHours?.length || 0;
  const target = (attendance.manualHours || []).find(
    (m) =>
      m._id.toString() === MANUAL_HOUR_ID ||
      Math.abs(Number(m.hours) - HOURS_TO_REMOVE) < 0.0001
  );

  if (!target) {
    throw new Error('Target manual-hours entry not found — already removed?');
  }

  console.log('Removing manual hour:', {
    id: target._id.toString(),
    hours: target.hours,
    timestamp: target.timestamp
  });

  attendance.manualHours = attendance.manualHours.filter(
    (m) => m._id.toString() !== target._id.toString()
  );

  const worked = calculateWorkedSeconds(attendance);
  const isHoliday = !!(await CompanyHoliday.findOne({ date: DATE }));
  const hasHalfDay = await LeaveRequest.findOne({
    userId: USER_ID,
    startDate: DATE,
    category: 'Half Day Leave',
    status: 'Approved'
  });
  const settings = await SystemSettings.getSettings();
  const flags = getFlags(
    worked,
    !!hasHalfDay,
    0,
    isHoliday,
    attendance.checkIn,
    attendance.isPenaltyDisabled,
    0,
    DATE,
    hasCheckoutOverrideForDate(settings, DATE),
    resolveLatePenaltyStartTime(settings, DATE),
    settings?.timezone || 'Asia/Kolkata'
  );
  applyFlagsToAttendance(attendance, flags, worked);
  await attendance.save();

  const auditResult = await AuditLog.deleteOne({ _id: AUDIT_LOG_ID });
  if (auditResult.deletedCount === 0) {
    const fallback = await AuditLog.deleteOne({
      action: 'ADMIN_ADD_MANUAL_HOURS',
      details: `Admin added ${HOURS_TO_REMOVE} manual hours for user ${USER_ID} on ${DATE}`
    });
    console.log('Audit log fallback delete:', fallback.deletedCount);
  } else {
    console.log('Audit log deleted:', AUDIT_LOG_ID);
  }

  console.log('Done.');
  console.log('manualHours before/after:', before, attendance.manualHours.length);
  console.log('totalWorkedSeconds:', attendance.totalWorkedSeconds);
  console.log('remaining manualHours:', JSON.stringify(attendance.manualHours, null, 2));

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
