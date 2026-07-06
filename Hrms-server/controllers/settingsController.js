import SystemSettings from '../models/SystemSettings.js';
import { logAction } from './auditController.js';
import { parseCheckoutTime, parseCheckInTime } from '../utils/attendanceUtils.js';
import { recalculateAttendanceFlagsForDate } from './attendanceController.js';

const normalizeOverridesToObject = (overrides) => {
  if (!overrides) return {};
  if (overrides instanceof Map) {
    return Object.fromEntries(overrides.entries());
  }
  if (typeof overrides === 'object') {
    return { ...overrides };
  }
  return {};
};

const settingsToJson = (settings) => ({
  timezone: settings.timezone,
  defaultCheckInTime: settings.defaultCheckInTime || '08:30',
  checkInTimeOverrides: normalizeOverridesToObject(settings.checkInTimeOverrides),
  defaultCheckoutTime: settings.defaultCheckoutTime || '17:30',
  checkoutTimeOverrides: normalizeOverridesToObject(settings.checkoutTimeOverrides),
  latePenaltyStartTime: settings.latePenaltyStartTime || '09:00'
});

export const getSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    res.json(settingsToJson(settings));
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const {
      timezone,
      defaultCheckInTime,
      setCheckInOverride,
      removeCheckInOverrideDate,
      defaultCheckoutTime,
      setCheckoutOverride,
      removeCheckoutOverrideDate,
      latePenaltyStartTime
    } = req.body;

    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({
        timezone: timezone || 'Asia/Kolkata',
        defaultCheckInTime: '08:30',
        defaultCheckoutTime: '17:30'
      });
    }

    const oldSettings = JSON.stringify(settingsToJson(settings));

    if (timezone) settings.timezone = timezone;

    if (defaultCheckInTime !== undefined) {
      parseCheckInTime(defaultCheckInTime);
      settings.defaultCheckInTime = defaultCheckInTime;
    }

    if (setCheckInOverride?.date && setCheckInOverride?.time) {
      parseCheckInTime(setCheckInOverride.time);
      if (!settings.checkInTimeOverrides) {
        settings.checkInTimeOverrides = new Map();
      }
      settings.checkInTimeOverrides.set(setCheckInOverride.date, setCheckInOverride.time);
      settings.markModified('checkInTimeOverrides');
    }

    if (removeCheckInOverrideDate) {
      if (settings.checkInTimeOverrides?.delete) {
        settings.checkInTimeOverrides.delete(removeCheckInOverrideDate);
        settings.markModified('checkInTimeOverrides');
      }
    }

    if (defaultCheckoutTime !== undefined) {
      parseCheckoutTime(defaultCheckoutTime);
      settings.defaultCheckoutTime = defaultCheckoutTime;
    }

    if (latePenaltyStartTime !== undefined) {
      parseCheckInTime(latePenaltyStartTime);
      settings.latePenaltyStartTime = latePenaltyStartTime;
    }

    let recalcDate = null;

    if (setCheckoutOverride?.date && setCheckoutOverride?.time) {
      parseCheckoutTime(setCheckoutOverride.time);
      if (!settings.checkoutTimeOverrides) {
        settings.checkoutTimeOverrides = new Map();
      }
      settings.checkoutTimeOverrides.set(setCheckoutOverride.date, setCheckoutOverride.time);
      settings.markModified('checkoutTimeOverrides');
      recalcDate = setCheckoutOverride.date;
    }

    if (removeCheckoutOverrideDate) {
      if (settings.checkoutTimeOverrides?.delete) {
        settings.checkoutTimeOverrides.delete(removeCheckoutOverrideDate);
        settings.markModified('checkoutTimeOverrides');
      }
      recalcDate = removeCheckoutOverrideDate;
    }

    await settings.save();

    const payload = settingsToJson(settings);

    if (recalcDate) {
      try {
        const { updated, total } = await recalculateAttendanceFlagsForDate(recalcDate);
        payload.recalculatedAttendance = { date: recalcDate, updated, total };
      } catch (recalcErr) {
        console.error('Recalculate attendance after settings change:', recalcErr);
      }
    }

    await logAction(
      req.user._id,
      req.user.name,
      'UPDATE_SETTINGS',
      'SYSTEM',
      'SETTINGS',
      'Updated System Settings',
      oldSettings,
      JSON.stringify(payload)
    );

    res.json(payload);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};
