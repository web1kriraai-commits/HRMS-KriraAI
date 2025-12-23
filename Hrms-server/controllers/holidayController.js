import CompanyHoliday from '../models/CompanyHoliday.js';
import User from '../models/User.js';
import { logAction } from './auditController.js';
import { sendNotification } from './notificationController.js';

// Helper function to parse date in different formats and convert to YYYY-MM-DD
const parseDate = (dateStr) => {
  // Try to parse different date formats
  // Format 1: DD-MM-YYYY (e.g., 1-12-2025, 01-12-2025)
  // Format 2: YYYY-MM-DD (e.g., 2025-12-01)
  // Format 3: DD/MM/YYYY
  
  let date;
  let day, month, year;
  
  // Check if it's DD-MM-YYYY or DD/MM/YYYY format (day and month are 1-2 digits)
  if (dateStr.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) {
    const parts = dateStr.split(/[-/]/);
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
    date = new Date(year, month - 1, day);
  } 
  // Check if it's YYYY-MM-DD format (year is 4 digits first)
  else if (dateStr.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) {
    const parts = dateStr.split(/[-/]/);
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
    date = new Date(year, month - 1, day);
  } 
  else {
    // Try parsing as ISO format or other standard formats
    date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      year = date.getFullYear();
      month = date.getMonth() + 1;
      day = date.getDate();
    }
  }
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  // Ensure we have the values
  if (year === undefined || month === undefined || day === undefined) {
    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
  }
  
  // Convert to YYYY-MM-DD format
  const yearStr = String(year);
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  
  return { 
    dateObj: date, 
    dateStr: `${yearStr}-${monthStr}-${dayStr}`, 
    day: dayStr, 
    month: monthStr, 
    year: yearStr 
  };
};

// Helper function to get all Sundays in a month
const getAllSundaysInMonth = (year, month) => {
  const sundays = [];
  // month is 1-based (1 = January, 12 = December)
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  // Find first Sunday of the month
  let currentDate = new Date(firstDay);
  const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  
  if (daysUntilSunday === 0) {
    // First day is Sunday
    sundays.push(new Date(currentDate));
  } else {
    // Move to first Sunday
    currentDate.setDate(currentDate.getDate() + daysUntilSunday);
  }
  
  // Add all Sundays in the month
  while (currentDate <= lastDay) {
    sundays.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 7); // Move to next Sunday
  }
  
  return sundays.map(date => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
};

export const addHoliday = async (req, res) => {
  try {
    const { date, description } = req.body;

    if (!date || !description) {
      return res.status(400).json({ message: 'Date and description are required' });
    }

    // Parse the date
    const { dateObj, dateStr, day, month, year } = parseDate(date);
    
    // Convert to numbers for comparison
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    let holidaysAdded = [];
    let addedCount = 0;
    
    // Check if the date is the 1st of a month
    if (dayNum === 1) {
      console.log(`Detected 1st of month: ${yearNum}-${monthNum}, finding all Sundays...`);
      // Get all Sundays in this month (monthNum is already 1-based from parseDate)
      const sundays = getAllSundaysInMonth(yearNum, monthNum);
      console.log(`Found ${sundays.length} Sundays in ${monthNum}/${yearNum}:`, sundays);
      
      // Add all Sundays as holidays
      for (const sundayDate of sundays) {
        try {
          // Check if holiday already exists
          const existing = await CompanyHoliday.findOne({ date: sundayDate });
          if (!existing) {
            const sundayHoliday = new CompanyHoliday({
              date: sundayDate,
              description: 'Sunday',
              createdBy: req.user._id,
              createdByName: req.user.name,
              createdByRole: req.user.role
            });
            await sundayHoliday.save();
            holidaysAdded.push(sundayDate);
            addedCount++;
          }
        } catch (error) {
          // If duplicate key error, skip
          if (error.code !== 11000) {
            console.error(`Error adding Sunday ${sundayDate}:`, error);
          }
        }
      }
      
      // Also add the original date if it's not a Sunday
      const isSunday = dateObj.getDay() === 0;
      if (!isSunday) {
        try {
          const existing = await CompanyHoliday.findOne({ date: dateStr });
          if (!existing) {
            const holiday = new CompanyHoliday({
              date: dateStr,
              description,
              createdBy: req.user._id,
              createdByName: req.user.name,
              createdByRole: req.user.role
            });
            await holiday.save();
            holidaysAdded.push(dateStr);
            addedCount++;
          }
        } catch (error) {
          if (error.code !== 11000) {
            throw error;
          }
        }
      }
      
      // Log action for adding Sundays
      if (addedCount > 0) {
        await logAction(
          req.user._id,
          req.user.name,
          'ADD_HOLIDAY',
          'SYSTEM',
          'MULTIPLE',
          `Added ${addedCount} holiday(s) for month ${monthNum}/${yearNum}: ${holidaysAdded.join(', ')}`,
          null,
          JSON.stringify({ dates: holidaysAdded, description: dayNum === 1 && isSunday ? 'Sunday' : description })
        );
        
        // Notify all users
        const users = await User.find({ isActive: true });
        for (const user of users) {
          await sendNotification(user._id, `Added ${addedCount} holiday(s) for ${monthNum}/${yearNum}: ${holidaysAdded.length} Sunday(s) added`);
        }
      }
      
      return res.status(201).json({
        message: `Added ${addedCount} holiday(s) for month ${monthNum}/${yearNum}`,
        holidays: holidaysAdded,
        count: addedCount
      });
    } else {
      // Normal holiday addition (not 1st of month)
      const holiday = new CompanyHoliday({
        date: dateStr,
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
        `Added holiday: ${description} on ${dateStr}`,
        null,
        JSON.stringify(holiday.toObject())
      );

      // Notify all users
      const users = await User.find({ isActive: true });
      for (const user of users) {
        await sendNotification(user._id, `New company holiday added: ${description} (${dateStr})`);
      }

      return res.status(201).json(holiday);
    }
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

// Automatically add all Sundays for the current month if today is the 1st
// If force is true, it will add Sundays for the current month regardless of the date
// userInfo is optional - if provided, will log the action with user info
export const autoAddSundaysForMonth = async (force = false, userInfo = null) => {
  try {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const month = today.getMonth() + 1; // 1-based month
    const year = today.getFullYear();
    
    // Only run if today is the 1st of the month, unless force is true
    if (!force && dayOfMonth !== 1) {
      return { added: 0, message: 'Today is not the 1st of the month, no Sundays to add. Use force mode to add anyway.' };
    }
    
    if (force) {
      console.log(`Force mode: Adding Sundays for ${month}/${year}...`);
    } else {
      console.log(`Today is 1st of ${month}/${year}, checking for Sundays...`);
    }
    
    // Get all Sundays in this month
    const sundays = getAllSundaysInMonth(year, month);
    console.log(`Found ${sundays.length} Sundays in ${month}/${year}:`, sundays);
    
    let addedCount = 0;
    const addedDates = [];
    
    // Add all Sundays as holidays if they don't exist
    for (const sundayDate of sundays) {
      try {
        const existing = await CompanyHoliday.findOne({ date: sundayDate });
        if (!existing) {
          const sundayHoliday = new CompanyHoliday({
            date: sundayDate,
            description: 'Sunday',
            createdByName: 'System',
            createdByRole: 'Admin'
          });
          await sundayHoliday.save();
          addedCount++;
          addedDates.push(sundayDate);
        }
      } catch (error) {
        // If duplicate key error, skip
        if (error.code !== 11000) {
          console.error(`Error adding Sunday ${sundayDate}:`, error);
        }
      }
    }
    
    // Notify all users if Sundays were added
    if (addedCount > 0) {
      const users = await User.find({ isActive: true });
      const notificationMessage = force && userInfo 
        ? `Manually added ${addedCount} Sunday(s) as holiday for ${month}/${year} by ${userInfo.name}`
        : `Automatically added ${addedCount} Sunday(s) as holiday for ${month}/${year}`;
      
      for (const user of users) {
        await sendNotification(user._id, notificationMessage);
      }
      
      await logAction(
        userInfo ? userInfo._id : null,
        userInfo ? userInfo.name : 'System',
        force ? 'MANUAL_ADD_SUNDAYS' : 'AUTO_ADD_SUNDAYS',
        'SYSTEM',
        'MONTHLY',
        force 
          ? `Manually added ${addedCount} Sunday(s) for ${month}/${year}: ${addedDates.join(', ')}`
          : `Automatically added ${addedCount} Sunday(s) for ${month}/${year}: ${addedDates.join(', ')}`,
        null,
        JSON.stringify({ dates: addedDates, month, year, force })
      );
    }
    
    return {
      added: addedCount,
      dates: addedDates,
      message: addedCount > 0 
        ? `Added ${addedCount} Sunday(s) as holiday for ${month}/${year}: ${addedDates.join(', ')}`
        : `All Sundays for ${month}/${year} already exist in database`
    };
  } catch (error) {
    console.error('Auto add Sundays for month error:', error);
    throw error;
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



