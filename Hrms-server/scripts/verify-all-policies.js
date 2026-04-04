
const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-06';
const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';
const COMPULSORY_BREAK_EFFECTIVE_DATE = '2026-04-06';
const MIN_NORMAL_MINUTES = 495; // 8h 15m
const MAX_NORMAL_MINUTES = 502; // 8h 22m

// --- LOGIC UNDER TEST ---

const getAbsenceStartDate = (user, firstCheckInDate) => {
  const convertToYYYYMMDD = (dateStr) => {
    const dmYMatch = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (dmYMatch) return `${dmYMatch[3]}-${dmYMatch[2]}-${dmYMatch[1]}`;
    return dateStr;
  };

  let refStr;
  if (user?.joiningDate) refStr = convertToYYYYMMDD(user.joiningDate);
  else if (user?.createdAt) refStr = user.createdAt.split('T')[0];
  else return ABSENCE_PENALTY_EFFECTIVE_DATE;

  if (refStr < ABSENCE_PENALTY_EFFECTIVE_DATE) return ABSENCE_PENALTY_EFFECTIVE_DATE;
  if (firstCheckInDate) return firstCheckInDate;
  return '9999-12-31';
};

const getFlags = (workedMinutes, approvedOvertimeMinutes, dateStr) => {
  const isPrePolicy = dateStr && dateStr < OVERTIME_POLICY_EFFECTIVE_DATE;
  const overtimeAllowed = isPrePolicy || approvedOvertimeMinutes > 0;
  
  return {
    lowTime: workedMinutes > 0 && workedMinutes < MIN_NORMAL_MINUTES,
    extraTime: overtimeAllowed && workedMinutes > MAX_NORMAL_MINUTES
  };
};

const canClockOut = (workedSeconds, earlyLogoutRequestStatus, hasCompletedFullBreak, isCompulsoryBreakDisabled, dateStr) => {
  // Rule 1: Shift Completion (8h 15m)
  if (workedSeconds < 29700 && earlyLogoutRequestStatus !== 'Approved') {
    return { can: false, reason: 'Shift not completed' };
  }

  // Rule 2: Mandatory Break (20m) - Only from April 6th
  const isBreakPolicyActive = dateStr >= COMPULSORY_BREAK_EFFECTIVE_DATE;
  if (!hasCompletedFullBreak && !isCompulsoryBreakDisabled && isBreakPolicyActive) {
    return { can: false, reason: 'Mandatory 20-min break required' };
  }

  return { can: true };
};

const canEndBreak = (durationSeconds, isCompulsoryBreakDisabled, dateStr) => {
    const isBreakPolicyActive = dateStr >= COMPULSORY_BREAK_EFFECTIVE_DATE;
    if (durationSeconds < 1200 && !isCompulsoryBreakDisabled && isBreakPolicyActive) {
        return false;
    }
    return true;
};

// --- TEST SUITE ---

const tests = [];

// 1. ABSENCE TESTS
tests.push({
  feature: 'Absence',
  name: 'Old Emp (Joined Mar) - Tracking starts Apr 6',
  run: () => getAbsenceStartDate({ joiningDate: '20/03/2026' }, '2026-03-20') === '2026-04-06'
});
tests.push({
  feature: 'Absence',
  name: 'New Emp (Apr 8) - Tracking starts on 1st Check-in (Apr 10)',
  run: () => getAbsenceStartDate({ joiningDate: '08/04/2026' }, '2026-04-10') === '2026-04-10'
});

// 2. COMPULSORY BREAK TESTS (DATE SENSITIVE)
tests.push({
  feature: 'Break',
  name: 'Pre-Policy (Apr 1), No Break - Allowed to Clock Out',
  run: () => canClockOut(30000, 'None', false, false, '2026-04-01').can === true
});
tests.push({
  feature: 'Break',
  name: 'Post-Policy (Apr 10), No Break - Blocked from Clock Out',
  run: () => canClockOut(30000, 'None', false, false, '2026-04-10').can === false
});
tests.push({
  feature: 'Break',
  name: 'Post-Policy (Apr 10), Break Taken - Allowed to Clock Out',
  run: () => canClockOut(30000, 'None', true, false, '2026-04-10').can === true
});
tests.push({
  feature: 'Break',
  name: 'Pre-Policy (Apr 1), Short Break - Allowed to End Break',
  run: () => canEndBreak(300, false, '2026-04-01') === true
});
tests.push({
  feature: 'Break',
  name: 'Post-Policy (Apr 10), Short Break - Blocked from Ending',
  run: () => canEndBreak(300, false, '2026-04-10') === false
});

// 3. EARLY CHECKOUT TESTS
tests.push({
  feature: 'Checkout',
  name: 'Worked < 8h 15m, No Approved Request - Blocked',
  run: () => canClockOut(20000, 'Pending', true, false, '2026-04-10').can === false
});
tests.push({
  feature: 'Checkout',
  name: 'Worked < 8h 15m, Approved Request - Allowed',
  run: () => canClockOut(20000, 'Approved', true, false, '2026-04-10').can === true
});

// 4. OVERTIME TESTS (DATE SENSITIVE)
tests.push({
  feature: 'Overtime',
  name: 'Pre-Policy (Mar 15), No Request - Extra Time Allowed',
  run: () => getFlags(600, 0, '2026-03-15').extraTime === true
});
tests.push({
  feature: 'Overtime',
  name: 'Post-Policy (Apr 10), No Request - Extra Time Blocked',
  run: () => getFlags(600, 0, '2026-04-10').extraTime === false
});
tests.push({
  feature: 'Overtime',
  name: 'Post-Policy (Apr 10), Approved Request - Extra Time Allowed',
  run: () => getFlags(600, 30, '2026-04-10').extraTime === true
});

// --- EXECUTION ---

console.log('\n=============================================================');
console.log('   HRMS POLICY VERIFICATION SCRIPT (Absence, Break, OT, EC)  ');
console.log('=============================================================\n');

let passed = 0;
tests.forEach((t, i) => {
  const result = t.run();
  const status = result ? '✅ PASS' : '❌ FAIL';
  if (result) passed++;
  console.log(`[${t.feature.padEnd(8)}] ${t.name.padEnd(50)} | ${status}`);
});

console.log('\n-------------------------------------------------------------');
console.log(`TOTAL: ${tests.length} | PASSED: ${passed} | FAILED: ${tests.length - passed}`);
console.log('=============================================================\n');

if (passed === tests.length) {
  process.exit(0);
} else {
  process.exit(1);
}
