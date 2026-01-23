// Business Rules
// Normal time: 8 hours 15 minutes to 8 hours 22 minutes (495 to 502 minutes)
// Low Time: worked < 8:15 (< 495 minutes)
// Extra Time: worked > 8:22 (> 502 minutes)
// Half-day: threshold is 4 hours 7.5 minutes (half of 8:15)

const MIN_NORMAL_MINUTES = 495; // 8h 15m (lower bound for normal)
const MAX_NORMAL_MINUTES = 502; // 8h 22m (upper bound for normal)
const HALF_DAY_THRESHOLD_MINUTES = 247.5; // 4h 7.5m (half of standard)

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

export const getFlags = (workedSeconds, isHalfDayApproved, extraTimeLeaveMinutes = 0) => {
  // Add Extra Time Leave minutes to worked time for calculation
  // Example: 1 hour leave + 7:15 work = 8:15 total (normal time)
  const workedMinutes = (workedSeconds / 60) + extraTimeLeaveMinutes;

  // Use half-day threshold if approved, otherwise use normal range
  if (isHalfDayApproved) {
    // For half-day, use half of the normal range
    const halfMinNormal = MIN_NORMAL_MINUTES / 2; // 247.5 minutes
    const halfMaxNormal = MAX_NORMAL_MINUTES / 2; // 251 minutes
    return {
      lowTime: workedMinutes > 0 && workedMinutes < halfMinNormal,
      extraTime: workedMinutes > halfMaxNormal
    };
  }

  // Normal logic: Normal = 8:15 to 8:22, Low < 8:15, Extra > 8:22
  return {
    lowTime: workedMinutes > 0 && workedMinutes < MIN_NORMAL_MINUTES,
    extraTime: workedMinutes > MAX_NORMAL_MINUTES
  };
};

export const getTodayStr = () => {
  return new Date().toISOString().split('T')[0];
};



