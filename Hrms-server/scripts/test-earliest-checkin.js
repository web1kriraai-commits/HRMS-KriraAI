/**
 * Verifies earliest check-in window (8:30 company local time) via isClockInTimeAllowed.
 * Run: npm run test:checkin-window
 * Or:  node scripts/test-earliest-checkin.js
 */

import {
  isClockInTimeAllowed,
  EARLIEST_CHECK_IN_HOUR,
  EARLIEST_CHECK_IN_MINUTE
} from '../utils/attendanceUtils.js';

const TZ_IST = 'Asia/Kolkata';
const TZ_UTC = 'UTC';

function assert(name, condition) {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok  ${name}`);
  return true;
}

// Fixed UTC instants ↔ known wall time in Asia/Kolkata (no DST, +05:30)
const cases = [
  {
    name: '08:15 IST → blocked',
    date: new Date('2026-04-09T02:45:00.000Z'),
    tz: TZ_IST,
    expectAllowed: false
  },
  {
    name: '08:29 IST → blocked',
    date: new Date('2026-04-09T02:59:00.000Z'),
    tz: TZ_IST,
    expectAllowed: false
  },
  {
    name: '08:30 IST → allowed',
    date: new Date('2026-04-09T03:00:00.000Z'),
    tz: TZ_IST,
    expectAllowed: true
  },
  {
    name: '09:00 IST → allowed',
    date: new Date('2026-04-09T03:30:00.000Z'),
    tz: TZ_IST,
    expectAllowed: true
  },
  {
    name: 'UTC company: 08:15 → blocked',
    date: new Date('2026-04-09T08:15:00.000Z'),
    tz: TZ_UTC,
    expectAllowed: false
  },
  {
    name: 'UTC company: 08:30 → allowed',
    date: new Date('2026-04-09T08:30:00.000Z'),
    tz: TZ_UTC,
    expectAllowed: true
  }
];

console.log(
  `Testing earliest check-in: ${EARLIEST_CHECK_IN_HOUR}:${String(EARLIEST_CHECK_IN_MINUTE).padStart(2, '0')} (company timezone)\n`
);

for (const { name, date, tz, expectAllowed } of cases) {
  const got = isClockInTimeAllowed(date, tz);
  assert(name, got === expectAllowed);
}

if (process.exitCode === 1) {
  console.error('\nSome tests failed.');
  process.exit(1);
}

console.log('\nAll tests passed.');
