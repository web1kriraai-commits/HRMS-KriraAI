import mongoose from 'mongoose';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import dotenv from 'dotenv';
import { getTodayStr } from '../utils/attendanceUtils.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function setup() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    const username = 'testercommitment';
    const password = 'Password@123';
    
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({
        name: 'Commitment Tester',
        username,
        email: 'tester@commitment.com',
        password,
        role: 'Employee',
        department: 'Testing',
        joiningDate: '01/01/2026',
        isActive: true
      });
      console.log('Creating new user:', username);
    } else {
      user.password = password;
      console.log('Updating password for existing user:', username);
    }
    await user.save();

    const today = getTodayStr();
    await Attendance.deleteMany({ userId: user._id, date: today });

    const now = new Date();
    // Goal: 8h 22m (30120s) reached in 5 minutes.
    // So current worked time target = 30120 - 300 = 29820 seconds (8h 17m).
    // Break = 20 mins (1200s).
    // Total session needed = 29820 + 1200 = 31020 seconds (8h 37m).
    const checkIn = new Date(now.getTime() - (8 * 3600 + 37 * 60) * 1000);
    
    const breakStart = new Date(checkIn.getTime() + 2 * 3600 * 1000); // 2 hours after check-in
    const breakEnd = new Date(breakStart.getTime() + 20 * 60 * 1000); // 20 mins break

    const attendance = new Attendance({
      userId: user._id,
      date: today,
      checkIn,
      status: 'Present',
      breaks: [{
        start: breakStart,
        end: breakEnd,
        type: 'Standard',
        durationSeconds: 1200
      }],
      totalBreakDuration: 1200,
      totalWorkedSeconds: 29820,
      isPenaltyDisabled: true // Disable penalty for clean testing
    });

    await attendance.save();
    console.log('Attendance record created for', today);
    console.log('Check-in set to:', checkIn.toLocaleTimeString());
    console.log('Break (20m) added.');
    console.log('Target: 8h 22m will be reached at:', new Date(now.getTime() + 5 * 60 * 1000).toLocaleTimeString());
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

setup();
