import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function inspect() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    const user = await User.findOne({ name: /Forward Test/i });
    if (!user) {
      console.log('User not found');
    } else {
      console.log('User Forwarding Data:');
      console.log('Name:', user.name);
      console.log('lastForwardedMonth:', user.lastForwardedMonth);
      console.log('forwardedMonths:', Object.fromEntries(user.forwardedMonths));
      console.log('forwardedInMonths:', Object.fromEntries(user.forwardedInMonths));
    }

    process.exit(0);
  } catch (error) {
    console.error('Inspection error:', error);
    process.exit(1);
  }
}

inspect();
