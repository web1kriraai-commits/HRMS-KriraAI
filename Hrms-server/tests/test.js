import { isLateCheckIn, calculateLatenessSeconds, getFlags, MIN_LATE_PENALTY_SECONDS } from '../utils/attendanceUtils.js';

const testCases = [
    '2026-02-15T09:05:00', // 5 mins late -> 15 mins penalty
    '2026-02-15T09:15:00', // 15 mins late -> 15 mins penalty
    '2026-02-15T09:20:00', // 20 mins late -> 20 mins penalty
    '2026-02-15T08:59:00'  // on time -> 0 penalty
];

console.log("Testing Penalty Logic:");
testCases.forEach(tc => {
    const d = new Date(tc); // Assuming local time parsing might be tricky, let's just use it as a string that JS Date parses.

    // Wait, if we use '2026-02-15T09:05:00', that parses as local time.
    // Actually '2026-02-15T09:05:00' without Z is treated as local time in many environments.

    const lateness = calculateLatenessSeconds(tc);
    let expectedPenalty = 0;
    if (isLateCheckIn(tc)) {
        expectedPenalty = Math.max(MIN_LATE_PENALTY_SECONDS, lateness);
    }

    console.log(`${tc} -> Lateness: ${lateness / 60} mins, Penalty: ${expectedPenalty / 60} mins`);
});

