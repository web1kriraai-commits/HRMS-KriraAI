import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import SystemSettings from '../models/SystemSettings.js';
import connectDB from '../config/database.js';

dotenv.config();

const initDatabase = async () => {
  try {
    await connectDB();

    // Create default admin user if it doesn't exist
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      const admin = new User({
        name: 'Alice Admin',
        username: 'admin',
        email: 'alice@krira.ai',
        password: 'pass',
        role: 'Admin',
        department: 'IT',
        isActive: true,
        isFirstLogin: false
      });
      await admin.save();
      console.log('Default admin user created: admin / pass');
    }

    // Create default HR user if it doesn't exist
    const hrExists = await User.findOne({ username: 'hr' });
    if (!hrExists) {
      const hr = new User({
        name: 'Bob HR',
        username: 'hr',
        email: 'bob@krira.ai',
        password: 'pass',
        role: 'HR',
        department: 'People',
        isActive: true,
        isFirstLogin: false
      });
      await hr.save();
      console.log('Default HR user created: hr / pass');
    }

    // Create default employee user if it doesn't exist
    const empExists = await User.findOne({ username: 'emp' });
    if (!empExists) {
      const emp = new User({
        name: 'Charlie Dev',
        username: 'emp',
        email: 'charlie@krira.ai',
        password: 'pass',
        role: 'Employee',
        department: 'Engineering',
        isActive: true,
        isFirstLogin: false
      });
      await emp.save();
      console.log('Default employee user created: emp / pass');
    }

    // Initialize system settings
    await SystemSettings.getSettings();
    console.log('System settings initialized');

    console.log('Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
};

initDatabase();



