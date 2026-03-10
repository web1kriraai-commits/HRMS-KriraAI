/**
 * Fix old attendance records where Half Day Leave was approved
 * but lowTimeFlag was incorrectly set to true.
 *
 * Business rule:
 *   - Half-day normal threshold = 4 hours (14400 seconds)
 *   - If employee worked >= 4h on a half-day leave day → NOT low time
 *   - If employee worked < 4h on a half-day leave day  → low time (penalty still applies)
 *
 * Run: node scripts/fixHalfDayRecords.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const HALF_DAY_MIN_SECONDS = 4 * 3600; // 4 hours = 14400 seconds
const MIN_NORMAL_SECONDS = (8 * 3600) + (15 * 60); // 8h 15m = 29700 seconds

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });
console.log('Connected to MongoDB (hrms database).\n');

const db = mongoose.connection.db;

// ── Step 1: Find all approved Half Day Leave requests ──────────────────────────
const halfDayLeaves = await db.collection('leaverequests').find({
    category: 'Half Day Leave',
    status: 'Approved'
}).toArray();

console.log(`Found ${halfDayLeaves.length} approved Half Day Leave request(s).`);

if (halfDayLeaves.length === 0) {
    console.log('Nothing to fix. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
}

// Build a lookup Set: "userId-date" → true
const halfDaySet = new Set(
    halfDayLeaves.map(l => `${l.userId.toString()}-${(l.startDate || '').split('T')[0]}`)
);

// Collect unique dates
const leaveDates = [...new Set(halfDayLeaves.map(l => (l.startDate || '').split('T')[0]))];
console.log(`Dates covered: ${leaveDates.join(', ')}\n`);

// ── Step 2: Fetch attendance records on those dates ────────────────────────────
const records = await db.collection('attendances').find({
    date: { $in: leaveDates },
    checkIn: { $exists: true, $ne: null },
    checkOut: { $exists: true, $ne: null }
}).toArray();

console.log(`Attendance records on half-day leave dates: ${records.length}\n`);

// ── Step 3: Evaluate and fix each record ──────────────────────────────────────
let updatedCount = 0;
let skippedCount = 0;

for (const rec of records) {
    // Skip manually-flagged records
    if (rec.isManualFlag) {
        skippedCount++;
        continue;
    }

    const uid = rec.userId.toString();
    const date = (rec.date || '').split('T')[0];
    const key = `${uid}-${date}`;

    // Only process records that match an approved half-day leave
    if (!halfDaySet.has(key)) continue;

    // Calculate net worked seconds
    const checkIn = new Date(rec.checkIn).getTime();
    const checkOut = new Date(rec.checkOut).getTime();
    const totalSessionSecs = Math.max(0, (checkOut - checkIn) / 1000);

    // Sum break durations
    const breakSecs = (rec.breaks || []).reduce((acc, b) => {
        if (b.start && b.end) {
            return acc + Math.max(0, (new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
        }
        return acc;
    }, 0);

    const netWorkedSecs = Math.max(0, totalSessionSecs - breakSecs);
    // Apply stored penalty seconds if available
    const penaltySecs = rec.penaltySeconds || 0;
    const effectiveSecs = Math.max(0, netWorkedSecs - penaltySecs);

    // Determine correct flags under half-day rules
    const shouldBeLow = effectiveSecs > 0 && effectiveSecs < HALF_DAY_MIN_SECONDS;
    const shouldBeExtra = effectiveSecs > (MIN_NORMAL_SECONDS / 2); // >4h 7.5m counts as extra

    const currentLow = rec.lowTimeFlag;
    const currentExtra = rec.extraTimeFlag;

    // Only update if something changes
    if (currentLow === shouldBeLow && currentExtra === shouldBeExtra) {
        console.log(`  UNCHANGED: date=${date} userId=${uid} low=${currentLow} extra=${currentExtra} worked=${Math.round(effectiveSecs / 60)}m`);
        continue;
    }

    await db.collection('attendances').updateOne(
        { _id: rec._id },
        { $set: { lowTimeFlag: shouldBeLow, extraTimeFlag: shouldBeExtra } }
    );

    updatedCount++;
    console.log(
        `  UPDATED:   date=${date} userId=${uid} ` +
        `low: ${currentLow} → ${shouldBeLow} | ` +
        `extra: ${currentExtra} → ${shouldBeExtra} | ` +
        `worked: ${Math.round(effectiveSecs / 60)}m`
    );
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n─────────────────────────────────────────`);
console.log(`✅ Done! ${updatedCount} record(s) updated. ${skippedCount} manual-flag record(s) skipped.`);

await mongoose.disconnect();
