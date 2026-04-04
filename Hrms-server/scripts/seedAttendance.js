import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import connectDB from '../config/database.js';

dotenv.config();

const SEED_USERS = [
  {
    name: 'Test Employee 1',
    username: 'testuser1',
    email: 'test1@krira.ai',
    role: 'Employee',
    department: 'Engineering',
    joiningDate: '01-01-2026'
  },
  {
    name: 'Test Employee 2',
    username: 'testuser2',
    email: 'test2@krira.ai',
    role: 'Employee',
    department: 'Marketing',
    joiningDate: '01-01-2026'
  },
  {
    name: 'Test Employee 3',
    username: 'testuser3',
    email: 'test3@krira.ai',
    role: 'Employee',
    department: 'Sales',
    joiningDate: '01-01-2026'
  },
  {
    name: 'Test HR',
    username: 'testuser4',
    email: 'test4@krira.ai',
    role: 'HR',
    department: 'People',
    joiningDate: '01-01-2026'
  },
  {
    name: 'Test Admin',
    username: 'testuser5',
    email: 'test5@krira.ai',
    role: 'Admin',
    department: 'Management',
    joiningDate: '01-01-2026'
  }
];

const seedData = async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    const password = await bcrypt.hash('password123', 10);

    for (const userData of SEED_USERS) {
      // Clear existing test user
      await User.deleteOne({ username: userData.username });
      await Attendance.deleteMany({ userId: { $in: await User.find({ username: userData.username }).select('_id') } });

      const user = new User({
        ...userData,
        password,
        isActive: true,
        isFirstLogin: false
      });

      await user.save();
      console.log(`Created user: ${user.username}`);

      // Seed attendance for last 7 days: 2026-03-26 to 2026-04-01
      const startDate = new Date('2026-03-26');
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];

        // Specific cases:
        // skip 2026-03-30 (Monday) to simulate "Absent" (no leave, no holiday)
        if (dateStr === '2026-03-30') {
          console.log(`Skipping attendance for ${user.username} on ${dateStr} (Absent case)`);
          continue;
        }

        // Partial attendance on 2026-03-31 (Tuesday) - 4 hours
        if (dateStr === '2026-03-31') {
          const checkIn = new Date(`${dateStr}T09:00:00Z`);
          const checkOut = new Date(`${dateStr}T13:00:00Z`);
          const totalWorkedSeconds = 4 * 3600;

          await Attendance.create({
            userId: user._id,
            date: dateStr,
            checkIn,
            checkOut,
            totalWorkedSeconds,
            lowTimeFlag: true
          });
          console.log(`Created partial attendance for ${user.username} on ${dateStr}`);
          continue;
        }

        // Regular attendance (8 hours 15 minutes = 29700 seconds)
        const checkIn = new Date(`${dateStr}T09:00:00Z`);
        const checkOut = new Date(`${dateStr}T17:15:00Z`);
        const totalWorkedSeconds = 8.25 * 3600;

        await Attendance.create({
          userId: user._id,
          date: dateStr,
          checkIn,
          checkOut,
          totalWorkedSeconds
        });
        console.log(`Created regular attendance for ${user.username} on ${dateStr}`);
      }
    }

    console.log('Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();
