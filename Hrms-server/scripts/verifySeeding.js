import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import connectDB from '../config/database.js';

dotenv.config();

const verify = async () => {
  try {
    await connectDB();
    
    const testUsernames = ['testuser1', 'testuser2', 'testuser3', 'testuser4', 'testuser5'];
    const users = await User.find({ username: { $in: testUsernames } });
    console.log(`Found ${users.length} test users.`);
    
    for (const user of users) {
      const attendances = await Attendance.find({ userId: user._id }).sort({ date: 1 });
      console.log(`User ${user.username} has ${attendances.length} attendance records.`);
      attendances.forEach(a => {
        console.log(`  - ${a.date}: ${a.totalWorkedSeconds / 3600} hours`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error verifying data:', error);
    process.exit(1);
  }
};

verify();
