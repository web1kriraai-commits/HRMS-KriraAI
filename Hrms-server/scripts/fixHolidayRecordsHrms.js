/**
 * Fix existing attendance records on holiday dates using correct hrms database.
 * Run: node scripts/fixHolidayRecordsHrms.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Connect with dbName from environment variables
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });
console.log('Connected to MongoDB (hrms database).\n');

const db = mongoose.connection.db;

// Step 1: Get all holiday dates
const holidays = await db.collection('companyholidays').find({}).toArray();
const holidayDates = holidays.map(h => typeof h.date === 'string' ? h.date.split('T')[0] : h.date);
console.log(`Found ${holidays.length} holiday(s):`, holidayDates);

if (holidayDates.length === 0) {
    console.log('No holidays in DB. Adding Feb 8 and Feb 22 as Sundays...');
    await db.collection('companyholidays').insertMany([
        { date: '2026-02-08', description: 'Sunday', createdByName: 'System', createdByRole: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { date: '2026-02-22', description: 'Sunday', createdByName: 'System', createdByRole: 'Admin', createdAt: new Date(), updatedAt: new Date() }
    ]);
    console.log('Created 2 holiday records.');
    holidayDates.push('2026-02-08', '2026-02-22');
}

// Step 2: Show all collections and counts
const collections = ['attendances', 'companyholidays', 'users'].map(async name => {
    const count = await db.collection(name).countDocuments();
    return `${name}: ${count}`;
});
console.log('\nDatabase state:', (await Promise.all(collections)).join(' | '));

// Step 3: Find ALL attendance records on holiday dates
const records = await db.collection('attendances').find({
    date: { $in: holidayDates }
}).toArray();

console.log(`\nAttendance records on holiday dates: ${records.length}`);

if (records.length > 0) {
    for (const rec of records) {
        const hasWorked = rec.checkIn && rec.checkOut && (rec.totalWorkedSeconds || 0) > 0;
        const result = await db.collection('attendances').updateOne(
            { _id: rec._id },
            { $set: { lowTimeFlag: false, extraTimeFlag: hasWorked } }
        );
        console.log(`  ${result.modifiedCount > 0 ? 'UPDATED' : 'UNCHANGED'}: date=${rec.date} userId=${rec.userId} low:${rec.lowTimeFlag}→false extra:${rec.extraTimeFlag}→${hasWorked}`);
    }
    console.log('\n✅ Done!');
} else {
    // Also try searching with broader range
    console.log('\nTrying broader attendance search (all Feb 2026 records)...');
    const febRecords = await db.collection('attendances').find({
        date: { $gte: '2026-02-01', $lte: '2026-02-28' }
    }).toArray();
    console.log(`Feb 2026 records found: ${febRecords.length}`);
    febRecords.forEach(r => console.log(`  date=${r.date} user=${r.userId} low=${r.lowTimeFlag} extra=${r.extraTimeFlag} worked=${r.totalWorkedSeconds}`));

    // Also count all
    const total = await db.collection('attendances').countDocuments();
    console.log(`\nTotal attendance records in hrms DB: ${total}`);
    const sample = await db.collection('attendances').find({}).sort({ date: -1 }).limit(10).toArray();
    sample.forEach(r => console.log(`  date=${r.date} user=${r.userId} low=${r.lowTimeFlag} extra=${r.extraTimeFlag}`));
}

await mongoose.disconnect();
