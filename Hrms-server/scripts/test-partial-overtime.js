import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { getTodayStr } from '../utils/attendanceUtils.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function setup() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    const username = 'test-ot';
    const password = 'Password@123';
    
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({
        name: 'Partial OT Tester',
        username,
        email: 'test-ot@demo.com',
        password,
        role: 'Employee',
        department: 'Testing',
        joiningDate: '01/01/2026',
        isActive: true
      });
      console.log('Creating new user:', username);
    }
    await user.save();

    const today = getTodayStr();
    await Attendance.deleteMany({ userId: user._id, date: today });

    // 8 hours 25 minutes of work (8:22 threshold + 3 minutes OT)
    const totalWorkedSeconds = (8 * 3600) + (25 * 60); // 30300 seconds
    const now = new Date();
    const checkOut = now;
    const checkIn = new Date(now.getTime() - (totalWorkedSeconds * 1000));

    const attendance = new Attendance({
      userId: user._id,
      date: today,
      checkIn,
      checkOut,
      status: 'Present',
      location: 'Office',
      totalWorkedSeconds,
      overtimeRequest: {
        durationMinutes: 30,
        reason: 'Testing partial completion',
        status: 'Approved',
        approvedAt: new Date(),
        completedMinutes: 3,
        unfulfilledMinutes: 27
      },
      extraTimeFlag: true,
      lowTimeFlag: false,
      isManualFlag: false
    });

    await attendance.save();
    
    console.log('\n--- Partial Overtime Test Ready ---');
    console.log('Username: test-ot');
    console.log('Password: Password@123');
    console.log('Total Worked:', '8h 25m (3m over 8:22 threshold)');
    console.log('OT Approved:', '30m');
    console.log('OT Completed:', '3m');
    console.log('OT Unfulfilled:', '27m (Deficit)');
    console.log('Status: Extra Time (+3m)');
    console.log('------------------------------------\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
