import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
// Import auto add Sundays function
import { autoAddSundays } from './controllers/holidayController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  
  // Auto-add Sundays if today is Saturday
  try {
    const result = await autoAddSundays();
    if (result.added > 0) {
      console.log(`Auto-added ${result.added} Sunday(s) as holiday: ${result.dates.join(', ')}`);
    }
  } catch (error) {
    console.error('Error auto-adding Sundays:', error);
  }
  
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

