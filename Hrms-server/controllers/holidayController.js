import CompanyHoliday from '../models/CompanyHoliday.js';
import User from '../models/User.js';
import { logAction } from './auditController.js';
import { sendNotification } from './notificationController.js';

export const addHoliday = async (req, res) => {
  try {
    const { date, description } = req.body;

    if (!date || !description) {
      return res.status(400).json({ message: 'Date and description are required' });
    }

    const holiday = new CompanyHoliday({
      date,
      description
    });

    await holiday.save();

    await logAction(
      req.user._id,
      req.user.name,
      'ADD_HOLIDAY',
      'SYSTEM',
      holiday._id.toString(),
      `Added holiday: ${description} on ${date}`,
      null,
      JSON.stringify(holiday.toObject())
    );

    // Notify all users
    const users = await User.find({ isActive: true });
    for (const user of users) {
      await sendNotification(user._id, `New company holiday added: ${description} (${date})`);
    }

    res.status(201).json(holiday);
  } catch (error) {
    console.error('Add holiday error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Holiday already exists for this date' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const getHolidays = async (req, res) => {
  try {
    const holidays = await CompanyHoliday.find().sort({ date: 1 });
    res.json(holidays);
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await CompanyHoliday.findByIdAndDelete(id);
    
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    await logAction(
      req.user._id,
      req.user.name,
      'DELETE_HOLIDAY',
      'SYSTEM',
      id,
      `Deleted holiday: ${holiday.description}`
    );

    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Delete holiday error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



