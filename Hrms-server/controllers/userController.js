import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import CompanyHoliday from '../models/CompanyHoliday.js';
import { calculateWorkedSeconds, getFlags, resolveLatePenaltyStartTime, buildEmployeeSchedule } from '../utils/attendanceUtils.js';
import SystemSettings from '../models/SystemSettings.js';
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
    const { name, username, email, role, department, password, joiningDate, bonds, aadhaarNumber, guardianName, mobileNumber, guardianMobileNumber, bankName, bankAccountHolderName, bankAccountNumber, bankIfscCode, salaryBreakdown, paidLeaveAccess } = req.body;
    const currentUser = req.user;

    // Convert dates to dd-mm-yyyy format if provided
    const formattedJoiningDate = formatDateToDDMMYYYY(joiningDate);

    // Process bonds array - calculate end dates
    let formattedBonds = [];
    if (bonds && Array.isArray(bonds) && bonds.length > 0) {
      formattedBonds = bonds.map((bond, index) => {
        const periodMonths = parseInt(bond.periodMonths) || 0;
        if (periodMonths === 0) return null;

        // Calculate bond dates using same logic as salary breakdown
        const parseDDMMYYYY = (dateStr) => {
          if (!dateStr) return null;
          const [day, month, year] = dateStr.split('-').map(Number);
          return new Date(year, month - 1, day);
        };

        const getMonthEndDate = (year, month) => {
          return new Date(year, month, 0);
        };

        let bondStartDate = bond.startDate || formattedJoiningDate;
        if (index > 0 && formattedBonds[index - 1]) {
          // Start from previous bond's end date + 1 day
          const prevEndDate = parseDDMMYYYY(formattedBonds[index - 1].endDate);
          if (prevEndDate) {
            prevEndDate.setDate(prevEndDate.getDate() + 1);
            bondStartDate = formatDateToDDMMYYYY(prevEndDate.toISOString().split('T')[0]);
          }
        }

        // Calculate end date: last day of the month after adding periodMonths
        const startDateObj = parseDDMMYYYY(bondStartDate);
        if (!startDateObj) return null;

        // Get the month and year for the end of the bond period
        const startMonth = startDateObj.getMonth();
        const startYear = startDateObj.getFullYear();

        // Calculate end month and year (subtract 1 because we want the last day of the month before the next period starts)
        const totalMonths = startMonth + periodMonths - 1;
        const endMonth = totalMonths % 12;
        const endYear = startYear + Math.floor(totalMonths / 12);

        // Get last day of the end month
        const endDateObj = getMonthEndDate(endYear, endMonth + 1);
        const bondEndDate = formatDateToDDMMYYYY(endDateObj.toISOString().split('T')[0]);

        return {
          type: bond.type || 'Job',
          periodMonths: periodMonths,
          startDate: bondStartDate,
          endDate: bondEndDate,
          order: index + 1
        };
      }).filter(bond => bond !== null);
    }

    // Process salary breakdown array
    let formattedSalaryBreakdown = [];
    if (salaryBreakdown && Array.isArray(salaryBreakdown) && salaryBreakdown.length > 0) {
      formattedSalaryBreakdown = salaryBreakdown.map(item => ({
        month: parseInt(item.month),
        year: parseInt(item.year),
        amount: parseFloat(item.amount) || 0,
        bondType: item.bondType,
        startDate: formatDateToDDMMYYYY(item.startDate),
        endDate: formatDateToDDMMYYYY(item.endDate),
        isPartialMonth: item.isPartialMonth || false
      }));
    }

    if (!name || !username || !email || !role || !department) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!mobileNumber || !String(mobileNumber).trim()) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }
    if (!aadhaarNumber || !String(aadhaarNumber).trim()) {
      return res.status(400).json({ message: 'Aadhaar number is required' });
    }
    const normalizedAadhaarNumber = String(aadhaarNumber).replace(/\D/g, '');
    if (!/^\d{12}$/.test(normalizedAadhaarNumber)) {
      return res.status(400).json({ message: 'Aadhaar number must be exactly 12 digits' });
    }
    if (!bankName || !String(bankName).trim()) {
      return res.status(400).json({ message: 'Bank name is required' });
    }
    if (!bankAccountHolderName || !String(bankAccountHolderName).trim()) {
      return res.status(400).json({ message: 'Employee full name (as per checkbook) is required' });
    }
    const normalizedAccountNumber = String(bankAccountNumber || '').replace(/\D/g, '');
    if (!/^\d{9,18}$/.test(normalizedAccountNumber)) {
      return res.status(400).json({ message: 'Account number must be 9 to 18 digits' });
    }
    const normalizedIfscCode = String(bankIfscCode || '').trim().toUpperCase();
    if (normalizedIfscCode.length !== 11) {
      return res.status(400).json({ message: 'IFSC code must be exactly 11 characters' });
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
      salaryBreakdown: formattedSalaryBreakdown,
      aadhaarNumber: normalizedAadhaarNumber,
      guardianName: guardianName || undefined,
      mobileNumber: String(mobileNumber).trim(),
      guardianMobileNumber: guardianMobileNumber || undefined,
      bankName: String(bankName).trim(),
      bankAccountHolderName: String(bankAccountHolderName).trim(),
      bankAccountNumber: normalizedAccountNumber,
      bankIfscCode: normalizedIfscCode,
      paidLeaveAllocation: 0,
    });

    if (currentUser.role === 'Admin' && paidLeaveAccess !== undefined) {
      user.paidLeaveAccess = Boolean(paidLeaveAccess);
    }

    try {
      await user.save();
      console.log('User created successfully');
      console.log('Saved salaryBreakdown count:', user.salaryBreakdown?.length || 0);
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

const isValidHHmm = (value) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());

const normalizeOverrideMap = (overrides) => {
  if (!overrides) return {};
  if (overrides instanceof Map) return Object.fromEntries(overrides.entries());
  if (typeof overrides === 'object') return { ...overrides };
  return {};
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, email, department, paidLeaveAllocation, paidLeaveAction, 
      manualPaidLeaveAdjustment, manualExtraTimeAdjustment, 
      manualUnpaidLeaveAdjustment, manualHalfDayLeaveAdjustment, 
      joiningDate, bonds, aadhaarNumber, guardianName, 
      mobileNumber, guardianMobileNumber, bankName, bankAccountHolderName,
      bankAccountNumber, bankIfscCode, salaryBreakdown, password,
      lastForwardedMonth, forwardedMonths, forwardedInMonths,
      paidLeaveAccess,
      defaultCheckInTime,
      defaultCheckoutTime,
      setCheckInOverride,
      removeCheckInOverrideDate,
      setCheckoutOverride,
      removeCheckoutOverrideDate,
      clearCheckInSchedule,
      clearCheckoutSchedule
    } = req.body;
    const currentUser = req.user;

    console.log(`Update user ${id} request:`, { paidLeaveAllocation, paidLeaveAction, bodyAction: req.body.paidLeaveAction });

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

    // Update password if provided (will be hashed by pre-save hook)
    if (password !== undefined && password.trim() !== '') {
      if (password.length < 4) {
        return res.status(400).json({ message: 'Password must be at least 4 characters' });
      }
      user.password = password;
      user.isFirstLogin = false; // Reset first login flag if admin manually sets password
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
      const trimmedAadhaar = String(aadhaarNumber).trim();
      if (trimmedAadhaar) {
        const normalizedAadhaar = trimmedAadhaar.replace(/\D/g, '');
        if (!/^\d{12}$/.test(normalizedAadhaar)) {
          return res.status(400).json({ message: 'Aadhaar number must be exactly 12 digits' });
        }
        user.aadhaarNumber = normalizedAadhaar;
      } else {
        user.aadhaarNumber = undefined;
      }
    }

    // Update guardian name if provided
    if (guardianName !== undefined) {
      user.guardianName = guardianName.trim() || undefined;
    }

    // Update mobile number if provided
    if (mobileNumber !== undefined) {
      user.mobileNumber = mobileNumber.trim() || undefined;
    }

    // Update guardian mobile number if provided
    if (guardianMobileNumber !== undefined) {
      user.guardianMobileNumber = guardianMobileNumber.trim() || undefined;
    }

    // Update bank details if provided
    if (bankName !== undefined) {
      user.bankName = String(bankName).trim() || undefined;
    }
    if (bankAccountHolderName !== undefined) {
      user.bankAccountHolderName = String(bankAccountHolderName).trim() || undefined;
    }
    if (bankAccountNumber !== undefined) {
      const trimmedAccountNumber = String(bankAccountNumber).trim();
      if (trimmedAccountNumber) {
        const normalizedAccountNumber = trimmedAccountNumber.replace(/\D/g, '');
        if (!/^\d{9,18}$/.test(normalizedAccountNumber)) {
          return res.status(400).json({ message: 'Account number must be 9 to 18 digits' });
        }
        user.bankAccountNumber = normalizedAccountNumber;
      } else {
        user.bankAccountNumber = undefined;
      }
    }
    if (bankIfscCode !== undefined) {
      const trimmedIfscCode = String(bankIfscCode).trim();
      if (trimmedIfscCode) {
        const normalizedIfscCode = trimmedIfscCode.toUpperCase();
        if (normalizedIfscCode.length !== 11) {
          return res.status(400).json({ message: 'IFSC code must be exactly 11 characters' });
        }
        user.bankIfscCode = normalizedIfscCode;
      } else {
        user.bankIfscCode = undefined;
      }
    }

    if (paidLeaveAccess !== undefined) {
      if (currentUser.role !== 'Admin') {
        return res.status(403).json({ message: 'Only Admin can change paid leave access' });
      }
      user.paidLeaveAccess = Boolean(paidLeaveAccess);
    }

    // Update paid leave allocation
    // If paidLeaveAction is 'set', we overwrite the value (for Edit User)
    // If paidLeaveAction is 'add' (or undefined), we add to existing (for Granting Leave)
    if (paidLeaveAllocation !== undefined) {
      const allocation = parseInt(paidLeaveAllocation);
      if (isNaN(allocation) || allocation < 0) {
        return res.status(400).json({ message: 'Paid leave allocation must be a positive number' });
      }

      console.log(`Processing paid leave update: allocation=${allocation}, action=${paidLeaveAction}`);

      // Check for 'add' action explicitly (case insensitive)
      const isAddAction = paidLeaveAction && String(paidLeaveAction).trim().toLowerCase() === 'add';

      if (isAddAction) {
        // Add to existing
        const currentAllocation = user.paidLeaveAllocation || 0;
        user.paidLeaveAllocation = currentAllocation + allocation;
      } else {
        // Default to SET (Overwrite) - This fixes the bug where values were summing up unwantedly
        // if the action flag was missing or undefined.
        user.paidLeaveAllocation = allocation;
      }

      // Update last allocation date
      user.paidLeaveLastAllocatedDate = new Date();
    }
    
    // Update manual leave adjustments
    if (manualPaidLeaveAdjustment !== undefined) {
      user.manualPaidLeaveAdjustment = parseFloat(manualPaidLeaveAdjustment) || 0;
    }
    if (manualExtraTimeAdjustment !== undefined) {
      user.manualExtraTimeAdjustment = parseFloat(manualExtraTimeAdjustment) || 0;
    }
    if (manualUnpaidLeaveAdjustment !== undefined) {
      user.manualUnpaidLeaveAdjustment = parseFloat(manualUnpaidLeaveAdjustment) || 0;
    }
    if (manualHalfDayLeaveAdjustment !== undefined) {
      user.manualHalfDayLeaveAdjustment = parseFloat(manualHalfDayLeaveAdjustment) || 0;
    }

    // Update joining date if provided
    if (joiningDate !== undefined) {
      user.joiningDate = formatDateToDDMMYYYY(joiningDate);
    }

    // Update bonds if provided
    if (bonds !== undefined && Array.isArray(bonds)) {
      user.bonds = bonds.map((bond, index) => {
        const periodMonths = parseInt(bond.periodMonths) || 0;
        if (periodMonths === 0) return null;

        const parseDDMMYYYY = (dateStr) => {
          if (!dateStr) return null;
          const [day, month, year] = dateStr.split('-').map(Number);
          return new Date(year, month - 1, day);
        };

        const getMonthEndDate = (year, month) => {
          return new Date(year, month, 0);
        };

        let bondStartDate = formatDateToDDMMYYYY(bond.startDate) || user.joiningDate;
        if (index > 0 && user.bonds[index - 1]) {
          // Start from previous bond's end date + 1 day
          const prevEndDate = parseDDMMYYYY(user.bonds[index - 1].endDate);
          if (prevEndDate) {
            prevEndDate.setDate(prevEndDate.getDate() + 1);
            bondStartDate = formatDateToDDMMYYYY(prevEndDate.toISOString().split('T')[0]);
          }
        }

        // Calculate end date: last day of the month after adding periodMonths
        const startDateObj = parseDDMMYYYY(bondStartDate);
        if (!startDateObj) return null;

        // Get the month and year for the end of the bond period
        const startMonth = startDateObj.getMonth();
        const startYear = startDateObj.getFullYear();

        // Calculate end month and year (subtract 1 because we want the last day of the month before the next period starts)
        const totalMonths = startMonth + periodMonths - 1;
        const endMonth = totalMonths % 12;
        const endYear = startYear + Math.floor(totalMonths / 12);

        // Get last day of the end month
        const endDateObj = getMonthEndDate(endYear, endMonth + 1);
        const bondEndDate = formatDateToDDMMYYYY(endDateObj.toISOString().split('T')[0]);

        return {
          type: bond.type || 'Job',
          periodMonths: periodMonths,
          startDate: bondStartDate,
          endDate: bondEndDate,
          order: index + 1
        };
      }).filter(bond => bond !== null);
    }

    // Update salary breakdown if provided
    if (salaryBreakdown !== undefined && Array.isArray(salaryBreakdown)) {
      user.salaryBreakdown = salaryBreakdown.map(item => {
        // Find existing entry to preserve payment status
        const existingEntry = user.salaryBreakdown.find(
          entry => entry.month === parseInt(item.month) && entry.year === parseInt(item.year)
        );

        return {
          month: parseInt(item.month),
          year: parseInt(item.year),
          amount: parseFloat(item.amount) || 0,
          bondType: item.bondType,
          startDate: formatDateToDDMMYYYY(item.startDate),
          endDate: formatDateToDDMMYYYY(item.endDate),
          isPartialMonth: item.isPartialMonth || false,
          // Preserve payment status from existing entry if available
          isPaid: existingEntry ? existingEntry.isPaid : false,
          paidAt: existingEntry ? existingEntry.paidAt : undefined,
          paidBy: existingEntry ? existingEntry.paidBy : undefined
        };
      });
    }
    
    // Update forwarding data if provided
    if (lastForwardedMonth !== undefined) {
      user.lastForwardedMonth = lastForwardedMonth;
    }
    if (forwardedMonths !== undefined) {
      user.forwardedMonths = forwardedMonths;
    }
    if (forwardedInMonths !== undefined) {
      user.forwardedInMonths = forwardedInMonths;
    }

    // Per-employee check-in / checkout schedule (Admin / HR)
    if (clearCheckInSchedule) {
      user.defaultCheckInTime = null;
      user.checkInTimeOverrides = new Map();
      user.markModified('checkInTimeOverrides');
    } else {
      if (defaultCheckInTime !== undefined) {
        if (defaultCheckInTime === null || defaultCheckInTime === '') {
          user.defaultCheckInTime = null;
        } else if (!isValidHHmm(defaultCheckInTime)) {
          return res.status(400).json({ message: 'defaultCheckInTime must be HH:mm' });
        } else {
          user.defaultCheckInTime = String(defaultCheckInTime).trim();
        }
      }
      if (setCheckInOverride?.date && setCheckInOverride?.time) {
        if (!isValidHHmm(setCheckInOverride.time)) {
          return res.status(400).json({ message: 'Check-in override time must be HH:mm' });
        }
        if (!user.checkInTimeOverrides) user.checkInTimeOverrides = new Map();
        user.checkInTimeOverrides.set(setCheckInOverride.date, String(setCheckInOverride.time).trim());
        user.markModified('checkInTimeOverrides');
      }
      if (removeCheckInOverrideDate) {
        if (user.checkInTimeOverrides?.delete) {
          user.checkInTimeOverrides.delete(removeCheckInOverrideDate);
          user.markModified('checkInTimeOverrides');
        }
      }
    }

    if (clearCheckoutSchedule) {
      user.defaultCheckoutTime = null;
      user.checkoutTimeOverrides = new Map();
      user.markModified('checkoutTimeOverrides');
    } else {
      if (defaultCheckoutTime !== undefined) {
        if (defaultCheckoutTime === null || defaultCheckoutTime === '') {
          user.defaultCheckoutTime = null;
        } else if (!isValidHHmm(defaultCheckoutTime)) {
          return res.status(400).json({ message: 'defaultCheckoutTime must be HH:mm' });
        } else {
          user.defaultCheckoutTime = String(defaultCheckoutTime).trim();
        }
      }
      if (setCheckoutOverride?.date && setCheckoutOverride?.time) {
        if (!isValidHHmm(setCheckoutOverride.time)) {
          return res.status(400).json({ message: 'Checkout override time must be HH:mm' });
        }
        if (!user.checkoutTimeOverrides) user.checkoutTimeOverrides = new Map();
        user.checkoutTimeOverrides.set(setCheckoutOverride.date, String(setCheckoutOverride.time).trim());
        user.markModified('checkoutTimeOverrides');
      }
      if (removeCheckoutOverrideDate) {
        if (user.checkoutTimeOverrides?.delete) {
          user.checkoutTimeOverrides.delete(removeCheckoutOverrideDate);
          user.markModified('checkoutTimeOverrides');
        }
      }
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
      mobileNumber: user.mobileNumber,
      guardianMobileNumber: user.guardianMobileNumber,
      defaultCheckInTime: user.defaultCheckInTime || null,
      defaultCheckoutTime: user.defaultCheckoutTime || null,
      checkInTimeOverrides: normalizeOverrideMap(user.checkInTimeOverrides),
      checkoutTimeOverrides: normalizeOverrideMap(user.checkoutTimeOverrides)
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
    userObj.defaultCheckInTime = userObj.defaultCheckInTime || null;
    userObj.defaultCheckoutTime = userObj.defaultCheckoutTime || null;
    userObj.checkInTimeOverrides = normalizeOverrideMap(userObj.checkInTimeOverrides);
    userObj.checkoutTimeOverrides = normalizeOverrideMap(userObj.checkoutTimeOverrides);

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

    // Fetch all holidays once
    const holidays = await CompanyHoliday.find({}).lean();
    const holidayDates = new Set(holidays.map(h => h.date));
    const systemSettings = await SystemSettings.getSettings();

    const stats = await Promise.all(employees.map(async (employee) => {
      const records = await Attendance.find({ userId: employee._id });
      const leaves = await LeaveRequest.find({ userId: employee._id, status: 'Approved' });

      // Recalculate flags for records that have checkIn and checkOut
      for (const record of records) {
        if (record.checkIn && record.checkOut) {
          const worked = calculateWorkedSeconds(record, record.checkOut.toISOString());
          const isHoliday = holidayDates.has(record.date);

          // Check for half-day leave
          const hasHalfDay = leaves.find(l => l.startDate === record.date && l.category === 'Half Day Leave');

          // Check for Extra Time Leave
          let extraTimeLeaveMinutes = 0;
          const extraTimeLeave = leaves.find(l => l.startDate === record.date && l.category === 'Extra Time Leave');

          if (extraTimeLeave && extraTimeLeave.startTime && extraTimeLeave.endTime) {
            const [startH, startM] = extraTimeLeave.startTime.split(':').map(Number);
            const [endH, endM] = extraTimeLeave.endTime.split(':').map(Number);
            extraTimeLeaveMinutes = Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
          }

          const approvedOT = (record.overtimeRequest && record.overtimeRequest.status === 'Approved') ? record.overtimeRequest.durationMinutes : 0;
          const employeeSchedule = buildEmployeeSchedule(employee);
          const flags = getFlags(worked, !!hasHalfDay, extraTimeLeaveMinutes, isHoliday, record.checkIn, record.isPenaltyDisabled, approvedOT, record.date, false, resolveLatePenaltyStartTime(systemSettings, record.date, employeeSchedule), systemSettings?.timezone || 'Asia/Kolkata');
          record.lowTimeFlag = flags.lowTime;
          record.extraTimeFlag = flags.extraTime;
          record.totalWorkedSeconds = worked;
          // Note: totalWorkedSeconds in the DB usually has penalty subtracted. 
          // attendanceUtils.getFlags returns penaltySeconds.
          if (!isHoliday && flags.penaltySeconds > 0) {
            record.totalWorkedSeconds = Math.max(0, worked - flags.penaltySeconds);
            record.penaltySeconds = flags.penaltySeconds;
          }
          await record.save();
        }
      }

      const presentDays = records.length;
      let totalWorkedSeconds = records.reduce((acc, r) => acc + (r.totalWorkedSeconds || 0), 0);

      // --- ABENTEEISM LOGIC ---
      // Determine working period (from joining date to today, or last 30 days)
      // To keep it simple and consistent with frontend, we look at the range of existing records
      // OR use the last 30 days. Let's use the current month for stats.
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const todayStr = now.toISOString().split('T')[0];
      
      let absentDaysCount = 0;
      let absentDeficitSeconds = 0;
      const absentDates = [];

      // Create a Set of occupied dates (attendance or leave)
      const occupiedDates = new Set();
      records.forEach(r => occupiedDates.add(r.date));
      leaves.forEach(l => {
        // Simple range expansion for leaves
        let curr = new Date(l.startDate);
        const end = new Date(l.endDate);
        while (curr <= end) {
          occupiedDates.add(curr.toISOString().split('T')[0]);
          curr.setDate(curr.getDate() + 1);
        }
      });

      // Iterate through current month until today
      let iter = new Date(startOfMonth);
      const endIter = new Date();
      const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-01';
      while (iter <= endIter) {
        const dateStr = iter.toISOString().split('T')[0];
        const dayOfWeek = iter.getDay(); // 0 = Sunday

        // Working day: Not Sunday and Not Holiday
        if (dayOfWeek !== 0 && !holidayDates.has(dateStr)) {
          if (!occupiedDates.has(dateStr)) {
            // Apply rule ONLY on or after effective date
            if (dateStr >= ABSENCE_PENALTY_EFFECTIVE_DATE) {
              absentDaysCount++;
              absentDeficitSeconds += (8.25 * 3600); // 8h 15m penalty
              absentDates.push(dateStr);
            }
          }
        }
        iter.setDate(iter.getDate() + 1);
      }

      const lowTimeCount = records.filter(r => r.lowTimeFlag).length;
      const extraTimeCount = records.filter(r => r.extraTimeFlag).length;

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
        absentDaysCount,
        absentDeficitSeconds,
        absentDates,
        totalWorkedHours: ((totalWorkedSeconds - absentDeficitSeconds) / 3600).toFixed(1),
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

const SALARY_SLIP_NUMERIC_FIELDS = [
  'stdDays', 'workedDays', 'leaveBalance',
  'basic', 'da', 'totalWage', 'hra', 'medicalReimbursement', 'conveyance',
  'lta', 'education', 'specialAllowance',
  'pf', 'esic', 'pTax', 'lwf', 'tds', 'advance', 'exGratia', 'lessAdvance'
];

const SALARY_SLIP_TEXT_FIELDS = [
  'companyName', 'companyAddress', 'preparedByName', 'preparedByTitle',
  'empName', 'empNo', 'department', 'doj', 'bank', 'bankAccountNo',
  'designation', 'pfNo', 'esicNo'
];

const buildSalarySlipPayload = (body, currentUser) => {
  const month = parseInt(body.month, 10);
  const year = parseInt(body.year, 10);
  const slip = {
    month,
    year,
    savedAt: new Date(),
    savedBy: currentUser.name
  };

  for (const field of SALARY_SLIP_TEXT_FIELDS) {
    slip[field] = body[field] != null ? String(body[field]) : '';
  }
  for (const field of SALARY_SLIP_NUMERIC_FIELDS) {
    const value = Number(body[field]);
    slip[field] = Number.isFinite(value) ? value : 0;
  }

  return slip;
};

/** Admin/HR: upsert a detailed salary slip for an employee (month/year) */
export const saveSalarySlip = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;
    const month = parseInt(req.body.month, 10);
    const year = parseInt(req.body.year, 10);

    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({ message: 'Valid month (1-12) and year are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.salarySlips) {
      user.salarySlips = [];
    }

    const slipPayload = buildSalarySlipPayload(req.body, currentUser);
    const existingIndex = user.salarySlips.findIndex(
      (item) => item.month === month && item.year === year
    );

    if (existingIndex >= 0) {
      const existing = user.salarySlips[existingIndex];
      Object.keys(slipPayload).forEach((key) => {
        existing[key] = slipPayload[key];
      });
    } else {
      user.salarySlips.push(slipPayload);
    }

    user.markModified('salarySlips');
    await user.save();

    const savedSlip = user.salarySlips.find(
      (item) => item.month === month && item.year === year
    );

    await logAction(
      currentUser._id,
      currentUser.name,
      'SAVE_SALARY_SLIP',
      'USER',
      userId,
      `Saved salary slip for ${user.name} - ${month}/${year}`
    );

    res.json({
      message: 'Salary slip saved successfully',
      salarySlip: savedSlip
    });
  } catch (error) {
    console.error('Save salary slip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/** Authenticated user: get own salary slips (employees use this for preview/download) */
export const getMySalarySlips = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('salarySlips');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const slips = (user.salarySlips || []).slice().sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    res.json({ salarySlips: slips });
  } catch (error) {
    console.error('Get my salary slips error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/** Authenticated user: get one of own salary slips by month/year */
export const getMySalarySlip = async (req, res) => {
  try {
    const month = parseInt(req.params.month, 10);
    const year = parseInt(req.params.year, 10);

    const user = await User.findById(req.user._id).select('salarySlips');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const salarySlip = (user.salarySlips || []).find(
      (item) => item.month === month && item.year === year
    );

    if (!salarySlip) {
      return res.status(404).json({ message: 'Salary slip not found for the selected period' });
    }

    res.json({ salarySlip });
  } catch (error) {
    console.error('Get my salary slip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/** Admin/HR: get salary slips for a specific employee */
export const getUserSalarySlips = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('name salarySlips');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      userId: user._id,
      name: user.name,
      salarySlips: user.salarySlips || []
    });
  } catch (error) {
    console.error('Get user salary slips error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark salary as paid for a specific month
export const markSalaryAsPaid = async (req, res) => {
  try {
    const { userId, month, year } = req.params;
    const { isPaid } = req.body;
    const currentUser = req.user;

    // Only Admin and HR can mark salary as paid
    if (currentUser.role !== 'Admin' && currentUser.role !== 'HR') {
      return res.status(403).json({ message: 'Only Admin and HR can mark salary as paid' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the salary breakdown entry for the specified month and year
    const salaryEntry = user.salaryBreakdown.find(
      item => item.month === parseInt(month) && item.year === parseInt(year)
    );

    if (!salaryEntry) {
      return res.status(404).json({ message: 'Salary entry not found for the specified month' });
    }

    // Update payment status
    salaryEntry.isPaid = isPaid;
    if (isPaid) {
      salaryEntry.paidAt = new Date();
      salaryEntry.paidBy = currentUser.name;
    } else {
      salaryEntry.paidAt = undefined;
      salaryEntry.paidBy = undefined;
    }

    await user.save();

    // Log action
    await logAction(
      currentUser._id,
      currentUser.name,
      isPaid ? 'MARK_SALARY_PAID' : 'UNMARK_SALARY_PAID',
      'USER',
      userId,
      `${isPaid ? 'Marked' : 'Unmarked'} salary as paid for ${user.name} - ${month}/${year}`
    );

    res.json({
      message: `Salary ${isPaid ? 'marked as paid' : 'unmarked'} successfully`,
      salaryEntry
    });
  } catch (error) {
    console.error('Mark salary as paid error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

