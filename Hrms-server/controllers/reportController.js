import Attendance from '../models/Attendance.js';
import User from '../models/User.js';

export const exportAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;

    let query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    let attendance = await Attendance.find(query)
      .populate('userId', 'name username email department')
      .sort({ date: -1 });

    // Filter by department if provided
    if (department) {
      attendance = attendance.filter(a => a.userId?.department === department);
    }

    // Format data for CSV
    const csvData = attendance.map(a => ({
      Date: a.date,
      EmployeeID: a.userId?._id || '',
      Name: a.userId?.name || 'Unknown',
      Department: a.userId?.department || '',
      Location: a.location || '',
      CheckIn: a.checkIn ? a.checkIn.toISOString() : '',
      CheckOut: a.checkOut ? a.checkOut.toISOString() : '',
      BreakCount: a.breaks.length,
      WorkedSeconds: a.totalWorkedSeconds,
      LowTime: a.lowTimeFlag ? 'Yes' : 'No',
      ExtraTime: a.extraTimeFlag ? 'Yes' : 'No',
      Notes: a.notes || ''
    }));

    res.json(csvData);
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



