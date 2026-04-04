import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/database.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from one level up
dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  await connectDB();

  const username = 'testovertime';
  const email = 'testovertime@example.com';
  const name = 'Overtime Tester';
  const password = 'Password@123';

  let user = await User.findOne({ username });
  if (!user) {
    // Note: User model hashes password in pre-save
    user = new User({
      name,
      username,
      email,
      password,
      role: 'Employee',
      department: 'Testing',
      joiningDate: '01-01-2026'
    });
    await user.save();
    console.log('Test user created (username: testovertime, password: Password@123)');
  } else {
    console.log('Test user exists (username: testovertime)');
  }

  // Set today's date string YYYY-MM-DD
  // Use current local date
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // Target: 8h 22m (30120s) at 14:14:00 (user time)
  // Current user time is 14:09:00, so in 5 minutes (300s).
  // Check-in should be at 05:52:00
  const checkIn = new Date();
  checkIn.setHours(5, 52, 0, 0);

  // Clear existing attendance for today for this user
  await Attendance.deleteMany({ userId: user._id, date: today });

  const attendance = new Attendance({
    userId: user._id,
    date: today,
    checkIn: checkIn.toISOString(),
    totalWorkedSeconds: 0,
    breaks: [],
    overtimeRequest: { status: 'None' }
  });

  await attendance.save();
  console.log(`Attendance created for ${name} with check-in at ${checkIn.toLocaleTimeString()}`);
  console.log(`Target: At 14:14 (local), 8 hours and 22 minutes will be complete.`);
  console.log(`Please login as 'testovertime' with 'Password@123' to test.`);
  
  process.exit(0);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
