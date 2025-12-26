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

// Helper function to convert date to dd-mm-yyyy format
const formatDateToDDMMYYYY = (dateStr) => {
  if (!dateStr) return undefined;
  try {
    // If date is in yyyy-mm-dd format (from HTML date input), convert to dd-mm-yyyy
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-');
      return `${day}-${month}-${year}`;
    } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
      // Already in dd-mm-yyyy format
      return dateStr;
    } else {
      // Try to parse as Date and convert to dd-mm-yyyy
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      }
    }
  } catch (error) {
    // If conversion fails, use as is
    return dateStr;
  }
  return dateStr;
};

export const createUser = async (req, res) => {
  try {
    const { name, username, email, role, department, password, joiningDate, bonds, aadhaarNumber, guardianName, mobileNumber } = req.body;
    const currentUser = req.user;

    // Convert dates to dd-mm-yyyy format if provided
    const formattedJoiningDate = formatDateToDDMMYYYY(joiningDate);

    // Process bonds array
    let formattedBonds = [];
    if (bonds && Array.isArray(bonds) && bonds.length > 0) {
      formattedBonds = bonds.map((bond, index) => ({
        type: bond.type || 'Job',
        periodMonths: parseInt(bond.periodMonths) || 0,
        startDate: formatDateToDDMMYYYY(bond.startDate) || formattedJoiningDate,
        order: index + 1,
        salary: bond.salary ? parseFloat(bond.salary) : 0
      })).filter(bond => bond.periodMonths > 0);
    }

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
      isActive: true,
      joiningDate: formattedJoiningDate,
      bonds: formattedBonds,
      aadhaarNumber: aadhaarNumber || undefined,
      guardianName: guardianName || undefined,
      mobileNumber: mobileNumber || undefined
    });

    try {
      await user.save();
    } catch (saveError) {
      // If it's a duplicate key error (MongoDB unique index), drop indexes and retry
      if (saveError.code === 11000) {
        try {
          // Try to drop unique indexes
          const indexes = await User.collection.indexes();
          for (const index of indexes) {
            if (index.name === 'username_1' || index.name === 'email_1' ||
              (index.key && (index.key.username === 1 || index.key.email === 1))) {
              await User.collection.dropIndex(index.name).catch(() => { });
            }
          }
          // Retry saving after dropping indexes
          await user.save();
        } catch (retryError) {
          // If still fails, throw the original error
          throw saveError;
        }
      } else {
        throw saveError;
      }
    }

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

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { paidLeaveAllocation, joiningDate, bonds, name, email, department, aadhaarNumber, guardianName, mobileNumber } = req.body;
    const currentUser = req.user;

    // Only Admin and HR can update users
    if (currentUser.role !== 'Admin' && currentUser.role !== 'HR') {
      return res.status(403).json({ message: 'Only Admin and HR can update users' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const beforeData = JSON.stringify({
      name: user.name,
      email: user.email,
      department: user.department,
      paidLeaveAllocation: user.paidLeaveAllocation,
      joiningDate: user.joiningDate,
      bonds: user.bonds,
      aadhaarNumber: user.aadhaarNumber,
      guardianName: user.guardianName,
      mobileNumber: user.mobileNumber
    });

    // Update name if provided
    if (name !== undefined && name.trim() !== '') {
      user.name = name.trim();
    }

    // Update email if provided
    if (email !== undefined && email.trim() !== '') {
      user.email = email.trim().toLowerCase();
    }

    // Update department if provided
    if (department !== undefined && department.trim() !== '') {
      user.department = department.trim();
    }

    // Update aadhaar number if provided
    if (aadhaarNumber !== undefined) {
      user.aadhaarNumber = aadhaarNumber.trim() || undefined;
    }

    // Update guardian name if provided
    if (guardianName !== undefined) {
      user.guardianName = guardianName.trim() || undefined;
    }

    // Update mobile number if provided
    if (mobileNumber !== undefined) {
      user.mobileNumber = mobileNumber.trim() || undefined;
    }

    // Update paid leave allocation - ADD to existing allocation
    if (paidLeaveAllocation !== undefined) {
      const allocation = parseInt(paidLeaveAllocation);
      if (isNaN(allocation) || allocation < 0) {
        return res.status(400).json({ message: 'Paid leave allocation must be a positive number' });
      }
      // Add to existing allocation (default to 0 if null/undefined)
      const currentAllocation = user.paidLeaveAllocation || 0;
      user.paidLeaveAllocation = currentAllocation + allocation;
      // Update last allocation date
      user.paidLeaveLastAllocatedDate = new Date();
    }

    // Update joining date if provided
    if (joiningDate !== undefined) {
      user.joiningDate = formatDateToDDMMYYYY(joiningDate);
    }

    // Update bonds if provided
    if (bonds !== undefined && Array.isArray(bonds)) {
      user.bonds = bonds.map((bond, index) => ({
        type: bond.type || 'Job',
        periodMonths: parseInt(bond.periodMonths) || 0,
        startDate: formatDateToDDMMYYYY(bond.startDate) || user.joiningDate,
        order: index + 1,
        salary: bond.salary ? parseFloat(bond.salary) : 0
      })).filter(bond => bond.periodMonths > 0);
    }

    await user.save();
    const afterData = JSON.stringify({
      name: user.name,
      email: user.email,
      department: user.department,
      paidLeaveAllocation: user.paidLeaveAllocation,
      joiningDate: user.joiningDate,
      bonds: user.bonds,
      aadhaarNumber: user.aadhaarNumber,
      guardianName: user.guardianName,
      mobileNumber: user.mobileNumber
    });

    await logAction(
      currentUser._id,
      currentUser.name,
      'UPDATE_USER',
      'USER',
      id,
      `Updated user details for ${user.name}`,
      beforeData,
      afterData
    );

    const userObj = user.toObject();
    delete userObj.password;

    res.json({ message: 'User updated successfully', user: userObj });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset all employees' paid leave allocation to 0
export const resetAllPaidLeaveAllocation = async (req, res) => {
  try {
    const currentUser = req.user;

    // Only Admin can reset all allocations
    if (currentUser.role !== 'Admin') {
      return res.status(403).json({ message: 'Only Admin can reset all paid leave allocations' });
    }

    // Reset all employees' and HR's paidLeaveAllocation to 0
    const result = await User.updateMany(
      { role: { $in: ['Employee', 'HR'] }, isActive: true },
      { $set: { paidLeaveAllocation: 0 } }
    );

    await logAction(
      currentUser._id,
      currentUser.name,
      'RESET_ALL_PAID_LEAVE',
      'SYSTEM',
      'ALL',
      `Reset paid leave allocation to 0 for all employees (${result.modifiedCount} users)`
    );

    res.json({
      message: `Successfully reset paid leave allocation to 0 for ${result.modifiedCount} users`,
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Reset all paid leave allocation error:', error);
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
        paid: leaves.filter(l => l.category === 'Paid Leave').length,
        unpaid: leaves.filter(l => l.category === 'Unpaid Leave').length,
        half: leaves.filter(l => l.category === 'Half Day Leave').length,
        extraTime: leaves.filter(l => l.category === 'Extra Time Leave').length,
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

