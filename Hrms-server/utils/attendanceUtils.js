// Business Rules
// Normal time: 8 hours 15 minutes to 8 hours 22 minutes (495 to 502 minutes)
// Low Time: worked < 8:15 (< 495 minutes)
// General Overtime: worked > 8:15 (> 495 minutes) — auto-calculated daily
// Management Overtime: employee request + admin approval
// Early Overtime: deficit from approved early checkout; must be covered before/after
// Half-day: normal = 4h 15m (255 min) to 4h 22m (262 min). Low < 4h 15m, General OT > 4h 15m
// Holiday Work: ALL worked time counts as general overtime (extraTime), no lowTime ever

const MIN_NORMAL_MINUTES = 495; // 8h 15m (lower bound for normal)
const MAX_NORMAL_MINUTES = 502; // 8h 22m (upper bound for normal)
/** Minimum net worked time to complete a shift on a half-day leave day (matches standardMinNormal). */
export const HALF_DAY_MIN_SHIFT_SECONDS = Math.floor(MIN_NORMAL_MINUTES / 2) * 60;
export const FULL_DAY_MIN_SHIFT_SECONDS = MIN_NORMAL_MINUTES * 60;
const HALF_DAY_THRESHOLD_MINUTES = 240; // 4h 0m (standard half-day duration)
export const LEGACY_LATE_PENALTY_START_TIME = '09:00';
export const CURRENT_LATE_PENALTY_START_TIME = '09:15';
/** From this date (YYYY-MM-DD, company calendar) penalty starts after 09:15; before uses 09:00. */
export const LATE_PENALTY_915_EFFECTIVE_DATE = '2026-07-06';
export const DEFAULT_LATE_PENALTY_START_TIME = CURRENT_LATE_PENALTY_START_TIME;
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
 * Penalty cutoff for a given attendance date.
 * Before LATE_PENALTY_915_EFFECTIVE_DATE → 09:00; on/after → settings or 09:15.
 */
export const resolveLatePenaltyStartTime = (settings, dateStr) => {
  const normalizedDate = dateStr ? String(dateStr).slice(0, 10) : null;
  if (normalizedDate && normalizedDate < LATE_PENALTY_915_EFFECTIVE_DATE) {
    return LEGACY_LATE_PENALTY_START_TIME;
  }
  return settings?.latePenaltyStartTime || CURRENT_LATE_PENALTY_START_TIME;
};

/**
 * Returns true if checkInTime is after the configured penalty start time (default 09:15:00).
 */
export const isLateCheckIn = (checkInTime, latePenaltyStartTime = DEFAULT_LATE_PENALTY_START_TIME, timeZone = 'Asia/Kolkata') => {
  if (!checkInTime) return false;
  const { hour, minute } = getWallClockHM(new Date(checkInTime), timeZone);
  const { hour: cutoffH, minute: cutoffM } = parseCheckInTime(latePenaltyStartTime);
  const checkInSecs = hour * 3600 + minute * 60;
  const cutoffSecs = cutoffH * 3600 + cutoffM * 60;
  return checkInSecs > cutoffSecs;
};

/**
 * Seconds late relative to the configured penalty start time (default 09:15 AM), in company timezone.
 */
export const calculateLatenessSeconds = (checkInTime, latePenaltyStartTime = DEFAULT_LATE_PENALTY_START_TIME, timeZone = 'Asia/Kolkata') => {
  if (!checkInTime) return 0;
  const { hour, minute } = getWallClockHM(new Date(checkInTime), timeZone);
  const { hour: cutoffH, minute: cutoffM } = parseCheckInTime(latePenaltyStartTime);
  const checkInSecs = hour * 3600 + minute * 60;
  const cutoffSecs = cutoffH * 3600 + cutoffM * 60;
  return Math.max(0, checkInSecs - cutoffSecs);
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
export const getFlags = (workedSeconds, isHalfDayApproved, extraTimeLeaveMinutes = 0, isHolidayWork = false, checkInTime = null, isPenaltyDisabled = false, approvedOvertimeMinutes = 0, dateStr = null, isEarlyReleaseDay = false, latePenaltyStartTime = DEFAULT_LATE_PENALTY_START_TIME, timeZone = 'Asia/Kolkata') => {
  // Holiday rule: if employee works on a holiday, entire duration is overtime, no penalty
  if (isHolidayWork) {
    const holidayMins = Math.floor(workedSeconds / 60);
    return {
      lowTime: false,
      extraTime: workedSeconds > 0,
      lateCheckIn: false,
      penaltySeconds: 0,
      completedOvertime: holidayMins,
      completedGeneralOvertime: holidayMins,
      unfulfilledOvertime: 0
    };
  }

  // Late check-in penalty: deduct 15 minutes from effective worked time
  // ONLY apply penalty if date is on or after PENALTY_EFFECTIVE_DATE AND penalties are not disabled
  const late = isLateCheckIn(checkInTime, latePenaltyStartTime, timeZone);
  let penaltySeconds = 0;

  // Half-day leave: no late check-in penalty for that date (low-time uses halved thresholds separately)
  if (late && checkInTime && !isPenaltyDisabled && !isHalfDayApproved) {
    const checkInDateStr = getDateStrInTimezone(new Date(checkInTime), timeZone);

    if (checkInDateStr >= PENALTY_EFFECTIVE_DATE) {
      const actualLatenessSeconds = calculateLatenessSeconds(checkInTime, latePenaltyStartTime, timeZone);
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

  // Auto general overtime: minutes worked beyond 8h 15m (full day) or 4h 15m (half-day)
  const completedGeneralOvertime =
    workedMinutes > standardMinNormal ? Math.floor(workedMinutes - standardMinNormal) : 0;
  const unfulfilledOvertime = 0;

  return {
    lowTime: isEarlyReleaseDay ? false : workedMinutes > 0 && workedMinutes < standardMinNormal,
    extraTime: completedGeneralOvertime > 0,
    lateCheckIn: late,
    penaltySeconds,
    completedOvertime: completedGeneralOvertime,
    completedGeneralOvertime,
    unfulfilledOvertime
  };
};

/**
 * Calculate early checkout deficit minutes (time short of minimum shift).
 */
export const calculateEarlyOvertimeDeficit = (
  workedMinutes,
  isHalfDayApproved,
  earlyLogoutApproved
) => {
  if (!earlyLogoutApproved) return 0;
  const minNormal = isHalfDayApproved ? MIN_NORMAL_MINUTES / 2 : MIN_NORMAL_MINUTES;
  if (workedMinutes >= minNormal) return 0;
  return Math.floor(minNormal - workedMinutes);
};

/** Update early overtime status based on deficit vs covered. */
export const syncEarlyOvertimeStatus = (attendance) => {
  if (!attendance.earlyOvertime) {
    attendance.earlyOvertime = { deficitMinutes: 0, coveredMinutes: 0, status: 'None' };
  }
  const { deficitMinutes = 0, coveredMinutes = 0 } = attendance.earlyOvertime;
  if (deficitMinutes <= 0) {
    attendance.earlyOvertime.status = 'None';
  } else if (coveredMinutes >= deficitMinutes) {
    attendance.earlyOvertime.status = 'Covered';
  } else if (coveredMinutes > 0) {
    attendance.earlyOvertime.status = 'Partial';
  } else {
    attendance.earlyOvertime.status = 'Pending';
  }
  return attendance;
};

/**
 * Allocate surplus minutes to cover earliest outstanding early-overtime deficits.
 * Returns minutes remaining after allocation.
 */
export const allocateEarlyOvertimeCoverage = (records, surplusMinutes) => {
  let remaining = surplusMinutes;
  if (remaining <= 0) return 0;

  const sorted = [...records]
    .filter((r) => {
      const eo = r.earlyOvertime || {};
      const deficit = eo.deficitMinutes || 0;
      const covered = eo.coveredMinutes || 0;
      return deficit > covered;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const record of sorted) {
    if (remaining <= 0) break;
    if (!record.earlyOvertime) {
      record.earlyOvertime = { deficitMinutes: 0, coveredMinutes: 0, status: 'None' };
    }
    const uncovered = record.earlyOvertime.deficitMinutes - record.earlyOvertime.coveredMinutes;
    const toCover = Math.min(remaining, uncovered);
    record.earlyOvertime.coveredMinutes += toCover;
    remaining -= toCover;
    syncEarlyOvertimeStatus(record);
  }

  return remaining;
};

/** Calendar month key (YYYY-MM) for a YYYY-MM-DD date string. */
export const getMonthKey = (dateStr) => (dateStr || '').slice(0, 7);

/**
 * Redistribute a day's OT-eligible surplus across Management OT and any approved Early OT
 * repayment BEFORE what remains is counted as General OT, so the same worked minutes are
 * never counted in more than one bucket.
 *
 * Idempotent: safe to call more than once for the same day (e.g. Management OT approved at
 * checkout, then Early OT repayment approved later, or vice versa) because it always starts
 * from `rawOvertimeSurplusMinutes` and first undoes any repayment it previously applied to
 * `sameMonthDeficitRecords` before recomputing from scratch.
 *
 * @param {object} attendance - Today's attendance record (mutated in place)
 * @param {object[]} sameMonthDeficitRecords - ALL other attendance records for this user in the
 *   same calendar month as `attendance.date` that have `earlyOvertime.deficitMinutes > 0`
 *   (regardless of current outstanding/covered state), sorted oldest-first. Mutated in place
 *   (caller must persist them) when repayment is applied or undone.
 * @returns {{ mgmtMinutes: number, repaymentMinutes: number, generalOvertimeMinutes: number }}
 */
export const recalculateOvertimeBuckets = (attendance, sameMonthDeficitRecords = []) => {
  const rawGeneralMinutes = attendance.rawOvertimeSurplusMinutes || attendance.generalOvertimeMinutes || 0;

  // Undo any repayment this record previously applied, so re-running this function with a
  // different Management OT / repayment approval state doesn't compound on stale allocations.
  let previouslyApplied = attendance.earlyOvertimeRepayment?.appliedMinutes || 0;
  for (const record of sameMonthDeficitRecords) {
    if (previouslyApplied <= 0) break;
    const eo = record.earlyOvertime;
    if (!eo || !eo.coveredMinutes) continue;
    const undoAmount = Math.min(previouslyApplied, eo.coveredMinutes);
    eo.coveredMinutes -= undoAmount;
    previouslyApplied -= undoAmount;
    syncEarlyOvertimeStatus(record);
  }

  const mgmtApproved = attendance.managementOvertime?.status === 'Approved';
  const mgmtCompleted = mgmtApproved
    ? (attendance.managementOvertime.completedMinutes || attendance.managementOvertime.durationMinutes || 0)
    : 0;
  const mgmtMinutes = Math.min(mgmtCompleted, rawGeneralMinutes);

  const remainingAfterMgmt = rawGeneralMinutes - mgmtMinutes;

  const earlyCheckoutApproved =
    attendance.earlyLogoutRequest === 'Approved' ||
    attendance.earlyOvertime?.requestStatus === 'Approved';
  const earlyCheckoutCompleted = earlyCheckoutApproved
    ? (attendance.earlyOvertime?.completedMinutes || 0)
    : 0;
  const earlySurplusMinutes = Math.min(earlyCheckoutCompleted, remainingAfterMgmt);

  const remainingAfterEarly = remainingAfterMgmt - earlySurplusMinutes;

  const repaymentApproved = attendance.earlyOvertimeRepayment?.status === 'Approved';
  const requestedRepaymentMinutes = repaymentApproved
    ? (attendance.earlyOvertimeRepayment.requestedMinutes || 0)
    : 0;

  const outstandingDeficitInMonth = sameMonthDeficitRecords.reduce((sum, r) => {
    const eo = r.earlyOvertime || {};
    return sum + Math.max(0, (eo.deficitMinutes || 0) - (eo.coveredMinutes || 0));
  }, 0);

  const repaymentMinutes = repaymentApproved
    ? Math.min(requestedRepaymentMinutes, remainingAfterEarly, outstandingDeficitInMonth)
    : 0;

  if (attendance.earlyOvertimeRepayment) {
    attendance.earlyOvertimeRepayment.appliedMinutes = repaymentMinutes;
  }

  if (repaymentMinutes > 0) {
    allocateEarlyOvertimeCoverage(sameMonthDeficitRecords, repaymentMinutes);
  }

  const finalGeneralMinutes = Math.max(0, remainingAfterEarly - repaymentMinutes);
  attendance.generalOvertimeMinutes = finalGeneralMinutes;
  attendance.rawOvertimeSurplusMinutes = rawGeneralMinutes;

  const legacyGeneral = getLegacyGeneralOvertimeMinutes(attendance);
  attendance.extraTimeFlag =
    finalGeneralMinutes > 0 ||
    legacyGeneral > 0 ||
    mgmtMinutes > 0 ||
    earlySurplusMinutes > 0;

  return {
    mgmtMinutes,
    earlySurplusMinutes,
    repaymentMinutes,
    generalOvertimeMinutes: finalGeneralMinutes
  };
};

/** Read general OT from legacy overtimeRequest without losing historical values. */
export const getLegacyGeneralOvertimeMinutes = (attendance) => {
  const stored = attendance?.generalOvertimeMinutes;
  if (typeof stored === 'number' && stored > 0) return stored;

  const ot = attendance?.overtimeRequest;
  if (!ot) return 0;
  if (typeof ot.completedMinutes === 'number' && ot.completedMinutes > 0) return ot.completedMinutes;
  if (ot.status === 'Approved' && typeof ot.durationMinutes === 'number' && ot.durationMinutes > 0) {
    return ot.durationMinutes;
  }
  return 0;
};

/**
 * Resolve general OT minutes — never lower than previously stored legacy values.
 * Preserves existing overtimeRequest / generalOvertimeMinutes when recalc yields zero.
 */
export const resolveGeneralOvertimeMinutes = (attendance, calculatedMins = 0) => {
  const legacyMins = getLegacyGeneralOvertimeMinutes(attendance);
  return Math.max(calculatedMins || 0, legacyMins);
};

/**
 * Hydrate response objects so old records expose new OT fields without DB migration.
 * Does not remove or overwrite any existing field values.
 */
export const hydrateAttendanceOvertimeFields = (attendance) => {
  if (!attendance) return attendance;

  const doc = attendance.toObject ? attendance.toObject() : { ...attendance };
  const legacyGeneral = getLegacyGeneralOvertimeMinutes(doc);

  if (!doc.generalOvertimeMinutes || doc.generalOvertimeMinutes <= 0) {
    if (legacyGeneral > 0) doc.generalOvertimeMinutes = legacyGeneral;
  }

  if (!doc.managementOvertime) {
    doc.managementOvertime = {
      reason: '',
      durationMinutes: 0,
      status: 'None',
      completedMinutes: 0
    };
  }

  if (!doc.earlyOvertimeRepayment) {
    doc.earlyOvertimeRepayment = {
      requestedMinutes: 0,
      reason: '',
      status: 'None',
      appliedMinutes: 0
    };
  }

  if (!doc.earlyOvertime) {
    doc.earlyOvertime = {
      reason: '',
      durationMinutes: 0,
      requestStatus: 'None',
      deficitMinutes: 0,
      coveredMinutes: 0,
      status: 'None'
    };
  } else if (!doc.earlyOvertime.requestStatus) {
    doc.earlyOvertime.requestStatus =
      doc.earlyLogoutRequest === 'Pending'
        ? 'Pending'
        : doc.earlyLogoutRequest === 'Approved'
          ? 'Approved'
          : doc.earlyLogoutRequest === 'Rejected'
            ? 'Rejected'
            : 'None';
  }

  // Keep legacy overtimeRequest intact; only ensure extraTimeFlag reflects all sources
  const hasGeneral =
    (doc.generalOvertimeMinutes || 0) > 0 ||
    (doc.overtimeRequest?.status === 'Approved' && (doc.overtimeRequest?.completedMinutes || 0) > 0);
  const hasMgmt =
    doc.managementOvertime?.status === 'Approved' &&
    (doc.managementOvertime?.completedMinutes || 0) > 0;
  const hasEarlySurplus =
    (doc.earlyLogoutRequest === 'Approved' || doc.earlyOvertime?.requestStatus === 'Approved') &&
    (doc.earlyOvertime?.completedMinutes || 0) > 0;

  if (hasGeneral || hasMgmt || hasEarlySurplus) {
    doc.extraTimeFlag = true;
  }

  return doc;
};

/** Persist all three overtime types on the attendance record (non-destructive). */
export const syncAllOvertimeRecords = (attendance, flags, context = {}) => {
  const {
    isHalfDayApproved = false,
    earlyLogoutApproved = false,
    workedMinutes = 0
  } = context;

  const calculatedMins = flags.completedGeneralOvertime ?? flags.completedOvertime ?? 0;
  const generalMins = resolveGeneralOvertimeMinutes(attendance, calculatedMins);
  attendance.generalOvertimeMinutes = generalMins;
  attendance.rawOvertimeSurplusMinutes = generalMins;

  // Mirror to legacy overtimeRequest only when new OT is calculated — never clear existing legacy data
  if (calculatedMins > 0 && flags.extraTime) {
    const prev = attendance.overtimeRequest || {};
    attendance.overtimeRequest = {
      reason: prev.reason || 'Automatic (worked beyond 8h 15m)',
      durationMinutes: generalMins,
      status: 'Approved',
      requestedAt: prev.requestedAt || new Date(),
      approvedBy: prev.approvedBy,
      approvedAt: prev.approvedAt || new Date(),
      completedMinutes: generalMins,
      unfulfilledMinutes: prev.unfulfilledMinutes || 0
    };
  }
  // Intentionally do NOT reset overtimeRequest when calculatedMins is 0 — preserves all historical records

  // Early overtime deficit — only set when not already recorded; never reset coveredMinutes
  if (earlyLogoutApproved && attendance.checkOut) {
    if (!attendance.earlyOvertime) {
      attendance.earlyOvertime = { deficitMinutes: 0, coveredMinutes: 0, status: 'None' };
    }
    const existingDeficit = attendance.earlyOvertime.deficitMinutes || 0;
    if (existingDeficit <= 0) {
      const deficit = calculateEarlyOvertimeDeficit(
        workedMinutes,
        isHalfDayApproved,
        earlyLogoutApproved
      );
      if (deficit > 0) {
        attendance.earlyOvertime.deficitMinutes = deficit;
      }
    }
    syncEarlyOvertimeStatus(attendance);
  }

  const legacyGeneral = getLegacyGeneralOvertimeMinutes(attendance);
  attendance.extraTimeFlag =
    generalMins > 0 ||
    legacyGeneral > 0 ||
    (attendance.managementOvertime?.status === 'Approved' &&
      (attendance.managementOvertime?.completedMinutes || 0) > 0);

  return attendance;
};

/** @deprecated Use syncAllOvertimeRecords */
export const syncAutoOvertimeRecord = (attendance, flags, context = {}) => {
  return syncAllOvertimeRecords(attendance, flags, context);
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

/** Default auto-checkout wall-clock time when employee has not checked out. */
export const AUTO_CHECKOUT_HOUR = 22;
export const AUTO_CHECKOUT_MINUTE = 0;

/**
 * Build a UTC Date for a wall-clock time on YYYY-MM-DD in the company timezone.
 */
export const buildWallClockDateTime = (
  dateStr,
  hour,
  minute,
  timeZone = 'Asia/Kolkata'
) => {
  const targetDate = String(dateStr).slice(0, 10);
  let low =
    Date.UTC(
      parseInt(targetDate.slice(0, 4), 10),
      parseInt(targetDate.slice(5, 7), 10) - 1,
      parseInt(targetDate.slice(8, 10), 10),
      0,
      0,
      0
    ) -
    14 * 3600000;
  let high = low + 48 * 3600000;

  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((low + high) / 2);
    const d = getDateStrInTimezone(new Date(mid), timeZone);
    const { hour: h, minute: m } = getWallClockHM(new Date(mid), timeZone);
    const afterTarget =
      d > targetDate ||
      (d === targetDate && (h > hour || (h === hour && m > minute)));
    if (d === targetDate && h === hour && m === minute) {
      return new Date(mid);
    }
    if (afterTarget) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  const fallback = new Date(`${targetDate}T00:00:00`);
  fallback.setHours(hour, minute, 0, 0);
  return fallback;
};
