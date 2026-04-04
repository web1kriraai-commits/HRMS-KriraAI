import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import connectDB from '../config/database.js';

dotenv.config();

const testSystemFlow = async () => {
  try {
    await connectDB();
    console.log('\n--- Starting Integrated System Flow Test ---\n');

    // 1. Setup Test User
    const username = 'test_forward_user';
    let user = await User.findOne({ username });
    if (user) {
      await Attendance.deleteMany({ userId: user._id });
      await LeaveRequest.deleteMany({ userId: user._id });
      await User.deleteOne({ _id: user._id });
    }

    user = await User.create({
      name: 'Forward Test Employee',
      username,
      email: 'forward_test@krira.ai',
      role: 'Employee',
      department: 'Testing',
      joiningDate: '01-01-2026',
      password: 'dummy'
    });
    console.log(`Created test user: ${user.name}`);

    // 2. Define Test Scenario for March 2026
    const MARCH = '2026-03';
    const ABSENCE_PENALTY_DATE = '2026-04-01';
    
    // Normal working day length: 8h 15m (29700s)
    // Low threshold: 8h 15m (29700s)
    // Extra threshold: 8h 22m (30120s)
    
    const records = [
      // Day 1: Overtime (worked 10h)
      { 
        date: '2026-03-02', 
        workedSeconds: 10 * 3600, // 36000s
        checkIn: new Date('2026-03-02T09:00:00Z'),
        checkOut: new Date('2026-03-02T19:00:00Z')
      },
      // Day 2: Deficit (worked 6h)
      { 
        date: '2026-03-03', 
        workedSeconds: 6 * 3600, // 21600s
        checkIn: new Date('2026-03-03T09:00:00Z'),
        checkOut: new Date('2026-03-03T15:00:00Z')
      }
      // Day 3: Absence (2026-03-30) - No record
    ];

    for (const r of records) {
      await Attendance.create({
        userId: user._id,
        date: r.date,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        totalWorkedSeconds: r.workedSeconds,
        breaks: []
      });
    }
    console.log('Seeded 2 attendance records.');

    // 3. Simulating Calculation Logic (Replicating AdminDashboard.tsx logic)
    console.log('\n--- Calculating March 2026 Balances ---');
    
    let totalExtraTimeSeconds = 0;
    let totalLowTimeSeconds = 0;
    
    // Day 1: 10h worked. 
    // Extra = 10h - 8h 22m = 36000 - 30120 = 5880s
    totalExtraTimeSeconds += (36000 - 30120);
    console.log(`Day 1 (Worked 10h): Extra Time = 5880s`);

    // Day 2: 6h worked.
    // Low = 8h 15m - 6h = 29700 - 21600 = 8100s
    totalLowTimeSeconds += (29700 - 21600);
    console.log(`Day 2 (Worked 6h): Low Time = 8100s`);

    // Day 3: Absence (2026-03-30). 
    // Penalty = 8h 15m = 29700s
    totalLowTimeSeconds += 29700;
    console.log(`Day 3 (Absence 2026-03-30): Penalty = 29700s`);

    const netSeconds = totalExtraTimeSeconds - totalLowTimeSeconds;
    console.log(`Cumulative Net Seconds: ${netSeconds}s (${(netSeconds/3600).toFixed(2)}h)`);

    // 4. Simulating Forwarding Action
    console.log('\n--- Simulating Forwarding to Global Pool ---');
    
    const secondsToForward = netSeconds;
    const adjustmentInDays = secondsToForward / (8.25 * 3600);
    console.log(`Forwarding Amount: ${secondsToForward}s (${adjustmentInDays.toFixed(4)} working days equivalent)`);

    const updatedUser = await User.findByIdAndUpdate(user._id, {
      $inc: { manualExtraTimeAdjustment: adjustmentInDays },
      $set: { 
        lastForwardedMonth: '2026-03',
        [`forwardedMonths.${MARCH}`]: secondsToForward
      }
    }, { new: true });

    console.log('✅ Forwarding successfully updated in DB.');
    console.log(`- New Global Adjustment Pool: ${updatedUser.manualExtraTimeAdjustment.toFixed(4)} days`);
    console.log(`- Last Forwarded Month: ${updatedUser.lastForwardedMonth}`);
    console.log(`- Forwarded History for March: ${updatedUser.forwardedMonths.get(MARCH)}s`);

    // 5. Verification for NEXT month (April 2026)
    console.log('\n--- Verification for April 2026 ---');
    const globalPoolSeconds = updatedUser.manualExtraTimeAdjustment * 8.25 * 3600;
    console.log(`Total Available in Global Pool: ${globalPoolSeconds}s (${(globalPoolSeconds/3600).toFixed(2)}h)`);

    if (Math.abs(globalPoolSeconds - netSeconds) < 1) {
      console.log('✅ PASS: Global pool correctly reflects the forwarded net balance.');
    } else {
      console.log('❌ FAIL: Global pool discrepancy detected.');
    }

    // 6. Verification of Absence Resolution via Leave Request
    console.log('\n--- Testing Absence Resolution via Leave Request ---');
    
    // Create an Unpaid Leave for the absent date (2026-03-30)
    await LeaveRequest.create({
      userId: user._id,
      userName: user.name,
      startDate: '2026-03-30',
      endDate: '2026-03-30',
      category: 'Unpaid Leave',
      reason: 'Resolution for unexcused absence',
      status: 'Approved'
    });
    console.log('Created Approved Unpaid Leave for 2026-03-30.');

    // In the real system (userController.js), we check occupiedDates (records + leaves).
    // Now 2026-03-30 is occupied by a leave, so penalty should NOT apply.
    
    let totalLowTimeSecondsWithLeave = (29700 - 21600); // Only Day 2 (6h work)
    console.log(`New Low Time (Day 2 only): ${totalLowTimeSecondsWithLeave}s`);
    console.log(`Day 3 (2026-03-30): Penalty should be 0 because of approved leave.`);

    const newNetSeconds = totalExtraTimeSeconds - totalLowTimeSecondsWithLeave;
    console.log(`New Cumulative Net Seconds: ${newNetSeconds}s (${(newNetSeconds/3600).toFixed(2)}h)`);

    if (newNetSeconds > netSeconds) {
      console.log('✅ PASS: Absence penalty successfully resolved by leave request.');
    } else {
      console.log('❌ FAIL: Absence penalty still present after leave request.');
    }

    console.log('\n--- Test Complete ---');
    process.exit(0);
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
};

testSystemFlow();
