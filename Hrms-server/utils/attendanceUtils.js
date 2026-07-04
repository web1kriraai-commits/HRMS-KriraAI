// Business Rules
// Normal time: 8 hours 15 minutes to 8 hours 22 minutes (495 to 502 minutes)
// Low Time: worked < 8:15 (< 495 minutes)
// Extra Time: worked > 8:22 (> 502 minutes)
// Half-day: normal = 4h 15m (255 min) to 4h 22m (262 min). Low < 4h 15m, Extra > 4h 22m
// Holiday Work: ALL worked time counts as overtime (extraTime), no lowTime ever
// Late Check-in Penalty: if checkIn > 09:00 AM, deduct from effective worked time (skipped when half-day leave approved that day)

const MIN_NORMAL_MINUTES = 495; // 8h 15m (lower bound for normal)
const MAX_NORMAL_MINUTES = 502; // 8h 22m (upper bound for normal)
/** Minimum net worked time to complete a shift on a half-day leave day (matches standardMinNormal). */
export const HALF_DAY_MIN_SHIFT_SECONDS = Math.floor(MIN_NORMAL_MINUTES / 2) * 60;
export const FULL_DAY_MIN_SHIFT_SECONDS = MIN_NORMAL_MINUTES * 60;
const HALF_DAY_THRESHOLD_MINUTES = 240; // 4h 0m (standard half-day duration)
const LATE_CHECKIN_HOUR = 9; // 9:00 AM cutoff
/** Earliest time employees may clock in (non-admin), in company local time */
export const EARLIEST_CHECK_IN_HOUR = 8;
export const EARLIEST_CHECK_IN_MINUTE = 30;

/**
 * @param {Date} now
 * @param {string} [timeZone='Asia/Kolkata'] IANA timezone
 * @param {boolean} [isHoliday=false] Whether today is a company holiday
 * @returns {boolean} true if clock-in is allowed at this moment in that zone
 */
export const isClockInTimeAllowed = (
  now,
  timeZone = 'Asia/Kolkata',
  isHoliday = false,
  checkInHour = EARLIEST_CHECK_IN_HOUR,
  checkInMinute = EARLIEST_CHECK_IN_MINUTE
) => {
  if (isHoliday) return true;
  const { hour, minute } = getWallClockHM(now, timeZone);
  return hour > checkInHour || (hour === checkInHour && minute >= checkInMinute);
};
export const MIN_LATE_PENALTY_SECONDS = 15 * 60; // 900 seconds = 15 minutes
const PENALTY_EFFECTIVE_DATE = '2026-03-01'; // Apply to current records
export const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';
export const COMPULSORY_BREAK_EFFECTIVE_DATE = '2026-04-06';
/** Minimum combined Break + Extra Break time required before checkout (20 minutes). */
export const MIN_TOTAL_BREAK_SECONDS = 1200;

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
      const stored = b.durationSeconds;
      if (typeof stored === 'number' && stored > 0) return acc + stored;
      return acc + calculateDurationSeconds(b.start, b.end);
    }
    return acc;
  }, 0);
};

export const hasMinimumTotalBreakTime = (breaks, minSeconds = MIN_TOTAL_BREAK_SECONDS) =>
  calculateTotalBreakSeconds(breaks) >= minSeconds;

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
 * @param {string|Date|null} checkInTime - Check-in timestamp; if after 9:00 AM, apply late penalty (unless half-day approved)
 * @param {boolean} isPenaltyDisabled - If true, no late check-in penalty is applied
 * @param {number} approvedOvertimeMinutes - Approved overtime duration from request
 * @param {string} dateStr - Date string for policy cutoff check
 * @param {boolean} isEarlyReleaseDay - Admin set per-day checkout override; no low time for that day
 * @returns {{ lowTime: boolean, extraTime: boolean, lateCheckIn: boolean, penaltySeconds: number, completedOvertime: number, unfulfilledOvertime: number }}
 */
export const getFlags = (workedSeconds, isHalfDayApproved, extraTimeLeaveMinutes = 0, isHolidayWork = false, checkInTime = null, isPenaltyDisabled = false, approvedOvertimeMinutes = 0, dateStr = null, isEarlyReleaseDay = false) => {
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

  // Half-day leave: no late check-in penalty for that date (low-time uses halved thresholds separately)
  if (late && checkInTime && !isPenaltyDisabled && !isHalfDayApproved) {
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

  // Auto overtime: minutes worked beyond normal cap (8h 15m + 7m buffer = 8h 22m full day)
  const completedOvertime =
    workedMinutes > standardMaxNormal ? Math.floor(workedMinutes - standardMaxNormal) : 0;
  const unfulfilledOvertime = 0;

  return {
    lowTime: isEarlyReleaseDay ? false : workedMinutes > 0 && workedMinutes < standardMinNormal,
    extraTime: completedOvertime > 0,
    lateCheckIn: late,
    penaltySeconds,
    completedOvertime,
    unfulfilledOvertime
  };
};

/** Persist auto-calculated overtime on the attendance record (no manual request/approval). */
export const syncAutoOvertimeRecord = (attendance, flags) => {
  const mins = flags.completedOvertime || 0;
  if (mins > 0 && flags.extraTime) {
    attendance.overtimeRequest = {
      reason: 'Automatic (worked beyond 8h 15m + 7m buffer)',
      durationMinutes: mins,
      status: 'Approved',
      requestedAt: attendance.overtimeRequest?.requestedAt || new Date(),
      approvedAt: new Date(),
      completedMinutes: mins,
      unfulfilledMinutes: 0
    };
  } else {
    attendance.overtimeRequest = {
      reason: '',
      durationMinutes: 0,
      status: 'None',
      completedMinutes: 0,
      unfulfilledMinutes: 0
    };
  }
  return attendance;
};

export const getTodayStr = () => {
  return new Date().toISOString().split('T')[0];
};

export const DEFAULT_CHECK_IN_TIME = '08:30';
export const DEFAULT_CHECKOUT_TIME = '17:30';

/** Wall-clock hour/minute in company timezone */
export const getWallClockHM = (now, timeZone = 'Asia/Kolkata') => {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour').value, 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute').value, 10);
    return { hour, minute };
  } catch {
    return { hour: now.getHours(), minute: now.getMinutes() };
  }
};

/** Calendar date YYYY-MM-DD in company timezone */
export const getDateStrInTimezone = (now, timeZone = 'Asia/Kolkata') => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
  } catch {
    return getTodayStr();
  }
};

export const parseCheckoutTime = (timeStr) => {
  const s = String(timeStr || DEFAULT_CHECKOUT_TIME).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 17, minute: 30 };
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 17, minute: 30 };
  return { hour, minute };
};

export const parseCheckInTime = (timeStr) => {
  const s = String(timeStr || DEFAULT_CHECK_IN_TIME).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: EARLIEST_CHECK_IN_HOUR, minute: EARLIEST_CHECK_IN_MINUTE };
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: EARLIEST_CHECK_IN_HOUR, minute: EARLIEST_CHECK_IN_MINUTE };
  }
  return { hour, minute };
};

export const getCheckInOverrideForDate = (settings, dateStr) => {
  const overrides = settings?.checkInTimeOverrides;
  if (overrides instanceof Map) return overrides.get(dateStr) || null;
  if (overrides && typeof overrides === 'object') return overrides[dateStr] || null;
  return null;
};

export const resolveCheckInTimeForDate = (settings, dateStr) => {
  const override = getCheckInOverrideForDate(settings, dateStr);
  return parseCheckInTime(override || settings?.defaultCheckInTime || DEFAULT_CHECK_IN_TIME);
};

export const hasCheckInOverrideForDate = (settings, dateStr) =>
  Boolean(getCheckInOverrideForDate(settings, dateStr));

export const getCheckoutOverrideForDate = (settings, dateStr) => {
  const overrides = settings?.checkoutTimeOverrides;
  if (overrides instanceof Map) return overrides.get(dateStr) || null;
  if (overrides && typeof overrides === 'object') return overrides[dateStr] || null;
  return null;
};

export const resolveCheckoutTimeForDate = (settings, dateStr) => {
  const override = getCheckoutOverrideForDate(settings, dateStr);
  return parseCheckoutTime(override || settings?.defaultCheckoutTime || DEFAULT_CHECKOUT_TIME);
};

/** Admin set a custom checkout time for this calendar day (early release / special day). */
export const hasCheckoutOverrideForDate = (settings, dateStr) =>
  Boolean(getCheckoutOverrideForDate(settings, dateStr));

export const formatCheckoutTimeLabel = (hour, minute) => {
  const h12 = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
};

/**
 * Non-admin: checkout allowed from configured time (default 17:30) in company timezone.
 * Half-day leave, holiday, or approved early logout allows checkout before that time.
 */
export const isClockOutTimeAllowed = (
  now,
  {
    hasHalfDayLeave = false,
    earlyLogoutApproved = false,
    roleIsAdmin = false,
    isHoliday = false,
    checkoutHour = 17,
    checkoutMinute = 30,
    timeZone = 'Asia/Kolkata'
  } = {}
) => {
  if (roleIsAdmin || earlyLogoutApproved || isHoliday) return true;
  if (hasHalfDayLeave) return true;
  const { hour, minute } = getWallClockHM(now, timeZone);
  return hour > checkoutHour || (hour === checkoutHour && minute >= checkoutMinute);
};

/**
 * Minimum net worked time for checkout. Approved early logout bypasses (admin still must meet minimum).
 */
export const isWorkedSecondsSufficientForCheckout = (
  workedSeconds,
  { hasHalfDayLeave = false, earlyLogoutApproved = false, isHoliday = false } = {}
) => {
  if (earlyLogoutApproved || isHoliday) return true;
  const min = hasHalfDayLeave ? HALF_DAY_MIN_SHIFT_SECONDS : FULL_DAY_MIN_SHIFT_SECONDS;
  return workedSeconds >= min;
};
