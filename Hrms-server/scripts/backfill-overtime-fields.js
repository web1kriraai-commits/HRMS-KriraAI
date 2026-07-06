/**
 * Additive backfill: copy legacy overtimeRequest → generalOvertimeMinutes
 * where generalOvertimeMinutes is missing or zero.
 *
 * Does NOT delete or modify overtimeRequest, managementOvertime, or any other fields.
 *
 * Run: node scripts/backfill-overtime-fields.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Attendance from '../models/Attendance.js';
import { getLegacyGeneralOvertimeMinutes } from '../utils/attendanceUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const renderProgress = (current, total, label = 'Backfill') => {
  const pct = total === 0 ? 100 : Math.round((current / total) * 100);
  const filled = Math.round(pct / 2);
  const bar = `[${'='.repeat(filled)}${' '.repeat(50 - filled)}]`;
  process.stdout.write(`\r${label}: ${bar} ${pct}% (${current}/${total})`);
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms'
  });
  console.log('Connected to MongoDB.\n');

  const records = await Attendance.find({
    $or: [
      { generalOvertimeMinutes: { $exists: false } },
      { generalOvertimeMinutes: null },
      { generalOvertimeMinutes: 0 }
    ],
    'overtimeRequest.completedMinutes': { $gt: 0 }
  });

  const total = records.length;
  console.log(`Found ${total} record(s) with legacy OT to backfill.\n`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i++) {
    renderProgress(i + 1, total);
    const record = records[i];
    const legacyMins = getLegacyGeneralOvertimeMinutes(record);

    if (legacyMins <= 0) {
      skipped++;
      continue;
    }

    const current = record.generalOvertimeMinutes || 0;
    if (current >= legacyMins) {
      skipped++;
      continue;
    }

    record.generalOvertimeMinutes = legacyMins;
    await record.save();
    updated++;
  }

  renderProgress(total, total);
  console.log('\n');
  console.log(`Done. Updated: ${updated}, Skipped (already OK): ${skipped}, Total scanned: ${total}`);
  console.log('No overtimeRequest or other fields were removed or modified.');

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('\nBackfill failed:', err);
  process.exit(1);
});
