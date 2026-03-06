import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import { calculateWorkedSeconds, getFlags, getTodayStr } from '../utils/attendanceUtils.js';
import { logAction } from './auditController.js';

// Forced reload to clear potential nodemon cache issues.

// Helper: check if a date string (YYYY-MM-DD) is a company holiday
const checkIsHoliday = async (dateStr) => {
  const holiday = await CompanyHoliday.findOne({ date: dateStr });
  return !!holiday;
};

export const clockIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayStr();

    // Check if already clocked in today
    const existing = await Attendance.findOne({ userId, date: today });
    if (existing && existing.checkIn) {
      return res.status(400).json({ message: 'Already clocked in today' });
    }

    const now = new Date();
    const isHoliday = await checkIsHoliday(today);

    // If a record already exists (e.g. created by admin as a waiver), use its isPenaltyDisabled flag
    const isPenaltyDisabled = existing ? !!existing.isPenaltyDisabled : false;

    const { lateCheckIn, penaltySeconds } = getFlags(0, false, 0, isHoliday, now, isPenaltyDisabled);

    let attendance;
    if (existing) {
      // Update the placeholder record
      existing.checkIn = now;
      existing.location = req.body.location || 'Office';
      existing.lateCheckIn = !!lateCheckIn;
      existing.penaltySeconds = penaltySeconds;
      // Note: we don't change existing.isPenaltyDisabled here as it was set by admin
      attendance = await existing.save();
    } else {
      // Create new record
      attendance = new Attendance({
        userId,
        date: today,
        checkIn: now,
        location: req.body.location || 'Office',
        breaks: [],
        totalWorkedSeconds: 0,
        lowTimeFlag: false,
        extraTimeFlag: false,
        lateCheckIn: !!lateCheckIn,
        penaltySeconds,
        isPenaltyDisabled: false
      });
      await attendance.save();
    }

    await logAction(req.user._id, req.user.name, 'CLOCK_IN', 'ATTENDANCE', attendance._id.toString(), `Clocked in at ${today}${isPenaltyDisabled ? ' (Penalty Exempted)' : ''}`);

    res.json(attendance);
  } catch (error) {
    console.error('Clock in error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const clockOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayStr();

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({ message: 'No check-in record found for today' });
    }

    if (attendance.checkOut) {
      return res.status(400).json({ message: 'Already clocked out today' });
    }

    // Check for active break
    const activeBreak = attendance.breaks.find(b => !b.end);
    if (activeBreak) {
      return res.status(400).json({ message: 'Please end your break before clocking out' });
    }

    attendance.checkOut = new Date();
    const worked = calculateWorkedSeconds(attendance, attendance.checkOut.toISOString());

    // Check if today is a company holiday
    const isHolidayWork = await checkIsHoliday(today);

    // Check for half-day leave
    const hasHalfDay = await LeaveRequest.findOne({
      userId,
      startDate: today,
      category: 'Half Day Leave',
      status: 'Approved'
    });

    // Check for Extra Time Leave and calculate the hours
    // This allows: 1 hour leave + 7:15 work = 8:15 (normal time)
    let extraTimeLeaveMinutes = 0;
    const extraTimeLeave = await LeaveRequest.findOne({
      userId,
      startDate: today,
      category: 'Extra Time Leave',
      status: 'Approved'
    });

    if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
      // Calculate duration from startTime and endTime (format: "HH:mm")
      const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
      const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      extraTimeLeaveMinutes = Math.max(0, endMinutes - startMinutes);
    }

    const { lowTime, extraTime, lateCheckIn, penaltySeconds } = getFlags(worked, !!hasHalfDay, extraTimeLeaveMinutes, isHolidayWork, attendance.checkIn, attendance.isPenaltyDisabled);

    // Store penalty-adjusted worked time so displayed hours already reflect the deduction
    attendance.totalWorkedSeconds = Math.max(0, worked - penaltySeconds);
    attendance.lowTimeFlag = lowTime;
    attendance.extraTimeFlag = extraTime;
    attendance.penaltySeconds = penaltySeconds;

    await attendance.save();

    let logMessage = `Clocked out at ${today}`;
    if (lateCheckIn) {
      logMessage += ` (Late Check-in Penalty: ${Math.round(penaltySeconds / 60)} minutes)`;
    }

    await logAction(req.user._id, req.user.name, 'CLOCK_OUT', 'ATTENDANCE', attendance._id.toString(), logMessage);

    res.json(attendance);
  } catch (error) {
    console.error('Clock out error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const startBreak = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayStr();
    const { type = 'Standard', reason } = req.body;

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance || !attendance.checkIn || attendance.checkOut) {
      return res.status(400).json({ message: 'No active attendance record' });
    }

    // Check for active break
    const activeBreak = attendance.breaks.find(b => !b.end);
    if (activeBreak) {
      return res.status(400).json({ message: 'Break already in progress' });
    }

    // Enforce only one standard break per day
    if (type === 'Standard') {
      const hasStandardBreak = attendance.breaks.some(b => b.type === 'Standard' && b.end);
      if (hasStandardBreak) {
        return res.status(400).json({ message: 'Standard break already taken today. Please use Extra Break for additional breaks.' });
      }
    }

    // Require reason for extra breaks
    if (type === 'Extra' && !reason) {
      return res.status(400).json({ message: 'Reason is required for extra breaks' });
    }

    const breakData = {
      start: new Date(),
      type
    };

    // Add reason only for extra breaks
    if (type === 'Extra' && reason) {
      breakData.reason = reason.trim();
    }

    attendance.breaks.push(breakData);

    await attendance.save();
    res.json(attendance);
  } catch (error) {
    console.error('Start break error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const endBreak = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayStr();

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance) {
      return res.status(400).json({ message: 'No attendance record found' });
    }

    const activeBreak = attendance.breaks.find(b => !b.end);
    if (!activeBreak) {
      return res.status(400).json({ message: 'No active break found' });
    }

    activeBreak.end = new Date();
    activeBreak.durationSeconds = Math.max(0, (activeBreak.end.getTime() - activeBreak.start.getTime()) / 1000);

    await attendance.save();
    res.json(attendance);
  } catch (error) {
    console.error('End break error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const cancelBreak = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayStr();

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance) {
      return res.status(400).json({ message: 'No attendance record found' });
    }

    const activeBreakIndex = attendance.breaks.findIndex(b => !b.end);
    if (activeBreakIndex === -1) {
      return res.status(400).json({ message: 'No active break found to cancel' });
    }

    // Remove the active break entirely
    attendance.breaks.splice(activeBreakIndex, 1);

    await attendance.save();
    res.json(attendance);
  } catch (error) {
    console.error('Cancel break error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayStr();

    const attendance = await Attendance.findOne({ userId, date: today });
    res.json(attendance || null);
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const query = { userId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(100);

    // Recalculate flags for records that have checkIn and checkOut but might be missing flags
    for (const record of attendance) {
      if (record.checkIn && record.checkOut && (record.lowTimeFlag === undefined || record.extraTimeFlag === undefined || record.lowTimeFlag === null || record.extraTimeFlag === null)) {
        const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());

        // Check for half-day leave
        const hasHalfDay = await LeaveRequest.findOne({
          userId: record.userId,
          startDate: record.date,
          category: 'Half Day Leave',
          status: 'Approved'
        });

        const flags = getFlags(worked, !!hasHalfDay, 0, false, record.checkIn, record.isPenaltyDisabled);
        record.lowTimeFlag = flags.lowTime;
        record.extraTimeFlag = flags.extraTime;
        record.lateCheckIn = flags.lateCheckIn;
        record.penaltySeconds = flags.penaltySeconds;
        record.totalWorkedSeconds = Math.max(0, worked - flags.penaltySeconds);
        await record.save();
      }
    }

    res.json(attendance);
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin create or update attendance
export const adminCreateAttendance = async (req, res) => {
  try {
    const { userId, date, checkIn, checkOut, breakDurationMinutes, notes, isPenaltyDisabled } = req.body;

    if (!userId || !date) {
      return res.status(400).json({ message: 'userId and date are required' });
    }

    // Check if record exists
    let attendance = await Attendance.findOne({ userId, date });

    if (attendance) {
      // Update existing record
      const beforeData = JSON.stringify(attendance.toObject());

      // Parse time strings and combine with date
      const baseDate = new Date(date);

      if (checkIn) {
        // Handle time format like "09:00" or "09:00 AM"
        let timeStr = checkIn.trim();
        let hours, minutes;

        if (timeStr.includes('AM') || timeStr.includes('PM')) {
          // 12-hour format
          const [timePart, period] = timeStr.split(/\s*(AM|PM)/i);
          const [h, m] = timePart.split(':');
          hours = parseInt(h, 10);
          minutes = parseInt(m || '0', 10);

          if (period.toUpperCase() === 'PM' && hours !== 12) {
            hours += 12;
          } else if (period.toUpperCase() === 'AM' && hours === 12) {
            hours = 0;
          }
        } else {
          // 24-hour format
          const [h, m] = timeStr.split(':');
          hours = parseInt(h, 10);
          minutes = parseInt(m || '0', 10);
        }

        attendance.checkIn = new Date(baseDate);
        attendance.checkIn.setHours(hours, minutes, 0, 0);
      }

      if (checkOut) {
        // Handle time format like "18:00" or "06:00 PM"
        let timeStr = checkOut.trim();
        let hours, minutes;

        if (timeStr.includes('AM') || timeStr.includes('PM')) {
          // 12-hour format
          const [timePart, period] = timeStr.split(/\s*(AM|PM)/i);
          const [h, m] = timePart.split(':');
          hours = parseInt(h, 10);
          minutes = parseInt(m || '0', 10);

          if (period.toUpperCase() === 'PM' && hours !== 12) {
            hours += 12;
          } else if (period.toUpperCase() === 'AM' && hours === 12) {
            hours = 0;
          }
        } else {
          // 24-hour format
          const [h, m] = timeStr.split(':');
          hours = parseInt(h, 10);
          minutes = parseInt(m || '0', 10);
        }

        attendance.checkOut = new Date(baseDate);
        attendance.checkOut.setHours(hours, minutes, 0, 0);
      }

      if (notes !== undefined) attendance.notes = notes;

      if (breakDurationMinutes !== undefined) {
        const startTime = attendance.checkIn ? attendance.checkIn.getTime() : Date.now();
        attendance.breaks = [{
          start: new Date(startTime + 1000),
          end: new Date(startTime + 1000 + (breakDurationMinutes * 60 * 1000)),
          type: 'Standard',
          durationSeconds: breakDurationMinutes * 60
        }];
      }

      let flags = null;
      if (attendance.checkIn && attendance.checkOut) {
        const worked = calculateWorkedSeconds(attendance);
        // Check if the attendance date is a company holiday
        const isHolidayWork = await checkIsHoliday(attendance.date);

        const hasHalfDay = await LeaveRequest.findOne({
          userId: attendance.userId,
          startDate: attendance.date,
          category: 'Half Day Leave',
          status: 'Approved'
        });

        // Check for Extra Time Leave
        let extraTimeLeaveMinutes = 0;
        const extraTimeLeave = await LeaveRequest.findOne({
          userId: attendance.userId,
          startDate: attendance.date,
          category: 'Extra Time Leave',
          status: 'Approved'
        });

        if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
          const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
          const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          extraTimeLeaveMinutes = Math.max(0, endMinutes - startMinutes);
        }

        flags = getFlags(worked, !!hasHalfDay, extraTimeLeaveMinutes, isHolidayWork, attendance.checkIn, !!isPenaltyDisabled || !!attendance.isPenaltyDisabled);
        // Store penalty-adjusted worked time so displayed hours already reflect the deduction
        attendance.totalWorkedSeconds = Math.max(0, worked - flags.penaltySeconds);
        attendance.lowTimeFlag = flags.lowTime;
        attendance.extraTimeFlag = flags.extraTime;
        attendance.penaltySeconds = flags.penaltySeconds;
      }

      await attendance.save();
      const afterData = JSON.stringify(attendance.toObject());

      let logMessage = `Modified attendance record for ${date}`;
      if (flags && flags.lateCheckIn) {
        logMessage += ` (Late Check-in Penalty: ${Math.round(flags.penaltySeconds / 60)} minutes)`;
      }

      await logAction(
        req.user._id,
        req.user.name,
        'UPDATE_ATTENDANCE',
        'ATTENDANCE',
        attendance._id.toString(),
        logMessage,
        beforeData,
        afterData
      );

      return res.json(attendance);
    }

    // Create new record
    const baseDate = new Date(date);
    let checkInDate = null;
    let checkOutDate = null;

    if (checkIn) {
      // Handle time format like "09:00" or "09:00 AM"
      let timeStr = checkIn.trim();
      let hours, minutes;

      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        // 12-hour format
        const [timePart, period] = timeStr.split(/\s*(AM|PM)/i);
        const [h, m] = timePart.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);

        if (period.toUpperCase() === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period.toUpperCase() === 'AM' && hours === 12) {
          hours = 0;
        }
      } else {
        // 24-hour format
        const [h, m] = timeStr.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);
      }

      checkInDate = new Date(baseDate);
      checkInDate.setHours(hours, minutes, 0, 0);
    }

    if (checkOut) {
      // Handle time format like "18:00" or "06:00 PM"
      let timeStr = checkOut.trim();
      let hours, minutes;

      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        // 12-hour format
        const [timePart, period] = timeStr.split(/\s*(AM|PM)/i);
        const [h, m] = timePart.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);

        if (period.toUpperCase() === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period.toUpperCase() === 'AM' && hours === 12) {
          hours = 0;
        }
      } else {
        // 24-hour format
        const [h, m] = timeStr.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);
      }

      checkOutDate = new Date(baseDate);
      checkOutDate.setHours(hours, minutes, 0, 0);
    }

    const breaks = [];
    if (breakDurationMinutes && checkInDate) {
      breaks.push({
        start: new Date(checkInDate.getTime() + 1000),
        end: new Date(checkInDate.getTime() + 1000 + (breakDurationMinutes * 60 * 1000)),
        type: 'Standard',
        durationSeconds: breakDurationMinutes * 60
      });
    }

    attendance = new Attendance({
      userId,
      date,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      breaks,
      notes,
      totalWorkedSeconds: 0,
      lowTimeFlag: false,
      extraTimeFlag: false,
      isPenaltyDisabled: !!isPenaltyDisabled
    });

    let flags = null;
    if (checkInDate && checkOutDate) {
      const worked = calculateWorkedSeconds(attendance);
      // Check if the date is a company holiday
      const isHolidayWork = await checkIsHoliday(date);

      const hasHalfDay = await LeaveRequest.findOne({
        userId,
        startDate: date,
        category: 'Half Day Leave',
        status: 'Approved'
      });

      // Check for Extra Time Leave
      let extraTimeLeaveMinutes = 0;
      const extraTimeLeave = await LeaveRequest.findOne({
        userId,
        startDate: date,
        category: 'Extra Time Leave',
        status: 'Approved'
      });

      if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
        const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
        const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        extraTimeLeaveMinutes = Math.max(0, endMinutes - startMinutes);
      }

      flags = getFlags(worked, !!hasHalfDay, extraTimeLeaveMinutes, isHolidayWork, checkInDate, !!isPenaltyDisabled);
      // Store penalty-adjusted worked time so displayed hours already reflect the deduction
      attendance.totalWorkedSeconds = Math.max(0, worked - flags.penaltySeconds);
      attendance.lowTimeFlag = flags.lowTime;
      attendance.extraTimeFlag = flags.extraTime;
      attendance.penaltySeconds = flags.penaltySeconds;
    }

    await attendance.save();

    let logMessage = `Created attendance record for ${date}`;
    // Reuse flags or calculate if needed for logging
    if (!flags && checkInDate && checkOutDate) {
      flags = getFlags(calculateWorkedSeconds(attendance), false, 0, await checkIsHoliday(date), checkInDate, !!isPenaltyDisabled);
    }

    if (flags && flags.lateCheckIn) {
      logMessage += ` (Late Check-in Penalty: ${Math.round(flags.penaltySeconds / 60)} minutes)`;
    }

    await logAction(
      req.user._id,
      req.user.name,
      'CREATE_ATTENDANCE',
      'ATTENDANCE',
      attendance._id.toString(),
      logMessage
    );

    res.status(201).json(attendance);
  } catch (error) {
    console.error('Admin create attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const adminUpdateAttendance = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { checkIn, checkOut, breakDurationMinutes, notes, isPenaltyDisabled, isManualFlag, lowTimeFlag, extraTimeFlag } = req.body;

    const attendance = await Attendance.findById(recordId);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const beforeData = JSON.stringify(attendance.toObject());

    // Parse time strings and combine with date
    const baseDate = new Date(attendance.date);

    if (checkIn) {
      // Handle time format like "09:00" or "09:00 AM"
      let timeStr = checkIn.trim();
      let hours, minutes;

      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        // 12-hour format
        const [timePart, period] = timeStr.split(/\s*(AM|PM)/i);
        const [h, m] = timePart.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);

        if (period.toUpperCase() === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period.toUpperCase() === 'AM' && hours === 12) {
          hours = 0;
        }
      } else {
        // 24-hour format
        const [h, m] = timeStr.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);
      }

      attendance.checkIn = new Date(baseDate);
      attendance.checkIn.setHours(hours, minutes, 0, 0);
    }

    if (checkOut) {
      // Handle time format like "18:00" or "06:00 PM"
      let timeStr = checkOut.trim();
      let hours, minutes;

      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        // 12-hour format
        const [timePart, period] = timeStr.split(/\s*(AM|PM)/i);
        const [h, m] = timePart.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);

        if (period.toUpperCase() === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period.toUpperCase() === 'AM' && hours === 12) {
          hours = 0;
        }
      } else {
        // 24-hour format
        const [h, m] = timeStr.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m || '0', 10);
      }

      attendance.checkOut = new Date(baseDate);
      attendance.checkOut.setHours(hours, minutes, 0, 0);
    }

    if (isPenaltyDisabled !== undefined) attendance.isPenaltyDisabled = isPenaltyDisabled;
    if (notes !== undefined) attendance.notes = notes;

    // Manual Flag Overrides
    if (isManualFlag !== undefined) {
      attendance.isManualFlag = isManualFlag;
      if (isManualFlag) {
        if (lowTimeFlag !== undefined) attendance.lowTimeFlag = lowTimeFlag;
        if (extraTimeFlag !== undefined) attendance.extraTimeFlag = extraTimeFlag;
      }
    }

    // Override breaks if provided
    if (breakDurationMinutes !== undefined) {
      const startTime = attendance.checkIn ? attendance.checkIn.getTime() : Date.now();
      attendance.breaks = [{
        start: new Date(startTime + 1000),
        end: new Date(startTime + 1000 + (breakDurationMinutes * 60 * 1000)),
        type: 'Standard',
        durationSeconds: breakDurationMinutes * 60
      }];
    }

    // Only recalculate if NOT manually flagged
    if (!attendance.isManualFlag && attendance.checkIn && attendance.checkOut) {
      const worked = calculateWorkedSeconds(attendance);
      // Check if the attendance date is a company holiday
      const isHolidayWork = await checkIsHoliday(attendance.date);

      const hasHalfDay = await LeaveRequest.findOne({
        userId: attendance.userId,
        startDate: attendance.date,
        category: 'Half Day Leave',
        status: 'Approved'
      });

      // Check for Extra Time Leave
      let extraTimeLeaveMinutes = 0;
      const extraTimeLeave = await LeaveRequest.findOne({
        userId: attendance.userId,
        startDate: attendance.date,
        category: 'Extra Time Leave',
        status: 'Approved'
      });

      if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
        const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
        const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        extraTimeLeaveMinutes = Math.max(0, endMinutes - startMinutes);
      }

      const flags = getFlags(worked, !!hasHalfDay, extraTimeLeaveMinutes, isHolidayWork, attendance.checkIn, attendance.isPenaltyDisabled);
      // Store penalty-adjusted worked time so displayed hours already reflect the deduction
      attendance.totalWorkedSeconds = Math.max(0, worked - flags.penaltySeconds);
      attendance.lowTimeFlag = flags.lowTime;
      attendance.extraTimeFlag = flags.extraTime;
      attendance.penaltySeconds = flags.penaltySeconds;
    } else if (attendance.checkIn && attendance.checkOut) {
      // Still update worked time even if flags are manual
      attendance.totalWorkedSeconds = calculateWorkedSeconds(attendance);
    }

    await attendance.save();
    const afterData = JSON.stringify(attendance.toObject());

    await logAction(
      req.user._id,
      req.user.name,
      'UPDATE_ATTENDANCE',
      'ATTENDANCE',
      recordId,
      `Modified attendance record for ${attendance.date}${attendance.isManualFlag ? ' (Manual Status)' : ''}`,
      beforeData,
      afterData
    );

    res.json(attendance);
  } catch (error) {
    console.error('Admin update attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { recordId } = req.params;
    const attendance = await Attendance.findById(recordId).populate('userId', 'name');
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const employeeName = attendance.userId?.name || 'Unknown';
    const date = attendance.date;

    await Attendance.findByIdAndDelete(recordId);

    await logAction(
      req.user._id,
      req.user.name,
      'DELETE_ATTENDANCE',
      'ATTENDANCE',
      recordId,
      `Deleted attendance record for ${employeeName} on ${date}`
    );

    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllAttendance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const attendance = await Attendance.find(query)
      .populate('userId', 'name username email department role')
      .sort({ date: -1 })
      .limit(1000);

    // --- OPTIMIZED: Bulk pre-fetch holidays and leaves ONCE before the loop ---
    // Build a Set of all holiday date strings for O(1) lookup
    const allHolidays = await CompanyHoliday.find({}, 'date').lean();
    const holidayDateSet = new Set(allHolidays.map(h => h.date));

    // Collect unique userIds and dates from records that need recalculation
    const recordsToProcess = attendance.filter(r => r.checkIn && r.checkOut && !r.isManualFlag);
    const userIds = [...new Set(recordsToProcess.map(r => r.userId?._id || r.userId))];
    const datesToQuery = [...new Set(recordsToProcess.map(r => r.date))];

    // Bulk fetch ALL relevant leaves for these users and dates
    let leavesByUserDate = {};
    if (userIds.length > 0 && datesToQuery.length > 0) {
      const relevantLeaves = await LeaveRequest.find({
        userId: { $in: userIds },
        startDate: { $in: datesToQuery },
        status: 'Approved',
        category: { $in: ['Half Day Leave', 'Extra Time Leave'] }
      }).lean();

      // Index leaves by `${userId}-${date}-${category}` for fast lookup
      for (const leave of relevantLeaves) {
        const uid = leave.userId.toString();
        const key = `${uid}-${leave.startDate}-${leave.category}`;
        leavesByUserDate[key] = leave;
      }
    }

    // Now process records in-memory — zero additional DB calls
    const recordsToSave = [];
    for (const record of recordsToProcess) {
      const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());
      const isHolidayWork = holidayDateSet.has(record.date);

      const uid = (record.userId?._id || record.userId).toString();
      const hasHalfDay = !!leavesByUserDate[`${uid}-${record.date}-Half Day Leave`];

      let extraTimeLeaveMinutes = 0;
      const extraTimeLeave = leavesByUserDate[`${uid}-${record.date}-Extra Time Leave`];
      if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
        const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
        const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
        extraTimeLeaveMinutes = Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
      }

      const flags = getFlags(worked, hasHalfDay, extraTimeLeaveMinutes, isHolidayWork, record.checkIn, record.isPenaltyDisabled);
      const adjustedWorked = isHolidayWork ? worked : Math.max(0, worked - flags.penaltySeconds);

      const changed = record.lowTimeFlag !== flags.lowTime ||
        record.extraTimeFlag !== flags.extraTime ||
        record.lateCheckIn !== flags.lateCheckIn ||
        record.penaltySeconds !== flags.penaltySeconds ||
        record.totalWorkedSeconds !== adjustedWorked;

      if (changed) {
        record.lowTimeFlag = flags.lowTime;
        record.extraTimeFlag = flags.extraTime;
        record.lateCheckIn = flags.lateCheckIn;
        record.penaltySeconds = flags.penaltySeconds;
        record.totalWorkedSeconds = adjustedWorked;
        recordsToSave.push(record.save());
      }
    }

    // Bulk save all changed records in parallel
    if (recordsToSave.length > 0) {
      await Promise.all(recordsToSave);
    }

    res.json(attendance);
  } catch (error) {
    console.error('Get all attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTodayAllAttendance = async (req, res) => {
  try {
    const today = getTodayStr();
    const attendance = await Attendance.find({ date: today })
      .populate('userId', 'name username email department role')
      .sort({ checkIn: 1 });

    // --- OPTIMIZED: Bulk pre-fetch holidays and leaves ONCE before the loop ---
    const isHolidayWork = !!(await CompanyHoliday.findOne({ date: today }).lean());

    const recordsToProcess = attendance.filter(r => r.checkIn && r.checkOut && !r.isManualFlag);
    const userIds = recordsToProcess.map(r => r.userId?._id || r.userId);

    let leavesByUserCategory = {};
    if (userIds.length > 0) {
      const todayLeaves = await LeaveRequest.find({
        userId: { $in: userIds },
        startDate: today,
        status: 'Approved',
        category: { $in: ['Half Day Leave', 'Extra Time Leave'] }
      }).lean();

      for (const leave of todayLeaves) {
        const key = `${leave.userId.toString()}-${leave.category}`;
        leavesByUserCategory[key] = leave;
      }
    }

    const recordsToSave = [];
    for (const record of recordsToProcess) {
      const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());
      const uid = (record.userId?._id || record.userId).toString();

      const hasHalfDay = !!leavesByUserCategory[`${uid}-Half Day Leave`];
      let extraTimeLeaveMinutes = 0;
      const extraTimeLeave = leavesByUserCategory[`${uid}-Extra Time Leave`];
      if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
        const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
        const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
        extraTimeLeaveMinutes = Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
      }

      const flags = getFlags(worked, hasHalfDay, extraTimeLeaveMinutes, isHolidayWork, record.checkIn, record.isPenaltyDisabled);
      const adjustedWorked = isHolidayWork ? worked : Math.max(0, worked - flags.penaltySeconds);

      const changed = record.lowTimeFlag !== flags.lowTime ||
        record.extraTimeFlag !== flags.extraTime ||
        record.lateCheckIn !== flags.lateCheckIn ||
        record.penaltySeconds !== flags.penaltySeconds ||
        record.totalWorkedSeconds !== adjustedWorked;

      if (changed) {
        record.lowTimeFlag = flags.lowTime;
        record.extraTimeFlag = flags.extraTime;
        record.lateCheckIn = flags.lateCheckIn;
        record.penaltySeconds = flags.penaltySeconds;
        record.totalWorkedSeconds = adjustedWorked;
        recordsToSave.push(record.save());
      }
    }

    if (recordsToSave.length > 0) {
      await Promise.all(recordsToSave);
    }

    res.json(attendance);
  } catch (error) {
    console.error('Get today all attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Migration endpoint: Recalculate overtime/low-time flags for all attendance records
 * that fall on company holiday dates.
 * Call once (POST /api/attendance/admin/recalculate-holiday-flags) with Admin/HR token.
 */
export const recalculateHolidayFlags = async (req, res) => {
  try {
    // Fetch all holiday dates
    const holidays = await CompanyHoliday.find({}, 'date');
    if (holidays.length === 0) {
      return res.json({ message: 'No holidays found. Nothing to update.', updated: 0 });
    }

    const holidayDates = holidays.map(h => h.date); // Array of YYYY-MM-DD strings

    // Find all attendance records on holiday dates that have both checkIn and checkOut
    const records = await Attendance.find({
      date: { $in: holidayDates },
      checkIn: { $exists: true },
      checkOut: { $exists: true }
    });

    if (records.length === 0) {
      return res.json({ message: 'No attendance records found on holiday dates.', updated: 0 });
    }

    let updatedCount = 0;

    for (const record of records) {
      const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());

      // On a holiday: all worked time is overtime, no lowTime
      const flags = getFlags(worked, false, 0, true, null, record.isPenaltyDisabled);

      const wasChanged = record.lowTimeFlag !== flags.lowTime || record.extraTimeFlag !== flags.extraTime;
      if (wasChanged) {
        record.lowTimeFlag = flags.lowTime;
        record.extraTimeFlag = flags.extraTime;
        record.totalWorkedSeconds = worked;
        await record.save();
        updatedCount++;
      }
    }

    await logAction(
      req.user._id,
      req.user.name,
      'RECALCULATE_HOLIDAY_FLAGS',
      'ATTENDANCE',
      'BULK',
      `Recalculated holiday overtime flags: ${updatedCount} record(s) updated out of ${records.length} found on ${holidayDates.length} holiday date(s)`
    );

    res.json({
      message: `Successfully recalculated holiday flags. ${updatedCount} record(s) updated.`,
      total: records.length,
      updated: updatedCount,
      holidayDates
    });
  } catch (error) {
    console.error('Recalculate holiday flags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Migration endpoint: Recalculate lowTimeFlag/extraTimeFlag for ALL attendance records
 * where a Half Day Leave was approved, using the corrected 240-min (4h) threshold.
 * Call once: POST /api/attendance/admin/recalculate-halfday-flags  (Admin/HR token)
 */
export const recalculateHalfDayFlags = async (req, res) => {
  try {
    // Find all approved half-day leaves
    const halfDayLeaves = await LeaveRequest.find({
      category: 'Half Day Leave',
      status: 'Approved'
    }).lean();

    if (halfDayLeaves.length === 0) {
      return res.json({ message: 'No approved Half Day Leave records found.', updated: 0 });
    }

    // Build a lookup: userId+date -> true
    const halfDaySet = new Set(
      halfDayLeaves.map(l => `${l.userId.toString()}-${l.startDate}`)
    );

    // Collect all unique dates from those leaves
    const leaveDates = [...new Set(halfDayLeaves.map(l => l.startDate))];

    // Fetch all attendance records on those dates that are fully clocked out
    const records = await Attendance.find({
      date: { $in: leaveDates },
      checkIn: { $exists: true, $ne: null },
      checkOut: { $exists: true, $ne: null }
    });

    if (records.length === 0) {
      return res.json({ message: 'No attendance records found for half-day leave dates.', updated: 0 });
    }

    // Bulk fetch extra time leaves for the same users/dates
    const allUserIds = [...new Set(records.map(r => (r.userId?._id || r.userId).toString()))];
    const extraTimeLeaves = await LeaveRequest.find({
      userId: { $in: allUserIds },
      startDate: { $in: leaveDates },
      category: 'Extra Time Leave',
      status: 'Approved'
    }).lean();
    const extraTimeMap = {};
    for (const l of extraTimeLeaves) {
      extraTimeMap[`${l.userId.toString()}-${l.startDate}`] = l;
    }

    // Bulk fetch holidays
    const allHolidays = await CompanyHoliday.find({ date: { $in: leaveDates } }, 'date').lean();
    const holidaySet = new Set(allHolidays.map(h => h.date));

    let updatedCount = 0;
    const saves = [];

    for (const record of records) {
      // Skip manually-flagged records
      if (record.isManualFlag) continue;

      const uid = (record.userId?._id || record.userId).toString();
      const key = `${uid}-${record.date}`;
      const isHalfDay = halfDaySet.has(key);

      // Only process records that actually had a half-day leave
      if (!isHalfDay) continue;

      const isHolidayWork = holidaySet.has(record.date);
      const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());

      let extraTimeLeaveMinutes = 0;
      const etLeave = extraTimeMap[key];
      if (etLeave && etLeave.startTime && etLeave.endTime) {
        const [startH, startM] = etLeave.startTime.split(':').map(Number);
        const [endH, endM] = etLeave.endTime.split(':').map(Number);
        extraTimeLeaveMinutes = Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
      }

      const flags = getFlags(worked, true, extraTimeLeaveMinutes, isHolidayWork, record.checkIn, record.isPenaltyDisabled);
      const adjustedWorked = isHolidayWork ? worked : Math.max(0, worked - flags.penaltySeconds);

      const changed =
        record.lowTimeFlag !== flags.lowTime ||
        record.extraTimeFlag !== flags.extraTime ||
        record.lateCheckIn !== flags.lateCheckIn ||
        record.penaltySeconds !== flags.penaltySeconds ||
        record.totalWorkedSeconds !== adjustedWorked;

      if (changed) {
        record.lowTimeFlag = flags.lowTime;
        record.extraTimeFlag = flags.extraTime;
        record.lateCheckIn = flags.lateCheckIn;
        record.penaltySeconds = flags.penaltySeconds;
        record.totalWorkedSeconds = adjustedWorked;
        saves.push(record.save());
        updatedCount++;
      }
    }

    if (saves.length > 0) {
      await Promise.all(saves);
    }

    await logAction(
      req.user._id,
      req.user.name,
      'RECALCULATE_HALFDAY_FLAGS',
      'ATTENDANCE',
      'BULK',
      `Recalculated half-day leave flags: ${updatedCount} record(s) updated out of ${records.length} checked`
    );

    res.json({
      message: `Successfully recalculated half-day leave flags. ${updatedCount} record(s) corrected.`,
      total: records.length,
      updated: updatedCount
    });
  } catch (error) {
    console.error('Recalculate half-day flags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
