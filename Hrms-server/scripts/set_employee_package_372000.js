/**
 * Set annual package to 3.72 lakh (372000) for all Employee/HR users
 * and sync salaryBreakdown monthly amounts to package / 12.
 *
 * Verify: node scripts/set_employee_package_372000.js --verify
 * Apply:   node scripts/set_employee_package_372000.js --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const ANNUAL_PACKAGE = 372000;
const MONTHLY_SALARY = Math.round((ANNUAL_PACKAGE / 12) * 100) / 100;
const MODE = process.argv.includes('--apply') ? 'apply' : 'verify';

const parseDDMMYYYY = (dateStr) => {
  if (!dateStr || !/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return null;
  const [day, month, year] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const breakdownAmountForRow = (item) => {
  if (!item.isPartialMonth) return MONTHLY_SALARY;
  const start = parseDDMMYYYY(item.startDate);
  const end = parseDDMMYYYY(item.endDate);
  if (!start || !end) return MONTHLY_SALARY;
  const daysInMonth = getDaysInMonth(start.getFullYear(), start.getMonth() + 1);
  const daysWorked = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.round((MONTHLY_SALARY / daysInMonth) * daysWorked * 100) / 100;
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Mode: ${MODE}`);
  console.log(`Target package: ₹${ANNUAL_PACKAGE.toLocaleString('en-IN')} (monthly ₹${MONTHLY_SALARY.toLocaleString('en-IN')})`);

  const users = await User.find({ role: { $in: ['Employee', 'HR'] } }).select('name role package salaryBreakdown');
  let packageUpdates = 0;
  let breakdownUpdates = 0;

  for (const user of users) {
    const needsPackage = !user.package || user.package <= 0 || user.package !== ANNUAL_PACKAGE;
    const breakdown = Array.isArray(user.salaryBreakdown) ? user.salaryBreakdown : [];
    const needsBreakdownSync = breakdown.some((row) => {
      const expected = breakdownAmountForRow(row);
      return Math.abs((row.amount || 0) - expected) > 0.01;
    });

    if (needsPackage || needsBreakdownSync) {
      console.log(`- ${user.name} (${user.role}): package=${user.package || 0}, breakdown rows=${breakdown.length}`);
      if (needsPackage) packageUpdates += 1;
      if (needsBreakdownSync) breakdownUpdates += 1;

      if (MODE === 'apply') {
        user.package = ANNUAL_PACKAGE;
        if (breakdown.length > 0) {
          user.salaryBreakdown = breakdown.map((row) => ({
            ...row.toObject?.() ?? row,
            amount: breakdownAmountForRow(row),
          }));
        }
        await user.save();
      }
    }
  }

  console.log(`\nUsers needing package update: ${packageUpdates}`);
  console.log(`Users needing salaryBreakdown sync: ${breakdownUpdates}`);

  if (MODE === 'verify') {
    console.log('\nRun with --apply to update the database.');
  } else {
    console.log('\nDone.');
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
