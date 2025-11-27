import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import { calculateWorkedSeconds, getFlags } from '../utils/attendanceUtils.js';
import { logAction } from './auditController.js';

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('-password')
      .sort({ name: 1 });
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, username, email, role, department, password } = req.body;
    const currentUser = req.user;

    if (!name || !username || !email || !role || !department) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Role-based authorization
    // Only Admin can create Admin, HR, or Employee
    // Admin and HR can create Employee
    if (currentUser.role === 'HR') {
      if (role !== 'Employee') {
        return res.status(403).json({ 
          message: 'HR can only create Employee users. Only Admin can create Admin and HR users.' 
        });
      }
    } else if (currentUser.role !== 'Admin') {
      return res.status(403).json({ 
        message: 'Only Admin and HR can create users.' 
      });
    }

    // Check if username or email already exists
    const existing = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
    });

    if (existing) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    // Password is optional - if not provided, use temporary password
    // User will need to change password on first login
    const userPassword = password && password.trim() !== '' ? password : 'tempPassword123';
    const isFirstLogin = !password || password.trim() === '';

    const user = new User({
      name,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      role,
      department,
      password: userPassword,
      isFirstLogin: isFirstLogin,
      isActive: true
    });

    await user.save();
    
    const userObj = user.toObject();
    delete userObj.password;

    // Log action
    await logAction(
      currentUser._id,
      currentUser.name,
      'CREATE_USER',
      'USER',
      user._id.toString(),
      `Created user ${user.username} with role ${user.role}`,
      null,
      JSON.stringify(userObj)
    );

    res.status(201).json({ 
      message: 'User created successfully. Temporary password: tempPassword123',
      user: userObj 
    });
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};


export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const users = await User.find({ role, isActive: true })
      .select('-password')
      .sort({ name: 1 });
    res.json(users);
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // Only Admin can delete users
    if (currentUser.role !== 'Admin') {
      return res.status(403).json({ message: 'Only Admin can delete users' });
    }

    // Prevent self-deletion
    if (currentUser._id.toString() === id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userName = user.name;
    const userRole = user.role;

    // Soft delete - set isActive to false
    user.isActive = false;
    await user.save();

    await logAction(
      currentUser._id,
      currentUser.name,
      'DELETE_USER',
      'USER',
      id,
      `Deleted user ${userName} (${userRole})`
    );

    res.json({ message: `User ${userName} deleted successfully` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getEmployeeStats = async (req, res) => {
  try {
    const employees = await User.find({ role: 'Employee', isActive: true })
      .select('-password');

    const stats = await Promise.all(employees.map(async (employee) => {
      const records = await Attendance.find({ userId: employee._id });
      
      // Recalculate flags for records that have checkIn and checkOut but might be missing flags
      for (const record of records) {
        if (record.checkIn && record.checkOut && (record.lowTimeFlag === undefined || record.extraTimeFlag === undefined || record.lowTimeFlag === null || record.extraTimeFlag === null)) {
          const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());
          
          // Check for half-day leave
          const hasHalfDay = await LeaveRequest.findOne({
            userId: record.userId,
            startDate: record.date,
            category: 'Half Day',
            status: 'Approved'
          });

          const flags = getFlags(worked, !!hasHalfDay);
          record.lowTimeFlag = flags.lowTime;
          record.extraTimeFlag = flags.extraTime;
          record.totalWorkedSeconds = worked;
          await record.save();
        }
      }
      
      const presentDays = records.length;
      const totalWorkedSeconds = records.reduce((acc, r) => acc + r.totalWorkedSeconds, 0);
      
      const lowTimeCount = records.filter(r => r.lowTimeFlag).length;
      const extraTimeCount = records.filter(r => r.extraTimeFlag).length;

      const leaves = await LeaveRequest.find({
        userId: employee._id,
        status: 'Approved'
      });

      const leaveBreakdown = {
        sick: leaves.filter(l => l.category === 'Sick Leave').length,
        casual: leaves.filter(l => l.category === 'Casual Leave').length,
        paid: leaves.filter(l => l.category === 'Paid Leave').length,
        unpaid: leaves.filter(l => l.category === 'Unpaid Leave').length,
        half: leaves.filter(l => l.category === 'Half Day').length,
        total: leaves.length
      };

      return {
        user: {
          id: employee._id,
          name: employee.name,
          username: employee.username,
          email: employee.email,
          department: employee.department
        },
        presentDays,
        totalWorkedHours: (totalWorkedSeconds / 3600).toFixed(1),
        lowTimeCount,
        extraTimeCount,
        ...leaveBreakdown,
        records,
        allLeaves: await LeaveRequest.find({ userId: employee._id })
      };
    }));

    res.json(stats);
  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

