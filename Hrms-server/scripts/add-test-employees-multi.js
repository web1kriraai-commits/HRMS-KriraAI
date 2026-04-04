
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { getTodayStr } from '../utils/attendanceUtils.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const DB_NAME = process.env.MONGODB_DB_NAME || 'hrms';

async function setup() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    console.log(`Connected to MongoDB: ${DB_NAME}`);

    const today = getTodayStr();
    const commonPassword = 'Password@123';

    // 1. Employee: testYesterday (Joined Yesterday: 2026-04-03)
    const yesterday = '03/04/2026';
    let userYesterday = await User.findOne({ username: 'testYesterday' });
    if (!userYesterday) {
      userYesterday = new User({
        name: 'Yesterday Joiner',
        username: 'testYesterday',
        email: 'yesterday@demo.com',
        password: commonPassword,
        role: 'Employee',
        department: 'Testing',
        joiningDate: yesterday,
        isActive: true
      });
    } else {
      userYesterday.joiningDate = yesterday;
    }
    await userYesterday.save();
    await Attendance.deleteMany({ userId: userYesterday._id });
    console.log('✅ User testYesterday created/updated (Joining: 2026-04-03). No attendance added.');

    // 2. Employee: testMarch20 (Joined 20-03-2026)
    const march20 = '20/03/2026';
    let userMarch20 = await User.findOne({ username: 'testMarch20' });
    if (!userMarch20) {
      userMarch20 = new User({
        name: 'March 20 Joiner',
        username: 'testMarch20',
        email: 'march20@demo.com',
        password: commonPassword,
        role: 'Employee',
        department: 'Testing',
        joiningDate: march20,
        isActive: true
      });
    } else {
      userMarch20.joiningDate = march20;
    }
    await userMarch20.save();
    await Attendance.deleteMany({ userId: userMarch20._id });
    console.log('✅ User testMarch20 created/updated (Joining: 20-03-2026). No attendance added.');

    // 3. Employee: test816 (Worked 8h 16m Today)
    let user816 = await User.findOne({ username: 'test816' });
    if (!user816) {
      user816 = new User({
        name: '8h 16m Tester',
        username: 'test816',
        email: 'test816@demo.com',
        password: commonPassword,
        role: 'Employee',
        department: 'Testing',
        joiningDate: '01/01/2026',
        isActive: true
      });
    }
    await user816.save();
    
    // Create attendance for 8h 16m (29760 seconds)
    await Attendance.deleteMany({ userId: user816._id, date: today });
    const now = new Date();
    // 8h 48m elapsed since check-in (including 20 min break + 12 min extra room)
    const checkIn = new Date(now.getTime() - ((8 * 3600 + 48 * 60) * 1000));
    const breakStart = new Date(checkIn.getTime() + (2 * 3600 * 1000));
    const breakEnd = new Date(breakStart.getTime() + (20 * 60 * 1000));

    const attendance816 = new Attendance({
      userId: user816._id,
      date: today,
      checkIn,
      status: 'Present',
      location: 'Office',
      breaks: [{
        start: breakStart,
        end: breakEnd,
        type: 'Standard',
        durationSeconds: 1200
      }],
      totalWorkedSeconds: 29760, // 8h 16m
      isPenaltyDisabled: true
    });
    await attendance816.save();
    console.log('✅ User test816 created/updated (Worked 8h 16m today).');

    console.log('\n--- Seeding Complete ---');
    console.log('Common Password: Password@123\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
