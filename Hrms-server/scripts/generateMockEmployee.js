import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import connectDB from '../config/database.js';
import { getTodayStr } from '../utils/attendanceUtils.js';

dotenv.config();

const generateMockRecord = async () => {
    try {
        await connectDB();
        
        // 1. Find the default employee user
        const user = await User.findOne({ username: 'emp' });
        if (!user) {
            console.error('Employee user "emp" not found. Run npm run init-db first.');
            process.exit(1);
        }

        const today = getTodayStr();

        // 2. Remove any existing attendance for today to avoid conflicts
        await Attendance.deleteMany({ userId: user._id, date: today });

        // 3. Create a record with checkIn 9 hours ago
        const nineHoursAgo = new Date();
        nineHoursAgo.setHours(nineHoursAgo.getHours() - 9);

        const attendance = new Attendance({
            userId: user._id,
            date: today,
            checkIn: nineHoursAgo,
            location: 'Office (Mock)',
            breaks: [],
            totalWorkedSeconds: 0,
            lowTimeFlag: false,
            extraTimeFlag: false,
            lateCheckIn: false,
            penaltySeconds: 0,
            isPenaltyDisabled: true // Disable penalty for the mock record
        });

        await attendance.save();
        
        console.log(`--- MOCK RECORD GENERATED ---`);
        console.log(`User: ${user.name} (@${user.username})`);
        console.log(`Date: ${today}`);
        console.log(`Check-In: ${nineHoursAgo.toLocaleTimeString()} (9 hours ago)`);
        console.log(`Working hours completed: Yes (> 8h 15m)`);
        console.log(`Status: Not Checked Out`);
        console.log(`\nYou can now log in as 'emp' / 'pass' and verify the checkout restriction.`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error generating mock record:', error);
        process.exit(1);
    }
};

generateMockRecord();
