// Business Rules
// Normal time: 8 hours 15 minutes to 8 hours 22 minutes (495 to 502 minutes)
// Low Time: worked < 8:15 (< 495 minutes)
// Extra Time: worked > 8:22 (> 502 minutes)
// Half-day: normal = 4h 15m (255 min) to 4h 22m (262 min). Low < 4h 15m, Extra > 4h 22m
// Holiday Work: ALL worked time counts as overtime (extraTime), no lowTime ever
// Late Check-in Penalty: if checkIn > 09:00 AM, deduct 15 minutes from effective worked time

const MIN_NORMAL_MINUTES = 495; // 8h 15m (lower bound for normal)
const MAX_NORMAL_MINUTES = 502; // 8h 22m (upper bound for normal)
const HALF_DAY_THRESHOLD_MINUTES = 240; // 4h 0m (standard half-day duration)
const LATE_CHECKIN_HOUR = 9; // 9:00 AM cutoff
export const MIN_LATE_PENALTY_SECONDS = 15 * 60; // 900 seconds = 15 minutes
const PENALTY_EFFECTIVE_DATE = '2026-03-01'; // Apply to current records
export const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';
export const COMPULSORY_BREAK_EFFECTIVE_DATE = '2026-04-06';

/**
 * Returns true if the checkInTime is after 9:00:00 AM local time.
 */
export const isLateCheckIn = (checkInTime) => {
  if (!checkInTime) return false;
  const d = new Date(checkInTime);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  // Late if after exactly 09:00:00
  return (hours > LATE_CHECKIN_HOUR) ||
    (hours === LATE_CHECKIN_HOUR && (minutes > 0 || seconds > 0));
};

/**
 * Calculates how many seconds late the check-in was relative to 09:00 AM.
 */
export const calculateLatenessSeconds = (checkInTime) => {
  if (!checkInTime) return 0;
  const d = new Date(checkInTime);
  const cutoff = new Date(checkInTime);
  cutoff.setHours(LATE_CHECKIN_HOUR, 0, 0, 0);

  const diff = d.getTime() - cutoff.getTime();
  return Math.max(0, Math.floor(diff / 1000));
};

export const calculateDurationSeconds = (start, end) => {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(0, (e - s) / 1000);
};

export const calculateTotalBreakSeconds = (breaks) => {
  return (breaks || []).reduce((acc, b) => {
    if (b.start && b.end) {
      return acc + calculateDurationSeconds(b.start, b.end);
    }
    return acc;
  }, 0);
};

export const calculateTotalManualSeconds = (manualHours) => {
  return (manualHours || []).reduce((acc, m) => {
    return acc + (m.hours * 3600);
  }, 0);
};

export const calculateWorkedSeconds = (attendance, checkOutTime) => {
  const totalManual = calculateTotalManualSeconds(attendance.manualHours || []);
  
  if (!attendance.checkIn) return totalManual;

  const endTimeStr = checkOutTime || attendance.checkOut;
  if (!endTimeStr) return totalManual; // Session active, only count manual for now

  const totalSession = calculateDurationSeconds(attendance.checkIn, endTimeStr);
  const totalBreaks = calculateTotalBreakSeconds(attendance.breaks);

  return Math.max(0, totalSession - totalBreaks + totalManual);
};

/**
 * Calculate overtime/low-time flags.
 * @param {number} workedSeconds - Net worked seconds
 * @param {boolean} isHalfDayApproved - Whether a half-day leave is approved for this day
 * @param {number} extraTimeLeaveMinutes - Additional minutes from Extra Time Leave
 * @param {boolean} isHolidayWork - If true, ALL worked time is overtime (no low time ever)
 * @param {string|Date|null} checkInTime - Check-in timestamp; if after 9:00 AM, apply 15-min penalty
 * @param {boolean} isPenaltyDisabled - If true, no late check-in penalty is applied
 * @param {number} approvedOvertimeMinutes - Approved overtime duration from request
 * @returns {{ lowTime: boolean, extraTime: boolean, lateCheckIn: boolean, penaltySeconds: number, completedOvertime: number, unfulfilledOvertime: number }}
 */
export const getFlags = (workedSeconds, isHalfDayApproved, extraTimeLeaveMinutes = 0, isHolidayWork = false, checkInTime = null, isPenaltyDisabled = false, approvedOvertimeMinutes = 0) => {
  // Holiday rule: if employee works on a holiday, entire duration is overtime, no penalty
  if (isHolidayWork) {
    return {
      lowTime: false,
      extraTime: workedSeconds > 0,
      lateCheckIn: false,
      penaltySeconds: 0,
      completedOvertime: Math.floor(workedSeconds / 60),
      unfulfilledOvertime: 0
    };
  }

  // Late check-in penalty: deduct 15 minutes from effective worked time
  // ONLY apply penalty if date is on or after PENALTY_EFFECTIVE_DATE AND penalties are not disabled
  const late = isLateCheckIn(checkInTime);
  let penaltySeconds = 0;

  if (late && checkInTime && !isPenaltyDisabled) {
    const d = new Date(checkInTime);
    // Format to YYYY-MM-DD for comparison
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (dateStr >= PENALTY_EFFECTIVE_DATE) {
      const actualLatenessSeconds = calculateLatenessSeconds(checkInTime);
      // Penalty is MIN_LATE_PENALTY_SECONDS (15 mins) OR actual lateness, whichever is greater
      penaltySeconds = Math.max(MIN_LATE_PENALTY_SECONDS, actualLatenessSeconds);
    }
  }

  const effectiveWorkedSeconds = Math.max(0, workedSeconds - penaltySeconds);

  // Add Extra Time Leave minutes to worked time for calculation
  const workedMinutes = (effectiveWorkedSeconds / 60) + extraTimeLeaveMinutes;

  // Use half-day threshold if approved, otherwise use normal range
  const standardMinNormal = isHalfDayApproved ? (MIN_NORMAL_MINUTES / 2) : MIN_NORMAL_MINUTES;
  const standardMaxNormal = isHalfDayApproved ? (MAX_NORMAL_MINUTES / 2) : MAX_NORMAL_MINUTES;
  
  // COMMITMENT RULE: Approved Overtime increases the target.
  // We no longer trigger Low Time for incomplete overtime, only if they miss the standard minimum work time.
  const targetMinutes = standardMaxNormal + approvedOvertimeMinutes;
  
  // Calculate completed and unfulfilled overtime
  let completedOvertime = 0;
  let unfulfilledOvertime = 0;
  
  if (approvedOvertimeMinutes > 0) {
    if (workedMinutes > standardMaxNormal) {
      completedOvertime = Math.floor(workedMinutes - standardMaxNormal);
      if (completedOvertime > approvedOvertimeMinutes) {
        completedOvertime = approvedOvertimeMinutes;
      }
    }
    unfulfilledOvertime = approvedOvertimeMinutes - completedOvertime;
  }

  return {
    lowTime: workedMinutes > 0 && workedMinutes < standardMinNormal,
    extraTime: approvedOvertimeMinutes > 0 && workedMinutes > standardMaxNormal,
    lateCheckIn: late,
    penaltySeconds,
    completedOvertime,
    unfulfilledOvertime
  };
};

export const getTodayStr = () => {
  return new Date().toISOString().split('T')[0];
};
