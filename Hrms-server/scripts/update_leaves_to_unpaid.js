import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// All approved paid leaves from this date onward are treated as unpaid.
const FROM_DATE = '2026-04-01';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  const db = mongoose.connection.db;
  const collection = db.collection('leaverequests');

  const paidFilter = {
    status: 'Approved',
    category: 'Paid Leave',
    startDate: { $gte: FROM_DATE },
  };

  const halfDayPaidFilter = {
    status: 'Approved',
    category: 'Half Day Leave',
    startDate: { $gte: FROM_DATE },
    reason: /\[Paid Leave\]/,
  };

  const paidLeaves = await collection.find(paidFilter).sort({ startDate: 1 }).toArray();
  const halfDayPaidLeaves = await collection.find(halfDayPaidFilter).sort({ startDate: 1 }).toArray();

  console.log(`Found ${paidLeaves.length} approved Paid Leave(s) from ${FROM_DATE} onward.`);
  console.log(`Found ${halfDayPaidLeaves.length} approved half-day paid leave(s) from ${FROM_DATE} onward.`);

  for (const leave of [...paidLeaves, ...halfDayPaidLeaves]) {
    console.log(
      '-',
      leave.category,
      leave.userName || leave.userId?.toString(),
      leave.startDate,
      leave.endDate,
      leave.reason?.slice(0, 60)
    );
  }

  if (paidLeaves.length === 0 && halfDayPaidLeaves.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const paidResult = await collection.updateMany(paidFilter, {
    $set: { category: 'Unpaid Leave' },
  });

  const halfDayResult = await collection.updateMany(halfDayPaidFilter, [
    {
      $set: {
        reason: {
          $replaceOne: {
            input: '$reason',
            find: '[Paid Leave]',
            replacement: '[Unpaid Leave]',
          },
        },
      },
    },
  ]);

  console.log(`Updated ${paidResult.modifiedCount} full-day leave(s) to Unpaid Leave.`);
  console.log(`Updated ${halfDayResult.modifiedCount} half-day leave(s) to unpaid.`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
