/**
 * Seed: one employee with TODAY's attendance = checked in ~4 hours ago, NO checkout,
 * and an APPROVED Half Day Leave for the same date (for testing half-day rules in the UI/API).
 *
 * Run from Hrms-server:
 *   node scripts/add-employee-halfday-4h-no-checkout.js
 *
 * Login: testHalfDay4h / Password@123
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import { getTodayStr } from '../utils/attendanceUtils.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

const USERNAME = 'testHalfDay4h';
const PASSWORD = 'Password@123';
const WORKED_SECONDS_TARGET = 4 * 3600; // 4 hours net (no breaks in this seed)

async function setup() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    let user = await User.findOne({ username: USERNAME });
    if (!user) {
      user = new User({
        name: 'Half Day 4h Open Session',
        username: USERNAME,
        email: 'testhalfday4h@demo.com',
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
    // No breaks → elapsed work = wall time since check-in
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
      reason: '[Paid Leave] Seeded by add-employee-halfday-4h-no-checkout.js',
      status: 'Approved',
      startTime: '09:00',
      endTime: '13:00'
    });
    await leave.save();

    console.log('\n--- Ready: half-day approved, ~4h worked, still checked in ---');
    console.log('Username:', USERNAME);
    console.log('Password:', PASSWORD);
    console.log('Date:', today);
    console.log('Check-in (local):', checkIn.toLocaleString());
    console.log('Check-out: (none — session open)');
    console.log('Approx. elapsed work:', `${WORKED_SECONDS_TARGET / 3600}h (no breaks)`);
    console.log('Half Day Leave:', leave.status, '|', leave.startTime, '-', leave.endTime);
    console.log('---------------------------\n');

    process.exit(0);
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
