
const EXTRA_TIME_THRESHOLD_MINUTES = 502; // 8h 22m
const LOW_TIME_THRESHOLD_MINUTES = 495; // 8h 15m
const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';

const calculateDailyTimeStats = (effectiveWorkedSeconds, isHalfDayApproved, isHoliday, approvedOvertimeMinutes = 0, dateStr) => {
  if (isHoliday) {
    return { lowTimeSeconds: 0, extraTimeSeconds: effectiveWorkedSeconds };
  }

  const lowThresholdSec = (isHalfDayApproved ? 255 : LOW_TIME_THRESHOLD_MINUTES) * 60;
  const extraThresholdSec = (isHalfDayApproved ? 262 : EXTRA_TIME_THRESHOLD_MINUTES) * 60;
  
  let lowTimeSeconds = 0;
  let extraTimeSeconds = 0;

  if (effectiveWorkedSeconds < lowThresholdSec) {
    lowTimeSeconds = lowThresholdSec - effectiveWorkedSeconds;
  } 
  
  if (effectiveWorkedSeconds > extraThresholdSec) {
    const actualExtraSec = effectiveWorkedSeconds - extraThresholdSec;
    const isPrePolicy = dateStr && dateStr < OVERTIME_POLICY_EFFECTIVE_DATE;
    
    if (isPrePolicy) {
      extraTimeSeconds = actualExtraSec;
    } else if (approvedOvertimeMinutes > 0) {
      const maxApprovedSec = approvedOvertimeMinutes * 60;
      extraTimeSeconds = Math.min(actualExtraSec, maxApprovedSec);
    }
  }

  return { lowTimeSeconds, extraTimeSeconds };
};

const formatHrms = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
};

// Test Cases
const tests = [
  { name: 'Pre-Policy (Mar 15), No Request', date: '2026-03-15', workedMin: 570, approvedOT: 0, expected: '1h 8m' },
  { name: 'Post-Policy (Apr 10), No Request', date: '2026-04-10', workedMin: 570, approvedOT: 0, expected: '0h 0m' },
  { name: 'Post-Policy (Apr 10), Approved 30m', date: '2026-04-10', workedMin: 570, approvedOT: 30, expected: '0h 30m' },
  { name: 'Post-Policy (Apr 10), Approved 2h', date: '2026-04-10', workedMin: 570, approvedOT: 120, expected: '1h 8m' },
  { name: 'Policy Boundary (Apr 6), Approved 30m', date: '2026-04-06', workedMin: 570, approvedOT: 30, expected: '0h 30m' }
];

console.log('--- Overtime Policy Verification (April 6th Effective Date) ---');
tests.forEach(t => {
  const result = calculateDailyTimeStats(t.workedMin * 60, false, false, t.approvedOT, t.date);
  const resultStr = formatHrms(result.extraTimeSeconds);
  const status = resultStr === t.expected ? '✅ PASS' : `❌ FAIL (Got: ${resultStr})`;
  console.log(`${t.name}: Expected ${t.expected} | Result ${resultStr} | ${status}`);
});
