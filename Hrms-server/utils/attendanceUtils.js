// Business Rules
// Normal time: 8 hours 15 minutes to 8 hours 22 minutes (495 to 502 minutes)
// Low Time: worked < 8:15 (< 495 minutes)
// Extra Time: worked > 8:22 (> 502 minutes)
// Half-day: normal = 4 hours (240 min) to 4h 11m (251/2 min). Low < 4 hours, Extra > 4h 11m
// Holiday Work: ALL worked time counts as overtime (extraTime), no lowTime ever
// Late Check-in Penalty: if checkIn > 09:00 AM, deduct 15 minutes from effective worked time

const MIN_NORMAL_MINUTES = 495; // 8h 15m (lower bound for normal)
const MAX_NORMAL_MINUTES = 502; // 8h 22m (upper bound for normal)
const HALF_DAY_THRESHOLD_MINUTES = 240; // 4h 0m (standard half-day duration)
const LATE_CHECKIN_HOUR = 9; // 9:00 AM cutoff
export const MIN_LATE_PENALTY_SECONDS = 15 * 60; // 900 seconds = 15 minutes
const PENALTY_EFFECTIVE_DATE = '2026-02-01'; // Apply to current records

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
  return breaks.reduce((acc, b) => {
    if (b.start && b.end) {
      return acc + calculateDurationSeconds(b.start, b.end);
    }
    return acc;
  }, 0);
};

export const calculateWorkedSeconds = (attendance, checkOutTime) => {
  if (!attendance.checkIn) return 0;

  const endTimeStr = checkOutTime || attendance.checkOut;
  if (!endTimeStr) return 0; // Still active

  const totalSession = calculateDurationSeconds(attendance.checkIn, endTimeStr);
  const totalBreaks = calculateTotalBreakSeconds(attendance.breaks);

  return Math.max(0, totalSession - totalBreaks);
};

/**
 * Calculate overtime/low-time flags.
 * @param {number} workedSeconds - Net worked seconds
 * @param {boolean} isHalfDayApproved - Whether a half-day leave is approved for this day
 * @param {number} extraTimeLeaveMinutes - Additional minutes from Extra Time Leave
 * @param {boolean} isHolidayWork - If true, ALL worked time is overtime (no low time ever)
 * @param {string|Date|null} checkInTime - Check-in timestamp; if after 9:00 AM, apply 15-min penalty
 * @returns {{ lowTime: boolean, extraTime: boolean, lateCheckIn: boolean, penaltySeconds: number }}
 */
export const getFlags = (workedSeconds, isHalfDayApproved, extraTimeLeaveMinutes = 0, isHolidayWork = false, checkInTime = null) => {
  // Holiday rule: if employee works on a holiday, entire duration is overtime, no penalty
  if (isHolidayWork) {
    return {
      lowTime: false,
      extraTime: workedSeconds > 0,
      lateCheckIn: false,
      penaltySeconds: 0
    };
  }

  // Late check-in penalty: deduct 15 minutes from effective worked time
  // ONLY apply penalty if date is on or after PENALTY_EFFECTIVE_DATE
  const late = isLateCheckIn(checkInTime);
  let penaltySeconds = 0;

  if (late && checkInTime) {
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
  if (isHalfDayApproved) {
    const halfMinNormal = HALF_DAY_THRESHOLD_MINUTES; // 240 minutes = 4 hours (standard half-day)
    const halfMaxNormal = MAX_NORMAL_MINUTES / 2;     // ~251 minutes = 4h 11m
    return {
      lowTime: workedMinutes > 0 && workedMinutes < halfMinNormal,
      extraTime: workedMinutes > halfMaxNormal,
      lateCheckIn: late,
      penaltySeconds
    };
  }

  // Normal logic: Normal = 8:15 to 8:22, Low < 8:15, Extra > 8:22
  return {
    lowTime: workedMinutes > 0 && workedMinutes < MIN_NORMAL_MINUTES,
    extraTime: workedMinutes > MAX_NORMAL_MINUTES,
    lateCheckIn: late,
    penaltySeconds
  };
};

export const getTodayStr = () => {
  return new Date().toISOString().split('T')[0];
};
