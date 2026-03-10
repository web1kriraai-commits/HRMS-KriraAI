
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });
        const LeaveRequest = mongoose.model('LeaveRequest', new mongoose.Schema({}, { strict: false }));

        const targetLeaveId = '699ff113629b447c9b628853';
        const leave = await LeaveRequest.findById(targetLeaveId);

        console.log('--- INSPECTION ---');
        if (leave) {
            console.log({
                id: leave._id,
                status: leave.status,
                category: leave.category,
                user: leave.userName
            });
        } else {
            console.log('Leave not found');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
