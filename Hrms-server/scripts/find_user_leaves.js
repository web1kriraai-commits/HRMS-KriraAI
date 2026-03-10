
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const LeaveRequest = mongoose.model('LeaveRequest', new mongoose.Schema({}, { strict: false }));

        const targetId = '6955049e5017abca51a8e70a';
        const user = await User.findById(targetId);

        const leaves = await LeaveRequest.find({
            userId: user._id,
            status: 'Approved'
        });

        let extraTimeLeaveHours = 0;
        leaves.forEach(leave => {
            if (leave.category === 'Extra Time Leave') {
                extraTimeLeaveHours += 8.25; // Default fallback from frontend
            } else if (leave.category === 'Half Day Leave' && leave.reason.includes('[Extra Time Leave]')) {
                extraTimeLeaveHours += 4;
            }
        });

        console.log('--- FINAL STATE ---');
        console.log('User:', user.name);
        console.log('Extra Time Leave Taken:', extraTimeLeaveHours, 'hours');
        console.log('Approved Leaves:', leaves.length);
        leaves.forEach(l => console.log(`- ${l.category} (${l.startDate}): ${l.reason}`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
