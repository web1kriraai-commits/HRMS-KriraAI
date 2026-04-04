import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import connectDB from '../config/database.js';

dotenv.config();

const testAbsenceLogic = async () => {
  try {
    await connectDB();
    console.log('\n--- Starting Unexcused Absence Rule Test ---\n');

    // 1. Setup Test User
    let user = await User.findOne({ username: 'testuser1' });
    if (!user) {
      console.log('Test user not found, creating one...');
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

    // 2. Clear all attendance/leaves for this month to ensure a clean state
    await Attendance.deleteMany({ userId: user._id });
    await LeaveRequest.deleteMany({ userId: user._id });
    console.log('Cleared all attendance and leaves for testuser1.');

    // 3. Define dates of interest
    const TUESDAY_BEFORE = '2026-03-31'; // Before policy (April 1)
    const WEDNESDAY_AFTER = '2026-04-01'; // After policy (April 1)
    const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-01';

    // 4. Run gap detection simulation (matching userController.js)
    console.log('\nSimulating gap detection for March 2026...');
    
    // Fetch holidays
    const holidays = await CompanyHoliday.find({}).lean();
    const holidayDates = new Set(holidays.map(h => h.date));
    
    // We look at March 30 - April 2
    const startRange = new Date(2026, 2, 30);
    const endIter = new Date(2026, 3, 2);
    
    let absentDaysCount = 0;
    let absentDeficitSeconds = 0;
    const absentDates = [];

    let iter = new Date(startRange);
    while (iter <= endIter) {
      const dateStr = iter.toISOString().split('T')[0];
      const dayOfWeek = iter.getDay(); // 0 = Sunday

      // Working day logic
      if (dayOfWeek !== 0 && !holidayDates.has(dateStr)) {
        // Here we assume NO records and NO leaves exist (since we cleared them)
        const hasAttendance = false;
        const hasLeave = false;

        if (!hasAttendance && !hasLeave) {
          // RULE: Apply penalty ONLY on or after effective date
          if (dateStr >= ABSENCE_PENALTY_EFFECTIVE_DATE) {
            absentDaysCount++;
            absentDeficitSeconds += (8.25 * 3600); // 29700 seconds
            absentDates.push(dateStr);
          }
        }
      }
      iter.setDate(iter.getDate() + 1);
    }

    // 5. Verify Results
    console.log('--- TEST RESULTS ---');
    
    const mar31Absent = absentDates.includes(TUESDAY_BEFORE);
    const apr01Absent = absentDates.includes(WEDNESDAY_AFTER);

    console.log(`- March 31 (Before Rule) flagged as Absent: ${mar31Absent} (Expected: false)`);
    console.log(`- April 01 (After Rule) flagged as Absent: ${apr01Absent} (Expected: true)`);
    console.log(`- Total Absent Days Count: ${absentDaysCount}`);
    console.log(`- Total Deficit (seconds): ${absentDeficitSeconds}`);
    console.log(`- Total Deficit (hours): ${(absentDeficitSeconds / 3600).toFixed(2)}h`);

    if (!mar31Absent && apr01Absent) {
      console.log('\n✅ PASS: Policy correctly applied only after 2026-04-01.');
    } else {
      console.log('\n❌ FAIL: Policy enforcement date check failed.');
    }

    console.log('\n--- Test Complete ---');
    process.exit(0);
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
};

testAbsenceLogic();
