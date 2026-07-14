/**
 * Import bank details + mobile from Employee Bank Details Excel (JSON export).
 *
 * Usage:
 *   node scripts/import_employee_bank_details.js          # apply updates
 *   node scripts/import_employee_bank_details.js --dry-run # preview only
 */
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dryRun = process.argv.includes('--dry-run');

const MANUAL_ALIASES = {
  'jasmin kachhadiya': 'jasamin kachhadiya',
  'jenish bravaliya': 'jenish barvaliya',
  'rupesh garsondiya pankajbhai': 'rupesh garasodiya',
  'gondaliya yash hareshbhai': 'yash gondaliya',
  'aditya shrivastav sanjay': 'aditya shrivastav',
  'solanki keval sharadbhai': 'keval solanki',
  'narendra govindbhai mali': 'narendra mali',
  'thakur prashantkumar radhakrishna': 'prashant thakur',
  'patel harsh vinodbhai': 'harsh patel',
  'nasit jemil bharatbhai': 'jemil nasit',
  'himanshi maheshbhai patel': 'himanshi patel',
  'kalariya hit': 'hit kalariya',
  'maulik jaysukhbhai ghoghari': 'maulik ghoghari',
  'bhadani arshit mansukhbhai': 'arshit bhadani',
};

const normalizeName = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\b(mr\.?|mrs\.?|ms\.?|miss)\b/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const nameTokens = (name) =>
  normalizeName(name)
    .split(' ')
    .filter((t) => t.length > 1);

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const last10 = (value) => {
  const d = digitsOnly(value);
  return d.length >= 10 ? d.slice(-10) : d;
};

function scoreMatch(row, user) {
  const rowTokens = new Set(nameTokens(row.employeeFullName));
  const userTokens = new Set(nameTokens(user.name));
  if (rowTokens.size === 0 || userTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of rowTokens) {
    if (userTokens.has(t)) overlap += 1;
  }

  // Bonus when first+last appear regardless of order
  const rowArr = [...rowTokens];
  const userArr = [...userTokens];
  const sharedSignificant = rowArr.filter((t) => userTokens.has(t) && t.length >= 4);

  let score = overlap * 10 + sharedSignificant.length * 5;

  const alias = MANUAL_ALIASES[normalizeName(row.employeeFullName)];
  if (alias && normalizeName(user.name) === alias) score += 50;
  if (normalizeName(user.name) === normalizeName(row.employeeFullName)) score += 40;

  const rowMobile = last10(row.mobileNumber);
  const userMobile = last10(user.mobileNumber || user.phone);
  if (rowMobile && userMobile && rowMobile === userMobile) score += 30;

  if (user.isActive === false) score -= 20;

  return score;
}

function findBestUser(row, users) {
  const scored = users
    .map((u) => ({ user: u, score: scoreMatch(row, u) }))
    .filter((x) => x.score >= 20)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  // Prefer active among top scores
  const topScore = scored[0].score;
  const top = scored.filter((x) => x.score >= topScore - 5);
  const activeTop = top.find((x) => x.user.isActive !== false);
  return (activeTop || scored[0]).user;
}

async function run() {
  const dataPath = path.join(__dirname, 'bank_details_import_data.json');
  const rows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'hrms',
  });
  const db = mongoose.connection.db;
  const users = await db.collection('users').find({}).toArray();

  const updated = [];
  const skipped = [];
  const unmatched = [];

  for (const row of rows) {
    const user = findBestUser(row, users);
    if (!user) {
      unmatched.push(row.employeeFullName);
      continue;
    }

    const accountNumber = digitsOnly(row.bankAccountNumber);
    const ifsc = String(row.ifscCode || '').trim().toUpperCase();
    const holder = String(row.accountHolderName || row.employeeFullName).trim();
    const bankName = String(row.bankName || '').trim();
    const mobile = last10(row.mobileNumber) || undefined;

    if (!accountNumber || accountNumber.length < 9 || accountNumber.length > 18) {
      skipped.push({ name: row.employeeFullName, reason: `invalid account: ${row.bankAccountNumber}` });
      continue;
    }
    if (ifsc.length !== 11) {
      skipped.push({ name: row.employeeFullName, reason: `invalid IFSC: ${row.ifscCode}` });
      continue;
    }

    const patch = {
      bankName,
      bankAccountHolderName: holder,
      bankAccountNumber: accountNumber,
      bankIfscCode: ifsc,
    };
    if (mobile) patch.mobileNumber = mobile;

    if (!dryRun) {
      await db.collection('users').updateOne({ _id: user._id }, { $set: patch });
    }

    updated.push({
      excel: row.employeeFullName,
      dbName: user.name,
      dbId: String(user._id),
      wasActive: user.isActive,
      ...patch,
    });
  }

  console.log(dryRun ? '=== DRY RUN ===' : '=== APPLIED ===');
  console.log(`Updated: ${updated.length}`);
  for (const u of updated) {
    console.log(
      `  ✓ ${u.excel} → ${u.dbName} | ${u.bankName} | ${u.bankAccountNumber} | ${u.bankIfscCode} | mobile=${u.mobileNumber || '-'}`
    );
  }
  if (skipped.length) {
    console.log(`\nSkipped: ${skipped.length}`);
    for (const s of skipped) console.log(`  ✗ ${s.name}: ${s.reason}`);
  }
  if (unmatched.length) {
    console.log(`\nUnmatched: ${unmatched.length}`);
    for (const n of unmatched) console.log(`  ? ${n}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
