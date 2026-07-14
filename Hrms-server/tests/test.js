import { isLateCheckIn, calculateLatenessSeconds, getFlags, MIN_LATE_PENALTY_SECONDS } from '../utils/attendanceUtils.js';

const cutoff = '09:05';
// Buffer 09:05–09:15 → flat 15m; after that → exact minutes past 09:05
const testCases = [
    { checkIn: '2026-07-14T09:05:00', expectedMins: 0 },   // on cutoff → 0
    { checkIn: '2026-07-14T09:07:00', expectedMins: 15 },  // buffer → 15
    { checkIn: '2026-07-14T09:15:00', expectedMins: 15 },  // end of buffer → 15
    { checkIn: '2026-07-14T09:25:00', expectedMins: 20 },  // past buffer → 20
    { checkIn: '2026-07-14T09:30:00', expectedMins: 25 },  // past buffer → 25
    { checkIn: '2026-07-14T09:31:00', expectedMins: 26 },  // past buffer → 26
    { checkIn: '2026-07-14T08:59:00', expectedMins: 0 }    // early → 0
];

console.log('Testing late penalty with 15m buffer (cutoff 09:05):');
let failed = 0;
testCases.forEach(({ checkIn, expectedMins }) => {
    const lateness = calculateLatenessSeconds(checkIn, cutoff);
    const expectedPenalty = isLateCheckIn(checkIn, cutoff)
        ? Math.max(MIN_LATE_PENALTY_SECONDS, lateness)
        : 0;
    const flags = getFlags(0, false, 0, false, checkIn, false, 0, '2026-07-14', false, cutoff);
    const ok = expectedPenalty === expectedMins * 60 && flags.penaltySeconds === expectedMins * 60;
    if (!ok) failed++;
    console.log(
        `${checkIn} -> lateness ${lateness / 60}m, penalty ${flags.penaltySeconds / 60}m (expected ${expectedMins}m) ${ok ? 'OK' : 'FAIL'}`
    );
});

if (failed > 0) {
    process.exit(1);
}
