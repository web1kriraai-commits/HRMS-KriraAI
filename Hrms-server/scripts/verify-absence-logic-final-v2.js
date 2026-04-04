
const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-01';

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

const getAbsenceStartDate = (user) => {
  let refStr;
  
  if (user?.joiningDate) {
    refStr = convertToYYYYMMDD(user.joiningDate);
  } else if (user?.createdAt) {
    refStr = user.createdAt.split('T')[0];
  } else {
    return ABSENCE_PENALTY_EFFECTIVE_DATE;
  }

  if (refStr < ABSENCE_PENALTY_EFFECTIVE_DATE) {
    return ABSENCE_PENALTY_EFFECTIVE_DATE;
  }
  
  const refDate = new Date(refStr); 
  const nextDay = new Date(refDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return getLocalISOString(nextDay);
};

// Test Cases
const tests = [
  { name: 'Joined Mar 20 (Slashes)', joiningDate: '20/03/2026', expected: '2026-04-01' },
  { name: 'Joined Apr 1 (Dashes)', joiningDate: '01-04-2026', expected: '2026-04-02' },
  { name: 'Joined Apr 3 (Slashes)', joiningDate: '03/04/2026', expected: '2026-04-04' },
  { name: 'Today Join (Apr 4)', joiningDate: '04/04/2026', expected: '2026-04-05' }
];

console.log('--- Final Robust Absence Start Date Verification ---');
tests.forEach(t => {
  const result = getAbsenceStartDate(t);
  const status = result === t.expected ? '✅ PASS' : `❌ FAIL (Got: ${result})`;
  console.log(`${t.name}: ${result} | ${status}`);
});
