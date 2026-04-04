import { getFlags } from './utils/attendanceUtils.js';

// Configuration
const standardMaxNormal = 502; // max normal minutes before OT

function test(name, workedMinutes, approvedOT, isHoliday, expectedOTMinutes, expectedFlag) {
    const workedSeconds = workedMinutes * 60;
    const flags = getFlags(workedSeconds, false, 0, isHoliday, null, true, approvedOT);
    
    const pass = flags.completedOvertime === expectedOTMinutes && flags.extraTime === expectedFlag;
    
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}`);
    console.log(`  Worked: ${workedMinutes}m, Appr: ${approvedOT}m, Holiday: ${isHoliday}`);
    console.log(`  Result: completedOT=${flags.completedOvertime}m, extraTimeFlag=${flags.extraTime}`);
    console.log(`  Expected: completedOT=${expectedOTMinutes}m, extraTimeFlag=${expectedFlag}`);
    if (!pass) process.exit(1);
}

console.log('--- STARTING OVERTIME LOGIC VERIFICATION ---\n');

// Scenario 1: Unapproved Overtime
// Work 600m (10h), Standard Max is 502m (~8.3h). Appr 0.
// Expected: completedOvertime = 0, extraTimeFlag = false
test('Unapproved Overtime (10h work, 0h appr)', 600, 0, false, 0, false);

// Scenario 2: Capped Overtime
// Work 600m (10h), Standard Max 502m. Appr 30m.
// Worked surplus = 98m. Capped at 30m.
// Expected: completedOvertime = 30, extraTimeFlag = true
test('Capped Overtime (10h work, 30m appr)', 600, 30, false, 30, true);

// Scenario 3: Partial Overtime
// Work 522m (8.7h), Standard Max 502m. Appr 60m.
// Worked surplus = 20m. Less than approved 60m.
// Expected: completedOvertime = 20, extraTimeFlag = true
test('Partial Overtime (8.7h work, 60m appr)', 522, 60, false, 20, true);

// Scenario 4: Holiday Work
// Work 120m (2h). No specific approval needed for holiday.
// Expected: completedOvertime = 120, extraTimeFlag = true
test('Holiday Work (2h work)', 120, 0, true, 120, true);

// Scenario 5: Just under standard max
// Work 500m. Appr 30m.
// Expected: completedOvertime = 0, extraTimeFlag = false
test('Below Shift Max (500m work, 30m appr)', 500, 30, false, 0, false);

console.log('\n--- VERIFICATION SUCCESSFUL ---');
