/**
 * Seed: one employee with TODAY's attendance = checked in ~5 hours ago, NO checkout,
 * and an APPROVED Half Day Leave for the same date (for testing half-day + overtime rules).
 *
 * Run from Hrms-server:
 *   node scripts/add-employee-halfday-5h-checked-in.js
 *
 * Second user (same setup): node scripts/add-employee-halfday-5h-checked-in-2.js → testHalfDay5h2
 *
 * Login: testHalfDay5h / Password@123
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import { getTodayStr } from '../utils/attendanceUtils.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

const USERNAME = 'testHalfDay5h';
const PASSWORD = 'Password@123';
/** Net worked time if no breaks (wall clock from check-in to now). */
const WORKED_SECONDS_TARGET = 5 * 3600; // 5 hours

async function setup() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    let user = await User.findOne({ username: USERNAME });
    if (!user) {
      user = new User({
        name: 'Half Day 5h Open Session',
        username: USERNAME,
        email: 'testhalfday5h@demo.com',
        password: PASSWORD,
        role: 'Employee',
        department: 'Testing',
        joiningDate: '01/04/2026',
        isActive: true
      });
      console.log('Creating user:', USERNAME);
    } else {
      user.password = PASSWORD;
      console.log('Resetting password for:', USERNAME);
    }
    await user.save();

    const today = getTodayStr();

    await Attendance.deleteMany({ userId: user._id, date: today });
    await LeaveRequest.deleteMany({
      userId: user._id,
      startDate: today,
      category: 'Half Day Leave'
    });

    const now = Date.now();
    const checkIn = new Date(now - WORKED_SECONDS_TARGET * 1000);

    const attendance = new Attendance({
      userId: user._id,
      date: today,
      checkIn,
      breaks: [],
      totalWorkedSeconds: 0,
      lowTimeFlag: false,
      extraTimeFlag: false,
      lateCheckIn: false,
      penaltySeconds: 0,
      isPenaltyDisabled: false,
      isCompulsoryBreakDisabled: false,
      location: 'Office'
    });
    await attendance.save();

    const leave = new LeaveRequest({
      userId: user._id,
      userName: user.name,
      startDate: today,
      endDate: today,
      category: 'Half Day Leave',
      reason: '[Paid Leave] Seeded by add-employee-halfday-5h-checked-in.js',
      status: 'Approved',
      startTime: '09:00',
      endTime: '13:00'
    });
    await leave.save();

    const workedH = WORKED_SECONDS_TARGET / 3600;
    const halfMaxMin = 502 / 2;
    console.log('\n--- Ready: half-day approved, ~5h worked, still checked in ---');
    console.log('Username:', USERNAME);
    console.log('Password:', PASSWORD);
    console.log('Date:', today);
    console.log('Check-in (local):', checkIn.toLocaleString());
    console.log('Check-out: (none — session open)');
    console.log('Approx. elapsed work:', `${workedH}h (no breaks)`);
    console.log('Half Day Leave:', leave.status, '|', leave.startTime, '-', leave.endTime);
    console.log(
      'Note: ~5h net > half-day normal max (~',
      halfMaxMin,
      ' min) → eligible for overtime request per policy (if other rules pass).'
    );
    console.log('---------------------------\n');

    process.exit(0);
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
