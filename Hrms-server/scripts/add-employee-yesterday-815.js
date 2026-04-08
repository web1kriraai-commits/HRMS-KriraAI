/**
 * Creates (or resets) an Employee user and one completed attendance row for
 * the previous calendar day (local date) with net worked time = 8h 15m (29700s).
 *
 * Login (printed at end):
 *   Username: emp_yesterday_815
 *   Password: Employee815!
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { calculateWorkedSeconds, getFlags } from '../utils/attendanceUtils.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

const USERNAME = 'emp_yesterday_815';
const PASSWORD = 'Employee815!';
const EMAIL = 'emp_yesterday_815@demo.local';

function getLocalYyyyMmDd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterdayLocalStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalYyyyMmDd(d);
}

async function main() {
  await mongoose.connect(MONGO_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms'
  });
  console.log('Connected to MongoDB');

  let user = await User.findOne({ username: USERNAME });
  if (!user) {
    user = new User({
      name: 'Yesterday 8h15 Demo',
      username: USERNAME,
      email: EMAIL,
      password: PASSWORD,
      role: 'Employee',
      department: 'Demo',
      joiningDate: '01/01/2020',
      isActive: true
    });
    console.log('Creating user:', USERNAME);
  } else {
    user.password = PASSWORD;
    user.name = user.name || 'Yesterday 8h15 Demo';
    user.isActive = true;
    console.log('Updating existing user:', USERNAME);
  }
  await user.save();

  const dateStr = getYesterdayLocalStr();
  const [y, mo, da] = dateStr.split('-').map(Number);

  // 09:00–17:45 = 8h 45m on clock; minus 30m break → 8h 15m net (29700s). On-time check-in (no penalty).
  const checkIn = new Date(y, mo - 1, da, 9, 0, 0, 0);
  const breakStart = new Date(y, mo - 1, da, 13, 0, 0, 0);
  const breakEnd = new Date(y, mo - 1, da, 13, 30, 0, 0);
  const checkOut = new Date(y, mo - 1, da, 17, 45, 0, 0);
  const breakSeconds = 30 * 60;

  await Attendance.deleteMany({ userId: user._id, date: dateStr });

  const draft = {
    checkIn,
    checkOut,
    breaks: [
      {
        start: breakStart,
        end: breakEnd,
        type: 'Standard',
        durationSeconds: breakSeconds
      }
    ],
    manualHours: []
  };

  const grossWorked = calculateWorkedSeconds(draft, checkOut.toISOString());
  const flags = getFlags(grossWorked, false, 0, false, checkIn, false, 0, dateStr);
  const totalWorkedSeconds = Math.max(0, grossWorked - flags.penaltySeconds);

  const attendance = new Attendance({
    userId: user._id,
    date: dateStr,
    checkIn,
    checkOut,
    location: 'Office',
    breaks: draft.breaks,
    totalWorkedSeconds,
    penaltySeconds: flags.penaltySeconds,
    lateCheckIn: flags.lateCheckIn,
    lowTimeFlag: flags.lowTime,
    extraTimeFlag: flags.extraTime,
    isPenaltyDisabled: false,
    isManualFlag: false
  });

  await attendance.save();

  console.log('\n--- Done ---');
  console.log('Attendance date (yesterday, local):', dateStr);
  console.log('Net worked seconds:', totalWorkedSeconds, '(expected 29700 = 08:15:00)');
  console.log('\nLogin:');
  console.log('  Username:', USERNAME);
  console.log('  Password:', PASSWORD);
  console.log('------------\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
