import { getFlags, calculateWorkedSeconds } from '../utils/attendanceUtils.js';

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m"
};

function assert(condition, message) {
    if (!condition) {
        console.log(`${colors.red}FAIL: ${message}${colors.reset}`);
        return false;
    }
    console.log(`${colors.green}PASS: ${message}${colors.reset}`);
    return true;
}

console.log(`${colors.blue}=== HRMS ATTENDANCE BUSINESS RULES TEST ===${colors.reset}\n`);

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
    totalTests++;
    console.log(`${colors.cyan}Test #${totalTests}: ${name}${colors.reset}`);
    if (fn()) passedTests++;
    console.log("");
}

// Scenario 1: On-time, Full-day, No break, Normal hours
runTest("On-time, 8h 20m worked (Normal)", () => {
    const checkIn = "2026-03-01T09:00:00";
    const checkOut = "2026-03-01T17:20:00"; // 8 hours 20 mins = 500 mins
    const workedSeconds = 500 * 60;
    const flags = getFlags(workedSeconds, false, 0, false, checkIn);

    return assert(flags.lowTime === false && flags.extraTime === false && flags.penaltySeconds === 0,
        `Expected normal (no flags), got lowTime:${flags.lowTime}, extraTime:${flags.extraTime}, penalty:${flags.penaltySeconds}`);
});

// Scenario 2: Low Time (< 8:15)
runTest("Low Time (< 8:15)", () => {
    const checkIn = "2026-03-01T09:00:00";
    const workedSeconds = 494 * 60; // 8h 14m
    const flags = getFlags(workedSeconds, false, 0, false, checkIn);

    return assert(flags.lowTime === true && flags.extraTime === false,
        `Expected lowTime:true, got lowTime:${flags.lowTime}`);
});

// Scenario 3: Extra Time (> 8:22) — dateStr before overtime policy so extra time does not require an OT request
runTest("Extra Time (> 8:22)", () => {
    const checkIn = "2026-03-01T09:00:00";
    const workedSeconds = 503 * 60; // 8h 23m
    const flags = getFlags(workedSeconds, false, 0, false, checkIn, false, 0, "2026-03-01");

    return assert(flags.extraTime === true && flags.lowTime === false,
        `Expected extraTime:true, got extraTime:${flags.extraTime}`);
});

// Scenario 4: Break Deduction
runTest("Break Deduction Accuracy", () => {
    const attendance = {
        checkIn: "2026-03-01T09:00:00",
        breaks: [
            { start: "2026-03-01T12:00:00", end: "2026-03-01T13:00:00" } // 1 hour break
        ]
    };
    const checkOut = "2026-03-01T18:00:00"; // 9 hours total duration
    const workedSeconds = calculateWorkedSeconds(attendance, checkOut); // Should be 8 hours (28800s)

    const expected = 8 * 3600;
    return assert(workedSeconds === expected,
        `Expected ${expected}s worked, got ${workedSeconds}s`);
});

// Scenario 5: Buffer window — 12 mins late (9:12 vs 09:00) -> flat 15 mins penalty
runTest("Late 12m -> 15m Penalty (buffer)", () => {
    const checkIn = "2026-03-01T09:12:00";
    const workedSeconds = 500 * 60; // 8h 20m gross
    const flags = getFlags(workedSeconds, false, 0, false, checkIn, false, 0, null, false, '09:00');

    // effective = 500 - 15 = 485 mins (which is < 495, so lowTime should be true)
    return assert(flags.penaltySeconds === 900 && flags.lowTime === true,
        `Expected 900s penalty & lowTime:true, got penalty:${flags.penaltySeconds}, lowTime:${flags.lowTime}`);
});

// Scenario 6: Dynamic Penalty - 72 mins late (10:12 AM vs 09:00) -> 72 mins penalty
runTest("Late 72m -> 72m Penalty", () => {
    const checkIn = "2026-03-01T10:12:00";
    const workedSeconds = 600 * 60; // 10h gross
    const flags = getFlags(workedSeconds, false, 0, false, checkIn, false, 0, null, false, '09:00');

    const expectedPenalty = 72 * 60;
    return assert(flags.penaltySeconds === expectedPenalty,
        `Expected ${expectedPenalty}s penalty, got ${flags.penaltySeconds}s`);
});

// Scenario 6b: 2 mins late (09:07 vs 09:05) -> flat 15m (buffer 09:05–09:15)
runTest("Late 2m after 09:05 -> 15m Penalty (buffer)", () => {
    const checkIn = "2026-07-14T09:07:00";
    const workedSeconds = 500 * 60;
    const flags = getFlags(workedSeconds, false, 0, false, checkIn, false, 0, '2026-07-14', false, '09:05');

    return assert(flags.penaltySeconds === 15 * 60 && flags.lateCheckIn === true,
        `Expected 900s penalty, got penalty:${flags.penaltySeconds}, late:${flags.lateCheckIn}`);
});

// Scenario 6c: 20 mins late (09:25 vs 09:05) -> 20 mins
runTest("Late 20m after 09:05 -> 20m Penalty", () => {
    const checkIn = "2026-07-14T09:25:00";
    const workedSeconds = 500 * 60;
    const flags = getFlags(workedSeconds, false, 0, false, checkIn, false, 0, '2026-07-14', false, '09:05');

    return assert(flags.penaltySeconds === 20 * 60,
        `Expected 1200s penalty, got ${flags.penaltySeconds}s`);
});

// Scenario 6d: 25 mins late (09:30 vs 09:05) -> 25 mins
runTest("Late 25m after 09:05 -> 25m Penalty", () => {
    const checkIn = "2026-07-14T09:30:00";
    const workedSeconds = 500 * 60;
    const flags = getFlags(workedSeconds, false, 0, false, checkIn, false, 0, '2026-07-14', false, '09:05');

    return assert(flags.penaltySeconds === 25 * 60,
        `Expected 1500s penalty, got ${flags.penaltySeconds}s`);
});

// Scenario 6e: 26 mins late (09:31 vs 09:05) -> 26 mins
runTest("Late 26m after 09:05 -> 26m Penalty", () => {
    const checkIn = "2026-07-14T09:31:00";
    const workedSeconds = 500 * 60;
    const flags = getFlags(workedSeconds, false, 0, false, checkIn, false, 0, '2026-07-14', false, '09:05');

    return assert(flags.penaltySeconds === 26 * 60,
        `Expected 1560s penalty, got ${flags.penaltySeconds}s`);
});

// Scenario 7: Extra Time Half Day Leave (+4.125h compensation)
runTest("Extra Time Half Day Leave compensation", () => {
    const checkIn = "2026-03-01T09:00:00";
    const workedSeconds = 250 * 60; // 4h 10m worked (gross)
    const extraTimeLeaveMinutes = 495 / 2; // 247.5 mins (4.125h)

    // Total = 250 + 247.5 = 497.5 mins (Normal range)
    const flags = getFlags(workedSeconds, false, extraTimeLeaveMinutes, false, checkIn);

    return assert(flags.lowTime === false && flags.extraTime === false,
        `Expected normal with compensation, got lowTime:${flags.lowTime}, extraTime:${flags.extraTime}`);
});

// Scenario 8: Extra Time Full Day Leave (compensation for low time)
runTest("Extra Time Full Day Leave (comping 0h worked)", () => {
    const checkIn = "2026-03-01T10:00:00"; // Late doesn't matter much if skip penalty (but here we check worked)
    const workedSeconds = 0;
    const extraTimeLeaveMinutes = 495; // Full day compensation

    const flags = getFlags(workedSeconds, false, extraTimeLeaveMinutes, false, checkIn);

    // Note: penalty might still apply if checkIn is set, but extraTimeLeave is usually for missed days
    // If workedSeconds=0, penalty makes it negative (clamped to 0). 0 + 495 = 495 (Normal)
    return assert(flags.lowTime === false && flags.extraTime === false,
        `Expected normal, got lowTime:${flags.lowTime}, extraTime:${flags.extraTime}`);
});

// Scenario 8b: Half day — late check-in incurs no penalty
runTest("Half Day Leave: no late check-in penalty", () => {
    const checkIn = "2026-03-01T10:30:00";
    const workedSeconds = 500 * 60;
    const flags = getFlags(workedSeconds, true, 0, false, checkIn);

    return assert(flags.penaltySeconds === 0 && flags.lateCheckIn === true,
        `Expected 0 penalty when half-day approved, got penalty:${flags.penaltySeconds}`);
});

// Scenario 9: Approved Half Day Leave Logic (Thresholds halved)
runTest("Approved Half Day Logic (Low Time threshold reduced)", () => {
    const checkIn = "2026-03-01T09:00:00";
    const workedSeconds = 248 * 60; // 4h 8m -> should be Normal (threshold 4h 7.5m)
    const flags = getFlags(workedSeconds, true, 0, false, checkIn);

    return assert(flags.lowTime === false && flags.extraTime === false,
        `Expected normal (half-day), got lowTime:${flags.lowTime}, extraTime:${flags.extraTime}`);
});

// Scenario 10: Holiday Work (All overtime)
runTest("Holiday Work Rule", () => {
    const workedSeconds = 120 * 60; // 2 hours worked
    const flags = getFlags(workedSeconds, false, 0, true, "2026-03-01T10:00:00");

    return assert(flags.extraTime === true && flags.lowTime === false && flags.penaltySeconds === 0,
        `Expected extraTime only, no penalty, got extraTime:${flags.extraTime}, penalty:${flags.penaltySeconds}`);
});

console.log(`\n${colors.blue}=== TEST SUMMARY ===${colors.reset}`);
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed:      ${passedTests === totalTests ? colors.green : colors.red}${passedTests}${colors.reset}`);
console.log(`Failed:      ${totalTests - passedTests === 0 ? colors.green : colors.red}${totalTests - passedTests}${colors.reset}\n`);

if (passedTests === totalTests) {
    console.log(`${colors.green}ALL SYSTEMS NOMINAL.${colors.reset}`);
} else {
    process.exit(1);
}
