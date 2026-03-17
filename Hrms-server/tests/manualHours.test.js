import { calculateWorkedSeconds, getFlags } from '../utils/attendanceUtils.js';

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

console.log(`${colors.blue}=== HRMS MANUAL HOURS FEATURE TEST ===${colors.reset}\n`);

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
    totalTests++;
    console.log(`${colors.cyan}Test #${totalTests}: ${name}${colors.reset}`);
    if (fn()) passedTests++;
    console.log("");
}

// Test 1: Manual Hours Addition
runTest("Manual Hours Addition to worked time", () => {
    const attendance = {
        checkIn: "2026-03-01T09:00:00",
        checkOut: "2026-03-01T14:00:00", // 5 hours worked (18000s)
        breaks: [],
        manualHours: [
            { hours: 3 }, // +3 hours (10800s)
            { hours: 1 }  // +1 hour (3600s)
        ]
    };
    
    // Total should be 5 + 3 + 1 = 9 hours (32400s)
    const workedSeconds = calculateWorkedSeconds(attendance);
    const expected = 9 * 3600;
    
    return assert(workedSeconds === expected, 
        `Expected ${expected}s, got ${workedSeconds}s`);
});

// Test 2: Manual Hours helping avoid Low Time
runTest("Manual Hours avoiding Low Time", () => {
    const workedSeconds = 7 * 3600; // 7 hours (Low Time)
    const manualHours = [
        { hours: 1.5 } // Total 8.5 hours (Normal)
    ];
    
    // totalWorkedSeconds = 7 + 1.5 = 8.5 hours (510 minutes)
    // normal is 495 to 502. 510 > 502, so it should be extraTime!
    const attendance = {
        checkIn: "2026-03-01T09:00:00",
        checkOut: "2026-03-01T16:00:00", // 7 hours
        manualHours: manualHours
    };
    
    const totalSeconds = calculateWorkedSeconds(attendance);
    const flags = getFlags(totalSeconds, false, 0, false, attendance.checkIn);
    
    return assert(flags.lowTime === false && flags.extraTime === true,
        `Expected lowTime:false, extraTime:true. Got lowTime:${flags.lowTime}, extraTime:${flags.extraTime}`);
});

// Test 3: Manual Hours with breaks
runTest("Manual Hours with Breaks", () => {
    const attendance = {
        checkIn: "2026-03-01T09:00:00",
        checkOut: "2026-03-01T17:00:00", // 8 hours gross
        breaks: [
            { start: "2026-03-01T12:00:00", end: "2026-03-01T13:00:00" } // 1 hour break
        ],
        manualHours: [
            { hours: 2 } // +2 hours
        ]
    };
    
    // (8 - 1) + 2 = 9 hours
    const workedSeconds = calculateWorkedSeconds(attendance);
    const expected = 9 * 3600;
    
    return assert(workedSeconds === expected, 
        `Expected ${expected}s, got ${workedSeconds}s`);
});

console.log(`${colors.blue}=== TEST SUMMARY ===${colors.reset}`);
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed:      ${passedTests === totalTests ? colors.green : colors.red}${passedTests}${colors.reset}`);
console.log(`Failed:      ${totalTests - passedTests === 0 ? colors.green : colors.red}${totalTests - passedTests}${colors.reset}\n`);

if (passedTests === totalTests) {
    console.log(`${colors.green}MANUAL HOURS LOGIC VERIFIED.${colors.reset}`);
} else {
    process.exit(1);
}
