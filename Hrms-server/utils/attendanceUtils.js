// Business Rules
// Standard day: 8 hours 15 minutes = 495 minutes
// Low Time: worked < 8:15
// Extra Time: worked > 8:15
// Half-day: threshold is 4 hours 7.5 minutes (half of 8:15)

const STANDARD_DAY_MINUTES = 495; // 8h 15m
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

export const getFlags = (workedSeconds, isHalfDayApproved) => {
  const workedMinutes = workedSeconds / 60;
  
  // Use half-day threshold if approved, otherwise standard day
  const threshold = isHalfDayApproved ? HALF_DAY_THRESHOLD_MINUTES : STANDARD_DAY_MINUTES;

  return {
    lowTime: workedMinutes > 0 && workedMinutes < threshold,
    extraTime: workedMinutes > threshold
  };
};

export const getTodayStr = () => {
  return new Date().toISOString().split('T')[0];
};



