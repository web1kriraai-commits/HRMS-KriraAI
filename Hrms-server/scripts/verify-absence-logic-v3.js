
const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-06';

const getLocalISOString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const convertToYYYYMMDD = (dateStr) => {
  const dmYMatch = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmYMatch) {
    return `${dmYMatch[3]}-${dmYMatch[2]}-${dmYMatch[1]}`;
  }
  return dateStr;
};

/**
 * DETERMINES THE START DATE FOR ABSENCE PENALTIES (v3 Logic)
 */
const getAbsenceStartDate = (user, firstCheckInDate) => {
  let refStr;
  
  if (user?.joiningDate) {
    refStr = convertToYYYYMMDD(user.joiningDate);
  } else if (user?.createdAt) {
    refStr = user.createdAt.split('T')[0];
  } else {
    return ABSENCE_PENALTY_EFFECTIVE_DATE;
  }

  // Rule 1: Joined before cutoff -> Tracking starts AT cutoff
  if (refStr < ABSENCE_PENALTY_EFFECTIVE_DATE) {
    return ABSENCE_PENALTY_EFFECTIVE_DATE;
  }
  
  // Rule 2: Joined on/after cutoff -> Tracking starts from first actual check-in
  if (firstCheckInDate) {
    return firstCheckInDate;
  }
  
  // If not checked in yet, tracking hasn't started for this user
  return '9999-12-31';
};

// Test Cases
const tests = [
  { name: 'Old Employee (Joined Mar 20)', joiningDate: '20/03/2026', firstCheckIn: '2026-03-20', expected: '2026-04-06' },
  { name: 'Cutoff Join (Apr 6)', joiningDate: '06/04/2026', firstCheckIn: '2026-04-07', expected: '2026-04-07' },
  { name: 'New Join (Apr 8, Check-in Apr 10)', joiningDate: '08/04/2026', firstCheckIn: '2026-04-10', expected: '2026-04-10' },
  { name: 'New Join (Apr 8, NO Check-in)', joiningDate: '08/04/2026', firstCheckIn: null, expected: '9999-12-31' },
  { name: 'Edge Case: Joined Apr 5', joiningDate: '05/04/2026', firstCheckIn: '2026-04-05', expected: '2026-04-06' }
];

console.log('--- v3 Absence Logic Verification (First Check-in Rule) ---');
tests.forEach(t => {
  const result = getAbsenceStartDate(t, t.firstCheckIn);
  const status = result === t.expected ? '✅ PASS' : `❌ FAIL (Got: ${result})`;
  console.log(`${t.name}: Expected: ${t.expected} | Result: ${result} | ${status}`);
});
