/**
 * Check and report what's in the DB for the target dates.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const attendanceSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    date: String,
    checkIn: Date,
    checkOut: Date,
    breaks: Array,
    totalWorkedSeconds: { type: Number, default: 0 },
    lowTimeFlag: { type: Boolean, default: false },
    extraTimeFlag: { type: Boolean, default: false },
    notes: String
}, { timestamps: true });

const companyHolidaySchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    description: String,
    createdByName: String,
    createdByRole: String
}, { timestamps: true });

let Attendance, CompanyHoliday;
try { Attendance = mongoose.model('Attendance'); } catch { Attendance = mongoose.model('Attendance', attendanceSchema); }
try { CompanyHoliday = mongoose.model('CompanyHoliday'); } catch { CompanyHoliday = mongoose.model('CompanyHoliday', companyHolidaySchema); }

const TARGET_DATES = ['2026-02-08', '2026-02-22'];

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    // Check holidays
    console.log('=== Company Holidays for target dates ===');
    for (const d of TARGET_DATES) {
        const h = await CompanyHoliday.findOne({ date: d });
        console.log(h ? `✅ ${d}: "${h.description}"` : `❌ ${d}: NOT FOUND`);
    }

    // Check attendance - raw query
    console.log('\n=== Attendance records (all, including partial) ===');
    const all = await Attendance.find({ date: { $in: TARGET_DATES } });
    console.log(`Total records on those dates: ${all.length}`);
    for (const r of all) {
        console.log(`  date=${r.date} | userId=${r.userId} | checkIn=${r.checkIn} | checkOut=${r.checkOut} | extraTime=${r.extraTimeFlag} | lowTime=${r.lowTimeFlag} | worked=${r.totalWorkedSeconds}s`);
    }

    // Also try February range
    console.log('\n=== All attendance in Feb 2026 ===');
    const feb = await Attendance.find({ date: { $gte: '2026-02-01', $lte: '2026-02-28' } });
    console.log(`Total Feb 2026 records: ${feb.length}`);
    for (const r of feb) {
        console.log(`  date=${r.date} | userId=${r.userId} | checkIn=${!!r.checkIn} | checkOut=${!!r.checkOut} | extraTime=${r.extraTimeFlag} | lowTime=${r.lowTimeFlag}`);
    }

    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
