
const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';
const MAX_NORMAL_MINUTES = 502; // 8h 22m

const getFlags = (workedMinutes, approvedOvertimeMinutes, dateStr) => {
  const isPrePolicy = dateStr && dateStr < OVERTIME_POLICY_EFFECTIVE_DATE;
  
  let completedOvertime = 0;
  let unfulfilledOvertime = 0;
  
  // Calculate completed and unfulfilled overtime if there's a request
  if (approvedOvertimeMinutes > 0) {
    if (workedMinutes > MAX_NORMAL_MINUTES) {
      completedOvertime = Math.floor(workedMinutes - MAX_NORMAL_MINUTES);
      if (completedOvertime > approvedOvertimeMinutes) {
        completedOvertime = approvedOvertimeMinutes;
      }
    }
    unfulfilledOvertime = approvedOvertimeMinutes - completedOvertime;
  } else if (isPrePolicy) {
    // Before policy: any surplus is "completed" overtime
    if (workedMinutes > MAX_NORMAL_MINUTES) {
      completedOvertime = Math.floor(workedMinutes - MAX_NORMAL_MINUTES);
    }
  }

  const overtimeAllowed = isPrePolicy || approvedOvertimeMinutes > 0;

  return {
    extraTime: overtimeAllowed && workedMinutes > MAX_NORMAL_MINUTES,
    completedOvertime,
    unfulfilledOvertime
  };
};

const tests = [
  { 
    name: 'Full Completion (Post-Policy)', 
    date: '2026-04-10', worked: 600, approved: 60, 
    expected: { extraTime: true, completed: 60, unfulfilled: 0 } 
  },
  { 
    name: 'Partial Completion (Post-Policy)', 
    date: '2026-04-10', worked: 562, approved: 120, 
    expected: { extraTime: true, completed: 60, unfulfilled: 60 } 
  },
  { 
    name: 'No Completion (Post-Policy)', 
    date: '2026-04-10', worked: 502, approved: 60, 
    expected: { extraTime: false, completed: 0, unfulfilled: 60 } 
  },
  { 
    name: 'Surplus without Request (Post-Policy)', 
    date: '2026-04-10', worked: 600, approved: 0, 
    expected: { extraTime: false, completed: 0, unfulfilled: 0 } 
  },
  { 
    name: 'Surplus without Request (Pre-Policy)', 
    date: '2026-03-15', worked: 600, approved: 0, 
    expected: { extraTime: true, completed: 98, unfulfilled: 0 } 
  }
];

console.log('--- Overtime Completion Verification Script ---');
tests.forEach(t => {
  const result = getFlags(t.worked, t.approved, t.date);
  const passExtra = result.extraTime === t.expected.extraTime;
  const passComp = result.completedOvertime === t.expected.completed;
  const passUnf = result.unfulfilledOvertime === t.expected.unfulfilled;
  
  const status = (passExtra && passComp && passUnf) ? '✅ PASS' : '❌ FAIL';
  
  console.log(`${t.name.padEnd(40)} | ${status}`);
  if (!result.extraTime && t.expected.extraTime) console.log(`  - ExtraTime Expected true, got false`);
  if (result.completedOvertime !== t.expected.completed) console.log(`  - Completed Expected ${t.expected.completed}, got ${result.completedOvertime}`);
  if (result.unfulfilledOvertime !== t.expected.unfulfilled) console.log(`  - Unfulfilled Expected ${t.expected.unfulfilled}, got ${result.unfulfilledOvertime}`);
});
