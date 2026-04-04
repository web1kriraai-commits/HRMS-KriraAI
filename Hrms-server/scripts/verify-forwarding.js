import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function verify() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log('Connected to MongoDB');

    const username = 'test-ot'; // Use the user created earlier
    let user = await User.findOne({ username });
    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    console.log('Original User:', {
      lastForwardedMonth: user.lastForwardedMonth,
      forwardedMonths: user.forwardedMonths,
      forwardedInMonths: user.forwardedInMonths
    });

    // Simulate an update from the controller/API
    const updateData = {
      lastForwardedMonth: '2026-03',
      forwardedMonths: { '2026-03': 36000 },
      forwardedInMonths: { '2026-04': 36000 }
    };

    // This is what the controller does:
    if (updateData.lastForwardedMonth !== undefined) user.lastForwardedMonth = updateData.lastForwardedMonth;
    if (updateData.forwardedMonths !== undefined) user.forwardedMonths = updateData.forwardedMonths;
    if (updateData.forwardedInMonths !== undefined) user.forwardedInMonths = updateData.forwardedInMonths;

    await user.save();
    console.log('User saved successfully');

    // Fetch again to verify persistence
    const updatedUser = await User.findById(user._id);
    console.log('Updated User from DB:', {
      lastForwardedMonth: updatedUser.lastForwardedMonth,
      forwardedMonths: Object.fromEntries(updatedUser.forwardedMonths),
      forwardedInMonths: Object.fromEntries(updatedUser.forwardedInMonths)
    });

    if (updatedUser.lastForwardedMonth === '2026-03' && updatedUser.forwardedMonths.get('2026-03') === 36000) {
      console.log('VERIFICATION SUCCESSFUL: Forwarding fields persisted.');
    } else {
      console.log('VERIFICATION FAILED: Fields not persisted correctly.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Verification error:', error);
    process.exit(1);
  }
}

verify();
