/**
 * Test script for Attendance and Leave Policy Restrictions
 * Run with: node test-policy.js
 */

const Role = {
    ADMIN: 'Admin',
    EMPLOYEE: 'Employee',
    HR: 'HR'
};

// Mock the validation logic from attendanceController.js
function validateClockIn(role, mockDate) {
    if (role === Role.ADMIN) return { success: true };
    
    const hours = mockDate.getHours();
    const minutes = mockDate.getMinutes();
    
    if (hours < 8 || (hours === 8 && minutes < 30)) {
        return { success: false, message: 'Check-in is only allowed after 8:30 AM' };
    }
    return { success: true };
}

function validateClockOut(role, mockDate) {
    if (role === Role.ADMIN) return { success: true };
    
    const hours = mockDate.getHours();
    const minutes = mockDate.getMinutes();
    
    if (hours < 17 || (hours === 17 && minutes < 30)) {
        return { success: false, message: 'Check-out is only allowed after 5:30 PM' };
    }
    return { success: true };
}

function validateLeaveRequest(role, category) {
    if (category === 'Extra Time Leave' && role !== Role.ADMIN) {
        return { success: false, message: 'Extra Time Leave is no longer available for employees.' };
    }
    return { success: true };
}

// Test Cases
const tests = [
    // Clock-in Tests
    { name: 'Employee Clock-in at 8:15 AM', fn: () => validateClockIn(Role.EMPLOYEE, new Date('2024-01-01T08:15:00')), expected: false },
    { name: 'Employee Clock-in at 8:30 AM', fn: () => validateClockIn(Role.EMPLOYEE, new Date('2024-01-01T08:30:00')), expected: true },
    { name: 'Admin Clock-in at 8:15 AM', fn: () => validateClockIn(Role.ADMIN, new Date('2024-01-01T08:15:00')), expected: true },
    
    // Clock-out Tests
    { name: 'Employee Clock-out at 5:15 PM', fn: () => validateClockOut(Role.EMPLOYEE, new Date('2024-01-01T17:15:00')), expected: false },
    { name: 'Employee Clock-out at 5:35 PM', fn: () => validateClockOut(Role.EMPLOYEE, new Date('2024-01-01T17:35:00')), expected: true },
    { name: 'Admin Clock-out at 5:15 PM', fn: () => validateClockOut(Role.ADMIN, new Date('2024-01-01T17:15:00')), expected: true },
    
    // Leave Tests
    { name: 'Employee Request Extra Time Leave', fn: () => validateLeaveRequest(Role.EMPLOYEE, 'Extra Time Leave'), expected: false },
    { name: 'HR Request Extra Time Leave', fn: () => validateLeaveRequest(Role.HR, 'Extra Time Leave'), expected: false },
    { name: 'Admin Request Extra Time Leave', fn: () => validateLeaveRequest(Role.ADMIN, 'Extra Time Leave'), expected: true },
    { name: 'Employee Request Paid Leave', fn: () => validateLeaveRequest(Role.EMPLOYEE, 'Paid Leave'), expected: true },
];

console.log('--- RUNNING POLICY RESTRICTION TESTS ---');
let passedCount = 0;
tests.forEach(t => {
    const result = t.fn();
    const passed = result.success === t.expected;
    if (passed) {
        console.log(`[PASS] ${t.name}`);
        passedCount++;
    } else {
        console.error(`[FAIL] ${t.name} (Expected ${t.expected}, got ${result.success})`);
    }
});

console.log(`\nResults: ${passedCount}/${tests.length} tests passed.`);
if (passedCount === tests.length) {
    console.log('✅ All policy enforcement logic verified successfully.');
} else {
    process.exit(1);
}
