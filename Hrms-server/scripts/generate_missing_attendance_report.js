import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

const generateReport = async () => {
    try {
        await connectDB();

        console.log('Fetching active employees...');
        const employees = await User.find({ role: 'Employee', isActive: true });
        console.log(`Found ${employees.length} active employees.`);

        console.log('Fetching holidays...');
        const holidays = await CompanyHoliday.find();
        const holidayDates = new Set(holidays.map(h => h.date));

        console.log('Fetching approved leave requests...');
        const leaves = await LeaveRequest.find({ status: 'Approved' });

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        const report = [];

        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const [y, m, d] = dateStr.split('-');
            return `${d}-${m}-${y}`;
        };

        for (const employee of employees) {
            console.log(`Processing employee: ${employee.name} (${employee._id})`);

            // Find first check-in date
            const firstAttendance = await Attendance.findOne({ 
                userId: employee._id,
                checkIn: { $exists: true }
            }).sort({ date: 1 });

            let startDate;
            let startType = 'First Check-in';

            if (firstAttendance) {
                startDate = new Date(firstAttendance.date);
            } else if (employee.joiningDate) {
                // Parse DD-MM-YYYY
                const parts = employee.joiningDate.split('-');
                if (parts.length === 3) {
                    startDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    startType = 'Joining Date';
                }
            }

            if (!startDate) {
                console.log(`  No start date found for ${employee.name}. Skipping.`);
                continue;
            }

            const missingDates = [];

            // Iterate from startDate to today
            let currentDate = new Date(startDate);
            while (currentDate <= today) {
                const dateStr = currentDate.toISOString().split('T')[0];

                // Skip if holiday
                if (holidayDates.has(dateStr)) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }

                // Skip if Sunday
                if (currentDate.getDay() === 0) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }

                // Check attendance
                const attendance = await Attendance.findOne({ 
                    userId: employee._id, 
                    date: dateStr 
                });

                if (attendance && attendance.checkIn) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }

                // Check approved leave
                const leave = leaves.find(l => {
                    return l.userId.toString() === employee._id.toString() &&
                           dateStr >= l.startDate &&
                           dateStr <= l.endDate;
                });

                if (leave) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }

                // If we are here, it's missing
                missingDates.push(dateStr);
                currentDate.setDate(currentDate.getDate() + 1);
            }

            report.push({
                name: employee.name,
                username: employee.username,
                startDate: formatDate(startDate.toISOString().split('T')[0]),
                startType: startType,
                missingDates: missingDates.map(formatDate)
            });
        }

        // Generate Text Report
        let textReport = '==================================================\n';
        textReport += 'MISSING ATTENDANCE REPORT\n';
        textReport += `Generated on: ${new Date().toLocaleString()}\n`;
        textReport += '==================================================\n\n';

        // Generate CSV Report
        let csvReport = 'Employee Name,Username,Start Date,Start Type,Total Missing Days,Missing Dates\n';

        if (report.length === 0) {
            textReport += 'No missing attendance records found for any employee.\n';
        } else {
            report.forEach(emp => {
                textReport += `Employee: ${emp.name}\n`;
                textReport += `Total Missing Days: ${emp.missingDates.length}\n`;
                if (emp.missingDates.length > 0) {
                    textReport += `Missing Dates: ${emp.missingDates.join(', ')}\n`;
                } else {
                    textReport += `Missing Dates: None\n`;
                }
                textReport += '--------------------------------------------------\n';

                // Escape commas for CSV
                const missingDatesStr = emp.missingDates.length > 0 ? `"${emp.missingDates.join(', ')}"` : 'None';
                csvReport += `${emp.name},${emp.username},${emp.startDate},${emp.startType},${emp.missingDates.length},${missingDatesStr}\n`;
            });
        }

        // Save report to JSON file
        const jsonReportPath = path.join(process.cwd(), 'scripts', 'missing_attendance_report.json');
        fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));
        
        // Save report to TXT file
        const txtReportPath = path.join(process.cwd(), 'scripts', 'missing_attendance_report.txt');
        fs.writeFileSync(txtReportPath, textReport);

        // Save report to CSV file
        const csvReportPath = path.join(process.cwd(), 'scripts', 'missing_attendance_report.csv');
        fs.writeFileSync(csvReportPath, csvReport);
        
        console.log(textReport);
        console.log(`\nReports saved to:`);
        console.log(`- JSON: ${jsonReportPath}`);
        console.log(`- TXT: ${txtReportPath}`);
        console.log(`- CSV (Excel): ${csvReportPath}`);

    } catch (error) {
        console.error('Error generating report:', error);
    } finally {
        mongoose.connection.close();
    }
};

generateReport();
