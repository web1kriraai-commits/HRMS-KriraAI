/**
 * One-time migration script:
 * 1. Ensures 2026-02-08 (Feb 8) and 2026-02-22 (Feb 22) exist as CompanyHolidays (both Sundays)
 * 2. Finds all attendance records on those dates
 * 3. Sets extraTimeFlag=true, lowTimeFlag=false for all workers on those days
 *
 * Run: node scripts/fixHolidayDates.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// Inline the models we need
const breakSchema = new mongoose.Schema({
    start: { type: Date },
    end: { type: Date },
    type: { type: String, default: 'Standard' },
    durationSeconds: { type: Number, default: 0 },
    reason: { type: String }
}, { _id: true });

const attendanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: String },
    checkIn: { type: Date },
    checkOut: { type: Date },
    location: { type: String },
    breaks: [breakSchema],
    totalWorkedSeconds: { type: Number, default: 0 },
    lowTimeFlag: { type: Boolean, default: false },
    extraTimeFlag: { type: Boolean, default: false },
    notes: { type: String }
}, { timestamps: true });

const companyHolidaySchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    createdByName: { type: String },
    createdByRole: { type: String }
}, { timestamps: true });

let Attendance, CompanyHoliday;
try {
    Attendance = mongoose.model('Attendance');
} catch {
    Attendance = mongoose.model('Attendance', attendanceSchema);
}

try {
    CompanyHoliday = mongoose.model('CompanyHoliday');
} catch {
    CompanyHoliday = mongoose.model('CompanyHoliday', companyHolidaySchema);
}

// The two holiday dates to fix
const TARGET_DATES = ['2026-02-08', '2026-02-22'];

const calculateWorkedSeconds = (checkIn, checkOut, breaks) => {
    if (!checkIn || !checkOut) return 0;
    const totalSession = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 1000;
    const totalBreaks = (breaks || []).reduce((acc, b) => {
        if (b.start && b.end) {
            return acc + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000;
        }
        return acc;
    }, 0);
    return Math.max(0, totalSession - totalBreaks);
};

async function run() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    // Step 1: Ensure both dates are in CompanyHoliday
    console.log('=== Step 1: Ensuring holiday records exist ===');
    const descriptions = {
        '2026-02-08': 'Sunday',
        '2026-02-22': 'Sunday'
    };

    for (const date of TARGET_DATES) {
        const existing = await CompanyHoliday.findOne({ date });
        if (existing) {
            console.log(`✅ Holiday already exists: ${date} (${existing.description})`);
        } else {
            const holiday = new CompanyHoliday({
                date,
                description: descriptions[date] || 'Holiday',
                createdByName: 'System',
                createdByRole: 'Admin'
            });
            await holiday.save();
            console.log(`✅ Created holiday: ${date}`);
        }
    }

    // Step 2: Find all attendance records on those dates
    console.log('\n=== Step 2: Finding attendance records on target dates ===');
    const records = await Attendance.find({
        date: { $in: TARGET_DATES },
        checkIn: { $exists: true, $ne: null },
        checkOut: { $exists: true, $ne: null }
    });

    if (records.length === 0) {
        console.log('No attendance records found for those dates.');
        await mongoose.disconnect();
        return;
    }

    console.log(`Found ${records.length} record(s).`);

    // Step 3: Update them all
    console.log('\n=== Step 3: Updating flags to extraTimeFlag=true, lowTimeFlag=false ===');
    let updatedCount = 0;

    for (const record of records) {
        const worked = calculateWorkedSeconds(record.checkIn, record.checkOut, record.breaks);

        const prevLow = record.lowTimeFlag;
        const prevExtra = record.extraTimeFlag;
        const prevWorked = record.totalWorkedSeconds;

        // Holiday rule: all worked time = overtime
        record.lowTimeFlag = false;
        record.extraTimeFlag = worked > 0; // true if any work was done
        record.totalWorkedSeconds = worked;

        await record.save();
        updatedCount++;

        console.log(
            `  [${record.date}] userId=${record.userId} | worked=${Math.round(worked / 60)}m | ` +
            `lowTime: ${prevLow} → ${record.lowTimeFlag} | extraTime: ${prevExtra} → ${record.extraTimeFlag} | ` +
            `workedSec: ${prevWorked} → ${record.totalWorkedSeconds}`
        );
    }

    console.log(`\n✅ Done! Updated ${updatedCount}/${records.length} record(s).`);
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
}

run().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});
