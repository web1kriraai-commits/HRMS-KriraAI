import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './config/database.js';
import cron from 'node-cron';
import Attendance from './models/Attendance.js';
import LeaveRequest from './models/LeaveRequest.js';
import { getFlags } from './utils/attendanceUtils.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import userRoutes from './routes/userRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

// Import notification cleanup function
import { cleanupOldNotifications } from './controllers/notificationController.js';
// Import auto add Sundays functions
import { autoAddSundays, autoAddSundaysForMonth } from './controllers/holidayController.js';
// Import function to drop unique indexes
import { dropUniqueIndexes } from './models/User.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Connect to MongoDB
connectDB();

// Drop unique indexes after database connection is established
mongoose.connection.on('connected', async () => {
  try {
    await dropUniqueIndexes();
    console.log('Unique indexes on username and email have been removed (duplicates allowed)');
  } catch (error) {
    console.log('Note: Could not drop indexes (will be handled on first user creation)');
  }
});

// Middleware
const corsOptions = {
  origin: [
    'http://localhost:3003',
    'http://localhost:3002',
    'http://82.112.226.75:3003'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'HRMS API is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Run cleanup immediately on server start
  cleanupOldNotifications();

  // Schedule cleanup to run every hour
  setInterval(() => {
    cleanupOldNotifications();
  }, 60 * 60 * 1000); // 1 hour in milliseconds

  console.log('Notification cleanup scheduled to run every hour');

  // Auto-add Sundays for the month if today is the 1st
  try {
    const monthResult = await autoAddSundaysForMonth();
    if (monthResult.added > 0) {
      console.log(`Auto-added ${monthResult.added} Sunday(s) for the month: ${monthResult.dates.join(', ')}`);
    }
  } catch (error) {
    console.error('Error auto-adding Sundays for month:', error);
  }

  // Auto-add Sundays if today is Saturday
  try {
    const result = await autoAddSundays();
    if (result.added > 0) {
      console.log(`Auto-added ${result.added} Sunday(s) as holiday: ${result.dates.join(', ')}`);
    }
  } catch (error) {
    console.error('Error auto-adding Sundays:', error);
  }

  // Schedule auto-add Sundays for month to run daily at midnight (checks if it's 1st)
  const scheduleAutoAddSundaysForMonth = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Set to midnight

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      // Run immediately at midnight
      autoAddSundaysForMonth().then(result => {
        if (result.added > 0) {
          console.log(`Auto-added ${result.added} Sunday(s) for the month: ${result.dates.join(', ')}`);
        }
      }).catch(error => {
        console.error('Error auto-adding Sundays for month:', error);
      });

      // Then schedule to run every 24 hours
      setInterval(() => {
        autoAddSundaysForMonth().then(result => {
          if (result.added > 0) {
            console.log(`Auto-added ${result.added} Sunday(s) for the month: ${result.dates.join(', ')}`);
          }
        }).catch(error => {
          console.error('Error auto-adding Sundays for month:', error);
        });
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilMidnight);
  };

  scheduleAutoAddSundaysForMonth();
  console.log('Sunday auto-add for month scheduled to run daily at midnight (checks if 1st of month)');

  // Schedule auto-add Sundays to run daily at midnight
  const scheduleAutoAddSundays = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Set to midnight

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      // Run immediately at midnight
      autoAddSundays().then(result => {
        if (result.added > 0) {
          console.log(`Auto-added ${result.added} Sunday(s) as holiday: ${result.dates.join(', ')}`);
        }
      }).catch(error => {
        console.error('Error auto-adding Sundays:', error);
      });

      // Then schedule to run every 24 hours
      setInterval(() => {
        autoAddSundays().then(result => {
          if (result.added > 0) {
            console.log(`Auto-added ${result.added} Sunday(s) as holiday: ${result.dates.join(', ')}`);
          }
        }).catch(error => {
          console.error('Error auto-adding Sundays:', error);
        });
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilMidnight);
  };

  scheduleAutoAddSundays();
  console.log('Sunday auto-add scheduled to run daily at midnight');

  // Schedule auto-checkout for paused users at 11 PM
  cron.schedule('0 23 * * *', async () => {
    console.log('Running 11 PM auto-checkout job...');
    try {
      const today = new Date().toISOString().split('T')[0];

      // Find all attendance records for today that are checked in but NOT checked out
      const attendances = await Attendance.find({
        date: today,
        checkIn: { $exists: true },
        checkOut: { $exists: false }
      });

      for (const record of attendances) {
        // Check if there is an active break (start but no end)
        const activeBreak = record.breaks.find(b => b.start && !b.end);

        if (activeBreak) {
          console.log(`Auto-checking out user ${record.userId} who is paused since ${activeBreak.start}`);

          // Set checkout time to the break start time
          record.checkOut = activeBreak.start;

          // Close the active break properly (effectively 0 duration session if we want, or just end it at same time)
          activeBreak.end = activeBreak.start;
          activeBreak.durationSeconds = 0;

          // Calculate worked seconds
          // Need to import calculateWorkedSeconds logic or duplicate simple logic here
          // Duplicating simple logic to avoid dependency issues if utils not exported
          // Actually, let's keep it robust: Check utils
          // Assuming simple logic: Total checkout - checkin - breaks

          const checkInTime = new Date(record.checkIn).getTime();
          const checkOutTime = new Date(record.checkOut).getTime();
          const totalSession = Math.max(0, (checkOutTime - checkInTime) / 1000);

          const totalBreaks = record.breaks.reduce((acc, b) => {
            if (b.start && b.end) {
              return acc + Math.max(0, (new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
            }
            return acc;
          }, 0);

          record.totalWorkedSeconds = Math.max(0, totalSession - totalBreaks);

          // Calculate flags logic using getFlags utility
          const worked = record.totalWorkedSeconds;

          // Check for half-day
          const hasHalfDay = await LeaveRequest.findOne({
            userId: record.userId,
            startDate: record.date,
            category: 'Half Day Leave',
            status: 'Approved'
          });

          // Check for Extra Time Leave
          let extraTimeLeaveMinutes = 0;
          const extraTimeLeave = await LeaveRequest.findOne({
            userId: record.userId,
            startDate: record.date,
            category: 'Extra Time Leave',
            status: 'Approved'
          });

          if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
            const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
            const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            extraTimeLeaveMinutes = Math.max(0, endMinutes - startMinutes);
          }

          const flags = getFlags(worked, !!hasHalfDay, extraTimeLeaveMinutes);

          record.lowTimeFlag = flags.lowTime;
          record.extraTimeFlag = flags.extraTime;

          await record.save();
          console.log(`User ${record.userId} auto-checked out. worked: ${record.totalWorkedSeconds}s`);
        }
      }
    } catch (error) {
      console.error('Error in 11 PM auto-checkout job:', error);
    }
  });
  console.log('Auto-checkout job scheduled for 23:00 daily');
});

