import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './config/database.js';

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
    'http://82.112.226.75:3003',
    'http://82.112.226.75:3002'
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
});

