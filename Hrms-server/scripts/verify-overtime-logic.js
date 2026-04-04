import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getFlags } from '../utils/attendanceUtils.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function verify() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    // Scenario:
    // Approved OT: 60 minutes
    // Current Work: Standard (502 mins) + 30 minutes = 532 minutes
    // Expected Result: completedOvertime = 30, unfulfilledOvertime = 30
    
    const approvedOT = 60;
    const workedMinutes = 532;
    const workedSeconds = workedMinutes * 60;
    
    console.log(`\nTesting Scenario:`);
    console.log(`Approved Overtime: ${approvedOT} minutes`);
    console.log(`Worked Time: ${workedMinutes} minutes (Target: 502 + ${approvedOT} = 562)`);
    
    const flags = getFlags(workedSeconds, false, 0, false, null, true, approvedOT);
    
    console.log('\nResults:');
    console.log('Completed Overtime:', flags.completedOvertime, 'minutes');
    console.log('Unfulfilled Overtime:', flags.unfulfilledOvertime, 'minutes');
    
    if (flags.completedOvertime === 30 && flags.unfulfilledOvertime === 30) {
      console.log('\n✅ VERIFICATION SUCCESSFUL: Partial overtime accurately tracked.');
    } else {
      console.log('\n❌ VERIFICATION FAILED: Overtime tracking mismatch.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  }
}

verify();
