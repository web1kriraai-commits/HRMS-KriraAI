import SystemSettings from '../models/SystemSettings.js';
import { logAction } from './auditController.js';

export const getSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { timezone } = req.body;
    
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({ timezone: timezone || 'Asia/Kolkata' });
    } else {
      const oldSettings = JSON.stringify(settings.toObject());
      if (timezone) settings.timezone = timezone;
      await settings.save();
      const newSettings = JSON.stringify(settings.toObject());

      await logAction(
        req.user._id,
        req.user.name,
        'UPDATE_SETTINGS',
        'SYSTEM',
        'SETTINGS',
        'Updated System Settings',
        oldSettings,
        newSettings
      );
    }

    res.json(settings);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



