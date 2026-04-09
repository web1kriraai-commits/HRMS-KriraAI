/**
 * Script tests: approved half-day leave
 * - No late check-in penalty that day (getFlags)
 * - Employee may checkout BEFORE 5:30 PM on that date (isClockOutTimeAllowed + min worked gate)
 * - Full-day employees are blocked until 17:30 unless early logout approved
 *
 * Run: node tests/halfDayLeaveCheckoutRules.test.js
 */
import {
  getFlags,
  HALF_DAY_MIN_SHIFT_SECONDS,
  FULL_DAY_MIN_SHIFT_SECONDS,
  isClockOutTimeAllowed,
  isWorkedSecondsSufficientForCheckout
} from '../utils/attendanceUtils.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function assert(condition, message) {
  if (!condition) {
    console.log(`${colors.red}FAIL: ${message}${colors.reset}`);
    return false;
  }
  console.log(`${colors.green}PASS: ${message}${colors.reset}`);
  return true;
}

console.log(`${colors.blue}=== HALF-DAY LEAVE CHECKOUT & PENALTY RULES ===${colors.reset}\n`);

let total = 0;
let passed = 0;

function run(name, fn) {
  total++;
  console.log(`${colors.cyan}[${total}] ${name}${colors.reset}`);
  if (fn()) passed++;
  console.log('');
}

// --- Penalty: on half-day leave date, late check-in penalty does NOT apply (penaltySeconds = 0) ---
run('Half-day leave that day: penaltySeconds = 0 even when check-in is late (10:00)', () => {
  const checkIn = '2026-03-15T10:00:00';
  const worked = 300 * 60;
  const flags = getFlags(worked, true, 0, false, checkIn, false, 0, '2026-03-15');
  return assert(
    flags.penaltySeconds === 0,
    `expected 0 penalty on half-day leave date, got ${flags.penaltySeconds}`
  );
});

run('Same check-in without half-day: late penalty applies', () => {
  const checkIn = '2026-03-15T10:00:00';
  const worked = 300 * 60;
  const flags = getFlags(worked, false, 0, false, checkIn, false, 0, '2026-03-15');
  return assert(
    flags.penaltySeconds > 0,
    `expected penalty when not half-day, got ${flags.penaltySeconds}`
  );
});

// --- Before 5:30 PM: allowed when half-day; blocked when full day ---
run('Half-day: checkout time allowed at 14:00 (before 17:30)', () => {
  const atTwoPm = new Date('2026-06-01T14:00:00');
  const ok = isClockOutTimeAllowed(atTwoPm, { hasHalfDayLeave: true, earlyLogoutApproved: false, roleIsAdmin: false });
  return assert(ok === true, `expected true, got ${ok}`);
});

run('Full day: checkout time NOT allowed at 14:00 (before 17:30)', () => {
  const atTwoPm = new Date('2026-06-01T14:00:00');
  const ok = isClockOutTimeAllowed(atTwoPm, { hasHalfDayLeave: false, earlyLogoutApproved: false, roleIsAdmin: false });
  return assert(ok === false, `expected false, got ${ok}`);
});

run('After 17:30: full day employee may checkout (time gate passes)', () => {
  const atSix = new Date('2026-06-01T18:00:00');
  const ok = isClockOutTimeAllowed(atSix, { hasHalfDayLeave: false, earlyLogoutApproved: false, roleIsAdmin: false });
  return assert(ok === true, `expected true, got ${ok}`);
});

// --- Before 5:30 PM: half-day leave = time gate always passes (can checkout any time of day) ---
run('Half-day: checkout allowed before 5:30 PM — morning (08:15)', () => {
  const t = new Date('2026-06-01T08:15:00');
  return assert(
    isClockOutTimeAllowed(t, { hasHalfDayLeave: true, earlyLogoutApproved: false, roleIsAdmin: false }),
    '08:15 should allow checkout when half-day leave'
  );
});

run('Half-day: checkout allowed before 5:30 PM — noon (12:30)', () => {
  const t = new Date('2026-06-01T12:30:00');
  return assert(
    isClockOutTimeAllowed(t, { hasHalfDayLeave: true, earlyLogoutApproved: false, roleIsAdmin: false }),
    '12:30 should allow checkout when half-day leave'
  );
});

run('Half-day: checkout allowed before 5:30 PM — late afternoon (17:15)', () => {
  const t = new Date('2026-06-01T17:15:00');
  return assert(
    isClockOutTimeAllowed(t, { hasHalfDayLeave: true, earlyLogoutApproved: false, roleIsAdmin: false }),
    '17:15 should allow checkout when half-day leave'
  );
});

run('Full day: still blocked at 17:29 (one minute before 5:30 PM)', () => {
  const t = new Date('2026-06-01T17:29:00');
  const ok = isClockOutTimeAllowed(t, { hasHalfDayLeave: false, earlyLogoutApproved: false, roleIsAdmin: false });
  return assert(ok === false, `expected false at 17:29 for full day, got ${ok}`);
});

run('Full day: allowed at exactly 17:30 (5:30 PM)', () => {
  const t = new Date('2026-06-01T17:30:00');
  const ok = isClockOutTimeAllowed(t, { hasHalfDayLeave: false, earlyLogoutApproved: false, roleIsAdmin: false });
  return assert(ok === true, `expected true at 17:30, got ${ok}`);
});

run('Half-day before 5:30 PM: time gate AND min-hours gate both pass (sample: 14:00, 4h10 worked)', () => {
  const clock = new Date('2026-06-01T14:00:00');
  const worked = 250 * 60;
  const timeOk = isClockOutTimeAllowed(clock, {
    hasHalfDayLeave: true,
    earlyLogoutApproved: false,
    roleIsAdmin: false
  });
  const hoursOk = isWorkedSecondsSufficientForCheckout(worked, {
    hasHalfDayLeave: true,
    earlyLogoutApproved: false
  });
  return assert(
    timeOk && hoursOk,
    `clockOut rules: timeOk=${timeOk} hoursOk=${hoursOk} (mirrors API clockOut checks)`
  );
});

// --- Early checkout (minimum hours): half-day threshold vs full day ---
run('Half-day: 4h08m worked is enough for checkout gate (>= half-day min)', () => {
  const worked = 248 * 60;
  const ok = isWorkedSecondsSufficientForCheckout(worked, { hasHalfDayLeave: true, earlyLogoutApproved: false });
  return assert(
    ok === true && worked >= HALF_DAY_MIN_SHIFT_SECONDS,
    `expected sufficient, HALF_DAY_MIN=${HALF_DAY_MIN_SHIFT_SECONDS}s worked=${worked}`
  );
});

run('Full day: 4h08m worked is NOT enough for checkout gate (needs 8h15)', () => {
  const worked = 248 * 60;
  const ok = isWorkedSecondsSufficientForCheckout(worked, { hasHalfDayLeave: false, earlyLogoutApproved: false });
  return assert(ok === false, `expected false, got ${ok}`);
});

run('Constants: half-day min < full-day min', () => {
  return assert(
    HALF_DAY_MIN_SHIFT_SECONDS < FULL_DAY_MIN_SHIFT_SECONDS,
    `HALF_DAY=${HALF_DAY_MIN_SHIFT_SECONDS} FULL=${FULL_DAY_MIN_SHIFT_SECONDS}`
  );
});

console.log(`${colors.blue}=== SUMMARY ===${colors.reset}`);
console.log(`Passed: ${passed === total ? colors.green : colors.red}${passed}${colors.reset} / ${total}`);
if (passed !== total) {
  process.exit(1);
}
console.log(`${colors.green}Half-day leave rules OK.${colors.reset}`);
