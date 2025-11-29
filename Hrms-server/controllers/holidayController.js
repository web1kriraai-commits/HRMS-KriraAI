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
      description,
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByRole: req.user.role
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
    const holidays = await CompanyHoliday.find()
      .populate('createdBy', 'name role')
      .sort({ date: 1 });
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

// Automatically add Sundays as holidays
// If today is Saturday, add tomorrow (Sunday) and next Sunday
export const autoAddSundays = async () => {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

    // Only run if today is Saturday (day 6)
    if (dayOfWeek !== 6) {
      return { added: 0, message: 'Today is not Saturday, no Sundays to add' };
    }

    // Get tomorrow (Sunday)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get next Sunday (7 days after tomorrow)
    const nextSunday = new Date(tomorrow);
    nextSunday.setDate(nextSunday.getDate() + 7);

    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const tomorrowStr = formatDate(tomorrow);
    const nextSundayStr = formatDate(nextSunday);

    let addedCount = 0;
    const addedDates = [];

    // Add tomorrow (Sunday) if it doesn't exist
    const existingTomorrow = await CompanyHoliday.findOne({ date: tomorrowStr });
    if (!existingTomorrow) {
      const tomorrowHoliday = new CompanyHoliday({
        date: tomorrowStr,
        description: 'Sunday',
        createdByName: 'System',
        createdByRole: 'Admin'
      });
      await tomorrowHoliday.save();
      addedCount++;
      addedDates.push(tomorrowStr);
    }

    // Add next Sunday if it doesn't exist
    const existingNextSunday = await CompanyHoliday.findOne({ date: nextSundayStr });
    if (!existingNextSunday) {
      const nextSundayHoliday = new CompanyHoliday({
        date: nextSundayStr,
        description: 'Sunday',
        createdByName: 'System',
        createdByRole: 'Admin'
      });
      await nextSundayHoliday.save();
      addedCount++;
      addedDates.push(nextSundayStr);
    }

    return {
      added: addedCount,
      dates: addedDates,
      message: addedCount > 0 
        ? `Added ${addedCount} Sunday(s) as holiday: ${addedDates.join(', ')}`
        : 'Sundays already exist in database'
    };
  } catch (error) {
    console.error('Auto add Sundays error:', error);
    throw error;
  }
};



