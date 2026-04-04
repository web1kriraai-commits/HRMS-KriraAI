import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import connectDB from '../config/database.js';

dotenv.config();

const testDeleteImpact = async () => {
  try {
    await connectDB();
    console.log('\n--- Starting Deletion Balance Test ---\n');

    // 1. Setup Test User
    let user = await User.findOne({ username: 'testuser1' });
    if (!user) {
      user = await User.create({
        name: 'Test Employee 1',
        username: 'testuser1',
        email: 'test1@krira.ai',
        role: 'Employee',
        department: 'Engineering',
        joiningDate: '01-01-2026',
        password: 'dummy'
      });
    }

    // 2. Clear all attendance records for this month
    await Attendance.deleteMany({ userId: user._id });
    console.log('Cleared attendance for testuser1.');

    // 3. Define dates (Pre vs Post Policy)
    const MAR_28 = '2026-03-28'; // Mon-Sat working day
    const MAR_30 = '2026-03-30'; // Mon-Sat working day
    const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-01';

    // 4. Initial Balance with 2 regular days (08:45 - 05:30 = 8.25h worked)
    console.log('\nStep 1: Adding 2 regular days (Mar 28 and Mar 30)...');
    await Attendance.insertMany([
      {
        userId: user._id, 
        date: MAR_28, 
        checkIn: new Date(`${MAR_28}T03:15:00Z`), 
        checkOut: new Date(`${MAR_28}T12:00:00Z`),
        totalWorkedSeconds: 29700 
      },
      {
        userId: user._id, 
        date: MAR_30, 
        checkIn: new Date(`${MAR_30}T03:15:00Z`), 
        checkOut: new Date(`${MAR_30}T12:00:00Z`),
        totalWorkedSeconds: 29700
      }
    ]);

    // Simulation of balance calculation (same logic as dashboards)
    const calculateBalance = async () => {
      const records = await Attendance.find({ userId: user._id }).lean();
      const recordDates = new Set(records.map(r => {
          const d = new Date(r.date);
          return d.toISOString().split('T')[0];
      }));
      
      let totalLowTimeSeconds = 0;
      let totalExtraTimeSeconds = 0;
      const startOfMonth = Date.UTC(2026, 2, 1);
      const endIter = Date.UTC(2026, 2, 30); // March 30
      
      let iterTime = startOfMonth;
      while (iterTime <= endIter) {
        const iter = new Date(iterTime);
        const dateStr = iter.toISOString().split('T')[0];
        const dayOfWeek = iter.getUTCDay(); // USE UTC DAY
        const hasRecord = recordDates.has(dateStr);
        
        if (dayOfWeek !== 0) {
          if (!hasRecord) {
            if (dateStr >= ABSENCE_PENALTY_EFFECTIVE_DATE) {
              totalLowTimeSeconds += (8.25 * 3600);
            }
          }
        }
        iterTime += 24 * 3600 * 1000;
      }
      return (totalExtraTimeSeconds - totalLowTimeSeconds) / 3600;
    };

    let bal = await calculateBalance();
    console.log(`Initial Balance (Days seeded: Mar 28, Mar 30): ${bal.toFixed(2)}h`);

    // 5. Delete March 28 (PRE-POLICY)
    console.log('\nStep 2: Deleting record from March 28 (Before Rule)...');
    await Attendance.deleteOne({ userId: user._id, date: MAR_28 });
    bal = await calculateBalance();
    console.log(`New Balance (after MAR 28 delete): ${bal.toFixed(2)}h (Expected: 0.00h)`);

    if (bal === 0) {
        console.log('✅ PASS: Deleting pre-policy record did not subtract from balance.');
    } else {
        console.log('❌ FAIL: Pre-policy record subtracted balance.');
    }

    // 6. Delete March 30 (POST-POLICY)
    console.log('\nStep 3: Deleting record from March 30 (After Rule)...');
    await Attendance.deleteOne({ userId: user._id, date: MAR_30 });
    bal = await calculateBalance();
    console.log(`New Balance (after MAR 30 delete): ${bal.toFixed(2)}h (Expected: -8.25h)`);

    if (Math.abs(bal - (-8.25)) < 0.01) {
        console.log('✅ PASS: Deleting post-policy record correctly subtracted 8.25 hours.');
    } else {
        console.log('❌ FAIL: Post-policy record balance impact incorrect.');
    }

    console.log('\n--- Test Complete ---');
    process.exit(0);
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
};

testDeleteImpact();
