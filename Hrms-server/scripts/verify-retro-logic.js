
import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config();

async function verify() {
    await mongoose.connect(process.env.MONGODB_URI, {
        dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    const user = await User.findOne({ username: 'test828' });
    if (!user) {
        console.log('User test828 not found');
        process.exit(1);
    }

    const targetDate = '2026-04-04'; // The date used in the seeding scripts
    const attendance = await Attendance.findOne({ userId: user._id, date: targetDate });
    
    if (!attendance) {
        console.log(`No attendance record found for ${targetDate}`);
        process.exit(1);
    }

    console.log(`Initial Overtime Request Status for ${targetDate}: ${attendance.overtimeRequest?.status || 'None'}`);

    // We can't easily call the controller without a full express req/res mock,
    // but we can verify the data structure and thresholds.
    const workedSeconds = attendance.totalWorkedSeconds || 0;
    const threshold = (8 * 3600) + (22 * 60); // 8h 22m

    console.log(`Worked Seconds: ${workedSeconds} (${(workedSeconds/3600).toFixed(2)}h)`);
    console.log(`Threshold: ${threshold} (8.37h)`);

    if (workedSeconds > threshold) {
        console.log('✅ Worked time satisfies overtime threshold.');
    } else {
        console.log('❌ Worked time does NOT satisfy overtime threshold.');
    }

    await mongoose.disconnect();
}

verify().catch(console.error);
