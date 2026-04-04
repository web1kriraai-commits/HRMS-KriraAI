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

    const username = 'test822';
    const password = 'Password@123';
    
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({
        name: 'Target 822 Tester',
        username,
        email: 'test822@demo.com',
        password,
        role: 'Employee',
        department: 'Testing',
        joiningDate: '01/01/2026',
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
     * Target: 8h 22m (30120 seconds) to be reached in 5 minutes (300 seconds).
     * Current worked target = 30120 - 300 = 29820 seconds (8h 17m).
     * Mandatory Break = 20 minutes (1200 seconds).
     * Total elapsed since check-in = Worked + Break = 29820 + 1200 = 31020 seconds.
     * 31020 seconds = 8 hours 37 minutes.
     */
    const elapsedSeconds = (8 * 3600) + (37 * 60);
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
      totalWorkedSeconds: 29820,
      isPenaltyDisabled: true // Ensure clean testing without late penalty
    });

    await attendance.save();
    
    console.log('\n--- Test Employee Ready ---');
    console.log('Username: test822');
    console.log('Password: Password@123');
    console.log('Current Time:', now.toLocaleTimeString());
    console.log('Check-in Time:', checkIn.toLocaleTimeString());
    console.log('Worked Time so far:', '8h 17m');
    console.log('Target (8h 22m) will be reached at:', new Date(now.getTime() + (5 * 60 * 1000)).toLocaleTimeString());
    console.log('---------------------------\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
