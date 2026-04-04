import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import connectDB from '../config/database.js';

dotenv.config();

const reseedData = async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    // 1. Delete all existing attendance records
    const deleteResult = await Attendance.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} attendance records.`);

    // 2. Get all employees and HR users
    const users = await User.find({ role: { $in: ['Employee', 'HR'] } });
    console.log(`Found ${users.length} users to seed.`);

    // 3. Seed attendance for March 2026
    const year = 2026;
    const month = 2; // March (0-indexed)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const checkInTime = '03:15:00';
    const checkOutTime = '12:00:00';
    const breakDurationSeconds = 30 * 60; // 30 minutes
    const totalWorkedSeconds = 29700; // 8 hours 15 minutes

    const records = [];

    for (const user of users) {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();

        // Seed only for Monday to Saturday (exclude Sunday)
        if (dayOfWeek !== 0) {
          const dateStr = date.toISOString().split('T')[0];
          
          records.push({
            userId: user._id,
            date: dateStr,
            checkIn: new Date(`${dateStr}T${checkInTime}Z`),
            checkOut: new Date(`${dateStr}T${checkOutTime}Z`),
            totalWorkedSeconds,
            breaks: [
              {
                type: 'Standard',
                durationSeconds: breakDurationSeconds,
                start: new Date(`${dateStr}T07:30:00Z`),
                end: new Date(`${dateStr}T08:00:00Z`)
              }
            ]
          });
        }
      }
    }

    if (records.length > 0) {
      await Attendance.insertMany(records);
      console.log(`Successfully seeded ${records.length} records.`);
    }

    console.log('Re-seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error re-seeding data:', error);
    process.exit(1);
  }
};

reseedData();
