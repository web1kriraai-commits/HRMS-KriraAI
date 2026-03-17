import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const check = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.MONGODB_DB_NAME || 'hrms'
        });
        console.log('Connected to Database:', conn.connection.db.databaseName);
        console.log('Host:', conn.connection.host);
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};
check();
