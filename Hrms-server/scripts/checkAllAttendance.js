/**
 * Check ALL attendance records — list dates and count
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
    date: mongoose.Schema.Types.Mixed,
    checkIn: Date,
    checkOut: Date,
    breaks: Array,
    totalWorkedSeconds: { type: Number, default: 0 },
    lowTimeFlag: { type: Boolean, default: false },
    extraTimeFlag: { type: Boolean, default: false },
}, { timestamps: true, strict: false });

let Attendance;
try { Attendance = mongoose.model('Attendance'); } catch { Attendance = mongoose.model('Attendance', attendanceSchema); }

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    const total = await Attendance.countDocuments();
    console.log(`Total attendance records in DB: ${total}`);

    // Get sample of all records
    const sample = await Attendance.find({}).sort({ date: -1 }).limit(30).lean();
    console.log('\nMost recent 30 attendance records:');
    for (const r of sample) {
        console.log(`  date="${r.date}" (type=${typeof r.date}) | checkIn=${r.checkIn ? r.checkIn.toISOString().slice(0, 10) : 'null'} | checkOut=${!!r.checkOut} | user=${r.userId}`);
    }

    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
