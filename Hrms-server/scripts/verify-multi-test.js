
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const DB_NAME = process.env.MONGODB_DB_NAME || 'hrms';

async function verify() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    console.log(`Connected to MongoDB: ${DB_NAME}`);

    const usernames = ['testyesterday', 'testmarch20', 'test816'];
    const users = await User.find({ username: { $in: usernames } });

    console.log('\n--- User Verification ---');
    for (const username of usernames) {
      const user = users.find(u => u.username === username);
      if (user) {
        console.log(`Username: ${user.username} | Joining Date: ${user.joiningDate}`);
        const records = await Attendance.find({ userId: user._id });
        if (records.length > 0) {
          records.forEach(r => {
            console.log(`  - Attendance: Date ${r.date} | Worked ${r.totalWorkedSeconds}s (${(r.totalWorkedSeconds/3600).toFixed(2)}h)`);
          });
        } else {
          console.log('  - No attendance records found.');
        }
      } else {
        console.log(`Username: ${username} | NOT FOUND`);
      }
      console.log('---------------------------');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Verification error:', error);
    process.exit(1);
  }
}

verify();
