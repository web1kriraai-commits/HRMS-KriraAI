/**
 * Fix existing attendance records on holiday dates:
 * Set lowTimeFlag=false, extraTimeFlag=true for all records on company holiday dates.
 *
 * Run: node scripts/fixExistingHolidayRecords.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

await mongoose.connect(process.env.MONGODB_URI);
console.log('Connected to MongoDB.\n');

const db = mongoose.connection.db;

// Step 1: Get all holiday dates
const holidays = await db.collection('companyholidays').find({}).toArray();
const holidayDates = holidays.map(h => h.date);
console.log(`Found ${holidays.length} holiday(s):`, holidayDates);

// Step 2: Find ALL attendance records on those dates
const records = await db.collection('attendances').find({
    date: { $in: holidayDates }
}).toArray();

console.log(`\nFound ${records.length} attendance record(s) on holiday dates.`);

if (records.length === 0) {
    console.log('\nNo records to update.');
    await mongoose.disconnect();
    process.exit(0);
}

// Step 3: Update them — lowTimeFlag=false, extraTimeFlag=true
let updatedCount = 0;
for (const rec of records) {
    const hasWorked = rec.checkIn && rec.checkOut && (rec.totalWorkedSeconds || 0) > 0;
    const result = await db.collection('attendances').updateOne(
        { _id: rec._id },
        {
            $set: {
                lowTimeFlag: false,
                extraTimeFlag: hasWorked ? true : false
            }
        }
    );
    if (result.modifiedCount > 0) {
        updatedCount++;
        console.log(
            `  UPDATED: date=${rec.date} | userId=${rec.userId} | ` +
            `lowTime: ${rec.lowTimeFlag}→false | extraTime: ${rec.extraTimeFlag}→${hasWorked}`
        );
    } else {
        console.log(`  UNCHANGED: date=${rec.date} | userId=${rec.userId} (already correct)`);
    }
}

console.log(`\n✅ Done! ${updatedCount}/${records.length} record(s) updated.`);
await mongoose.disconnect();
