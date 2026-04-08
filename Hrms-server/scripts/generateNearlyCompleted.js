import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import connectDB from '../config/database.js';
import { getTodayStr } from '../utils/attendanceUtils.js';

dotenv.config();

const generateMockEmployee = async () => {
    try {
        await connectDB();
        
        const username = 'near-complete';
        const password = 'pass123';
        const email = 'test-near@krira.ai';

        // 1. Create or Find the employee user
        let user = await User.findOne({ username });
        if (!user) {
            user = new User({
                name: 'Test Near Complete',
                username,
                email,
                password,
                role: 'Employee',
                department: 'Testing',
                isActive: true,
                isFirstLogin: false
            });
            await user.save();
            console.log(`User created: ${username} / ${password}`);
        } else {
            console.log(`User already exists: ${username} / ${password}`);
        }

        const today = getTodayStr();

        // 2. Remove any existing attendance for today
        await Attendance.deleteMany({ userId: user._id, date: today });

        // 3. Create a record with checkIn 8 hours and 10 minutes ago
        // Requirement: 8h 15m (29700s). Nearly completed: 8h 10m (29400s).
        const checkInTime = new Date();
        checkInTime.setHours(checkInTime.getHours() - 8);
        checkInTime.setMinutes(checkInTime.getMinutes() - 10);

        const attendance = new Attendance({
            userId: user._id,
            date: today,
            checkIn: checkInTime,
            location: 'Remote (Mock)',
            breaks: [],
            totalWorkedSeconds: 0,
            lowTimeFlag: false,
            extraTimeFlag: false,
            lateCheckIn: false,
            penaltySeconds: 0,
            isPenaltyDisabled: true
        });

        await attendance.save();
        
        console.log(`--- MOCK RECORD GENERATED ---`);
        console.log(`User: ${user.name}`);
        console.log(`Username: ${username}`);
        console.log(`Password: ${password}`);
        console.log(`Check-In: ${checkInTime.toLocaleTimeString()} (8h 10m ago)`);
        console.log(`Working hours: ~8 hours and 10 minutes (Nearly 8h 15m)`);
        console.log(`Status: Not Checked Out`);
        console.log(`\nNote: At current time (9:35 AM), this user CANNOT checkout because:`);
        console.log(`1. They have NOT completed 8h 15m yet.`);
        console.log(`2. Even if they had, it's NOT 5:30 PM yet.`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error generating mock employee:', error);
        process.exit(1);
    }
};

generateMockEmployee();
