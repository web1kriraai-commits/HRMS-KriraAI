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

    const username = 'test828_2';
    const password = 'Password@123';
    
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({
        name: 'Target 828 Tester 2',
        username,
        email: 'test828_2@demo.com',
        password,
        role: 'Employee',
        department: 'Testing',
        joiningDate: '01/04/2026',
        isActive: true
      });
      console.log('Creating new user:', username);
    } else {
      user.password = password;
      console.log('Resetting user for test:', username);
    }
    await user.save();

    const today = getTodayStr();
    await Attendance.deleteMany({ userId: user._id, date: today });

    const now = new Date();
    
    /**
     * Logic:
     * Target: 8h 30m (30600 seconds) to be reached in 2 minutes (120 seconds).
     * Current worked target = 30600 - 120 = 30480 seconds (8h 28m).
     * Mandatory Break = 20 minutes (1200 seconds).
     * Total elapsed since check-in = Worked + Break = 30480 + 1200 = 31680 seconds.
     * 31680 seconds = 8 hours 48 minutes.
     */
    const elapsedSeconds = (8 * 3600) + (48 * 60);
    const checkIn = new Date(now.getTime() - (elapsedSeconds * 1000));
    
    const breakStart = new Date(checkIn.getTime() + (2 * 3600 * 1000)); // 2 hours after check-in
    const breakEnd = new Date(breakStart.getTime() + (20 * 60 * 1000)); // 20 mins break

    const attendance = new Attendance({
      userId: user._id,
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
      totalWorkedSeconds: 30480,
      isPenaltyDisabled: true 
    });

    await attendance.save();
    
    console.log('\n--- Test Employee 2 (8:28 / nearly 8:30) Ready ---');
    console.log('Username: test828_2');
    console.log('Password: Password@123');
    console.log('Current Time:', now.toLocaleTimeString());
    console.log('Check-in Time:', checkIn.toLocaleTimeString());
    console.log('Worked Time so far:', '8h 28m');
    console.log('Target (8h 30m) will be reached at:', new Date(now.getTime() + (2 * 60 * 1000)).toLocaleTimeString());
    console.log('---------------------------\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
