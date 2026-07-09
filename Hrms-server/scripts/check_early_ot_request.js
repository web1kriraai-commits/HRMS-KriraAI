import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const employeeName = process.argv[2] || 'Jemil Nasit';
const targetDate = process.argv[3] || '2026-07-07';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({
    name: { $regex: new RegExp(`^${employeeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });

  if (!user) {
    console.log(JSON.stringify({ found: false, error: `Employee not found: ${employeeName}` }, null, 2));
    process.exit(1);
  }

  const attendance = await db.collection('attendances').findOne({
    userId: user._id,
    date: targetDate,
  });

  const earlyOt = attendance?.earlyOvertime || null;
  const hasEarlyOtRequest = Boolean(
    attendance &&
      (earlyOt?.requestStatus ||
        earlyOt?.requestedAt ||
        attendance.earlyLogoutRequest !== 'None')
  );

  console.log(
    JSON.stringify(
      {
        employee: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          department: user.department,
        },
        date: targetDate,
        hasAttendance: Boolean(attendance),
        hasEarlyOtRequest,
        earlyLogoutRequest: attendance?.earlyLogoutRequest || null,
        earlyLogoutRequestNote: attendance?.earlyLogoutRequestNote || null,
        earlyOvertime: earlyOt,
        attendanceSummary: attendance
          ? {
              checkIn: attendance.checkIn,
              checkOut: attendance.checkOut,
              totalWorkedSeconds: attendance.totalWorkedSeconds,
              updatedAt: attendance.updatedAt,
            }
          : null,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
