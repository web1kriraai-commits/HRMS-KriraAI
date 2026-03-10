
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

let MONGODB_URI = process.env.MONGODB_URI;
// Connection will use dbName option
const dbName = process.env.MONGODB_DB_NAME || 'hrms';

async function run() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName });
        console.log('Connected to:', mongoose.connection.db.databaseName);

        const LeaveRequest = mongoose.model('LeaveRequest', new mongoose.Schema({}, { strict: false }));

        const targetLeaveId = '699ff113629b447c9b628853';

        console.log('Updating leave status to Cancelled for ID:', targetLeaveId);
        const result = await LeaveRequest.updateOne(
            { _id: new mongoose.Types.ObjectId(targetLeaveId) },
            { $set: { status: 'Cancelled' } }
        );

        console.log('Update Result:', result);

        if (result.modifiedCount > 0) {
            console.log('Successfully updated leave status to Cancelled');
        } else {
            console.log('No modifications made (maybe already Cancelled?)');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
