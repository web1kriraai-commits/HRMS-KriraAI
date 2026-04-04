import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/database.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  await connectDB();

  const username = 'testovertime';
  const user = await User.findOne({ username });
  
  if (!user) {
    console.error('User testovertime not found');
    process.exit(1);
  }

  const today = new Date().toISOString().split('T')[0];
  const attendance = await Attendance.findOne({ userId: user._id, date: today });

  if (!attendance) {
    console.error('No attendance record for today found for testovertime');
    process.exit(1);
  }

  // Create a 20-minute break
  const breakStart = new Date();
  breakStart.setHours(10, 0, 0, 0);
  
  const breakEnd = new Date();
  breakEnd.setHours(10, 20, 0, 0);
  
  const newBreak = {
    type: 'Standard',
    start: breakStart.toISOString(),
    end: breakEnd.toISOString(),
    durationSeconds: 1200,
    reason: 'Mandatory Break'
  };

  attendance.breaks.push(newBreak);
  
  // Recalculate totalWorkedSeconds
  // Current time elapsed since check-in - break duration
  // Actually, update check-in to be 20 mins earlier to keep the same elapsed time if needed
  // Or just leave it, since the user is at 08h 22m, adding a break will REDUCE their worked time by 20 mins.
  // To keep them at 08h 22m, I should move the check-in 20 mins earlier.
  
  const currentCheckIn = new Date(attendance.checkIn);
  currentCheckIn.setMinutes(currentCheckIn.getMinutes() - 20);
  attendance.checkIn = currentCheckIn.toISOString();

  await attendance.save();
  
  console.log(`Successfully added a 20-minute break (10:00 - 10:20) to ${username}'s attendance.`);
  console.log(`Adjusted check-in to ${currentCheckIn.toLocaleTimeString()} to maintain work duration.`);
  
  process.exit(0);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
