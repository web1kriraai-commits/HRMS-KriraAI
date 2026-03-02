/**
 * Creates attendance records for ALL employees on Feb 8 & Feb 22, 2026
 * and marks them as extraTimeFlag=true (holiday overtime).
 *
 * If a record already exists for that date, it updates the flags.
 * If no record exists, it creates one with a default 8-hour work day.
 *
 * Run: node scripts/createHolidayAttendance.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// ---- Schemas ----
const userSchema = new mongoose.Schema({
    name: String,
    username: String,
    role: String,
    isActive: Boolean
}, { timestamps: true, strict: false });

const breakSchema = new mongoose.Schema({
    start: Date, end: Date, type: String, durationSeconds: { type: Number, default: 0 }
}, { _id: true });

const attendanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    checkIn: Date,
    checkOut: Date,
    location: String,
    breaks: [breakSchema],
    totalWorkedSeconds: { type: Number, default: 0 },
    lowTimeFlag: { type: Boolean, default: false },
    extraTimeFlag: { type: Boolean, default: false },
    notes: String
}, { timestamps: true });

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

const companyHolidaySchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    description: String,
    createdByName: String,
    createdByRole: String
}, { timestamps: true });

let User, Attendance, CompanyHoliday;
try { User = mongoose.model('User'); } catch { User = mongoose.model('User', userSchema); }
try { Attendance = mongoose.model('Attendance'); } catch { Attendance = mongoose.model('Attendance', attendanceSchema); }
try { CompanyHoliday = mongoose.model('CompanyHoliday'); } catch { CompanyHoliday = mongoose.model('CompanyHoliday', companyHolidaySchema); }

// The two holiday dates
const TARGET_DATES = ['2026-02-08', '2026-02-22'];

// Default work hours for the holiday (you can change these)
const DEFAULT_CHECK_IN_HOUR = 9;   // 9:00 AM
const DEFAULT_CHECK_IN_MIN = 0;
const DEFAULT_WORKED_HOURS = 8;    // 8 hours of work
const DEFAULT_BREAK_MINUTES = 30;  // 30 min break

function buildCheckInDate(dateStr, hour, min) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCHours(hour - 5, min - 30, 0, 0); // Convert IST to UTC (IST = UTC+5:30)
    return d;
}

async function run() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    // Step 1: Ensure holidays exist
    console.log('=== Step 1: Ensuring holidays exist ===');
    for (const date of TARGET_DATES) {
        const existing = await CompanyHoliday.findOne({ date });
        if (existing) {
            console.log(`✅ Holiday exists: ${date} (${existing.description})`);
        } else {
            await CompanyHoliday.create({ date, description: 'Sunday', createdByName: 'System', createdByRole: 'Admin' });
            console.log(`✅ Created holiday: ${date}`);
        }
    }

    // Step 2: Get all active employees
    console.log('\n=== Step 2: Finding all active employees ===');
    const employees = await User.find({ isActive: { $ne: false } }).lean();
    console.log(`Found ${employees.length} user(s): ${employees.map(e => `${e.name}(${e.role})`).join(', ')}`);

    if (employees.length === 0) {
        console.log('No employees found. Please create employees first.');
        await mongoose.disconnect();
        return;
    }

    // Step 3: Create/update attendance for each employee on each holiday date
    console.log('\n=== Step 3: Creating/Updating attendance records ===');
    let created = 0;
    let updated = 0;

    for (const date of TARGET_DATES) {
        console.log(`\n📅 Processing date: ${date}`);

        for (const emp of employees) {
            const existingRecord = await Attendance.findOne({ userId: emp._id, date });

            if (existingRecord) {
                // Record exists — just update the flags
                const prevLow = existingRecord.lowTimeFlag;
                const prevExtra = existingRecord.extraTimeFlag;

                existingRecord.lowTimeFlag = false;
                existingRecord.extraTimeFlag = existingRecord.checkIn && existingRecord.checkOut
                    ? existingRecord.totalWorkedSeconds > 0
                    : true; // If no times, still mark as OT since it's a holiday
                existingRecord.notes = (existingRecord.notes || '') + ' [Holiday Work - Overtime]';

                await existingRecord.save();
                updated++;
                console.log(`  ✅ UPDATED ${emp.name}: lowTime ${prevLow}→false | extraTime ${prevExtra}→${existingRecord.extraTimeFlag}`);
            } else {
                // No record — create a new one with default 8-hour work
                const checkInDate = buildCheckInDate(date, DEFAULT_CHECK_IN_HOUR, DEFAULT_CHECK_IN_MIN);
                const breakStartDate = new Date(checkInDate.getTime() + (3.5 * 60 * 60 * 1000)); // 3.5h after checkin
                const breakEndDate = new Date(breakStartDate.getTime() + DEFAULT_BREAK_MINUTES * 60 * 1000);
                const checkOutDate = new Date(checkInDate.getTime() + (DEFAULT_WORKED_HOURS * 60 * 60 * 1000) + (DEFAULT_BREAK_MINUTES * 60 * 1000));

                const workedSeconds = DEFAULT_WORKED_HOURS * 3600; // Net work = 8 hours (excluding break)

                const record = new Attendance({
                    userId: emp._id,
                    date,
                    checkIn: checkInDate,
                    checkOut: checkOutDate,
                    location: 'Office',
                    breaks: [{
                        start: breakStartDate,
                        end: breakEndDate,
                        type: 'Standard',
                        durationSeconds: DEFAULT_BREAK_MINUTES * 60
                    }],
                    totalWorkedSeconds: workedSeconds,
                    lowTimeFlag: false,
                    extraTimeFlag: true, // Holiday = full overtime
                    notes: 'Holiday Work - Overtime (auto-created)'
                });

                await record.save();
                created++;
                console.log(`  ✅ CREATED ${emp.name}: checkin=${checkInDate.toISOString()} | worked=${DEFAULT_WORKED_HOURS}h | extraTime=true`);
            }
        }
    }

    console.log(`\n🎉 Done! Created: ${created}, Updated: ${updated}`);
    console.log('\nSummary:');
    console.log(`  - Dates processed: ${TARGET_DATES.join(', ')}`);
    console.log(`  - Employees processed: ${employees.length}`);
    console.log(`  - Records created: ${created}`);
    console.log(`  - Records updated: ${updated}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
}

run().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});
