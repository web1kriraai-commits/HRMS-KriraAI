
const MAX_NORMAL_MINUTES = 502; // 8h 22m
const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';

/**
 * Replicating getFlags logic from Hrms-server/utils/attendanceUtils.js
 */
const getOvertimeStats = (workedMinutes, approvedOvertimeMinutes, dateStr) => {
  let completedOvertime = 0;
  let unfulfilledOvertime = 0;
  
  if (approvedOvertimeMinutes > 0) {
    if (workedMinutes > MAX_NORMAL_MINUTES) {
      completedOvertime = Math.floor(workedMinutes - MAX_NORMAL_MINUTES);
      if (completedOvertime > approvedOvertimeMinutes) {
        completedOvertime = approvedOvertimeMinutes;
      }
    }
    unfulfilledOvertime = approvedOvertimeMinutes - completedOvertime;
  }

  // Policy rule: Approved overtime request is required from April 6th onwards
  const isPrePolicy = dateStr && dateStr < OVERTIME_POLICY_EFFECTIVE_DATE;
  const extraTimeFlag = (isPrePolicy || approvedOvertimeMinutes > 0) && workedMinutes > MAX_NORMAL_MINUTES;

  return {
    extraTimeFlag,
    completedOvertime,
    unfulfilledOvertime
  };
};

const tests = [
  { 
    name: 'Scenario 1: Work 10m extra, No Approved Request', 
    date: '2026-04-10', workedMin: 512, approvedMin: 0, 
    expected: { extraTimeFlag: false, completedOvertime: 0 } 
  },
  { 
    name: 'Scenario 2: Approved 50m, Work only 10m extra', 
    date: '2026-04-10', workedMin: 512, approvedMin: 50, 
    expected: { extraTimeFlag: true, completedOvertime: 10 } 
  },
  { 
    name: 'Scenario 3: Work 60m extra, Approved 40m', 
    date: '2026-04-10', workedMin: 562, approvedMin: 40, 
    expected: { extraTimeFlag: true, completedOvertime: 40 } 
  }
];

console.log('\n=============================================================');
console.log('   OVERTIME SCENARIO VERIFICATION SCRIPT (Post-April 6th)    ');
console.log('=============================================================\n');

tests.forEach((t, i) => {
  const result = getOvertimeStats(t.workedMin, t.approvedMin, t.date);
  
  const passExtra = result.extraTimeFlag === t.expected.extraTimeFlag;
  const passComp = result.completedOvertime === t.expected.completedOvertime;
  const allPass = passExtra && passComp;

  const status = allPass ? '✅ PASS' : '❌ FAIL';
  
  console.log(`[Test ${i+1}] ${t.name}`);
  console.log(`         Worked Surplus: ${t.workedMin - MAX_NORMAL_MINUTES}m | Approved: ${t.approvedMin}m`);
  console.log(`         Result ExtraFlag: ${result.extraTimeFlag} (Expected: ${t.expected.extraTimeFlag})`);
  console.log(`         Result Completed: ${result.completedOvertime}m (Expected: ${t.expected.completedOvertime}m)`);
  console.log(`         Status: ${status}\n`);
});

console.log('=============================================================\n');
