import LeaveRequest from '../models/LeaveRequest.js';
import User from '../models/User.js';
import { logAction } from './auditController.js';
import { sendNotification } from './notificationController.js';

export const requestLeave = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, category, reason, attachmentUrl } = req.body;

    console.log('Leave request received:', { startDate, endDate, category, reason: reason?.substring(0, 50) });

    if (!startDate || !endDate || !category || !reason) {
      console.error('Missing required fields:', { startDate: !!startDate, endDate: !!endDate, category: !!category, reason: !!reason });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate category
    const validCategories = ['Paid Leave', 'Unpaid Leave', 'Half Day Leave', 'Extra Time Leave'];
    if (!validCategories.includes(category)) {
      console.error('Invalid category:', category);
      return res.status(400).json({ 
        message: `Invalid leave category. Must be one of: ${validCategories.join(', ')}`,
        received: category
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    const leaveRequest = new LeaveRequest({
      userId,
      userName: user.name,
      startDate,
      endDate,
      category,
      reason,
      attachmentUrl: attachmentUrl || undefined,
      status: 'Pending'
    });

    let savedLeave;
    try {
      savedLeave = await leaveRequest.save();
      console.log('Leave request saved successfully:', savedLeave._id);
    } catch (saveError) {
      console.error('Leave request save error:', saveError);
      if (saveError.name === 'ValidationError') {
        const validationErrors = {};
        if (saveError.errors) {
          Object.keys(saveError.errors).forEach(key => {
            validationErrors[key] = saveError.errors[key].message;
          });
        }
        return res.status(400).json({ 
          message: 'Validation error',
          error: saveError.message,
          details: validationErrors
        });
      }
      // Re-throw to be caught by outer catch
      throw saveError;
    }

    // Send notifications (don't fail if notification fails)
    try {
      await sendNotification(userId, `Leave request submitted for ${startDate}`);
    } catch (notifError) {
      console.error('Notification error (non-fatal):', notifError);
    }

    // Notify HR/Admin (don't fail if notification fails)
    try {
      const targetRoles = (user.role === 'HR' || user.role === 'Admin') ? ['Admin'] : ['HR', 'Admin'];
      const approvers = await User.find({ role: { $in: targetRoles }, isActive: true });
      
      for (const approver of approvers) {
        if (approver._id.toString() !== userId.toString()) {
          try {
            await sendNotification(approver._id, `New leave request from ${user.name}`);
          } catch (notifError) {
            console.error(`Notification error for approver ${approver._id} (non-fatal):`, notifError);
          }
        }
      }
    } catch (notifError) {
      console.error('HR notification error (non-fatal):', notifError);
    }

    // Return the saved leave request
    res.status(201).json(savedLeave);
  } catch (error) {
    console.error('Request leave error:', error);
    console.error('Error stack:', error.stack);
    
    // Return more detailed error message
    const errorMessage = error.message || 'Server error';
    const isValidationError = error.name === 'ValidationError';
    
    // Format validation errors
    let errorDetails = undefined;
    if (isValidationError && error.errors) {
      errorDetails = {};
      Object.keys(error.errors).forEach(key => {
        errorDetails[key] = error.errors[key].message;
      });
    }
    
    res.status(500).json({ 
      message: isValidationError ? `Validation error: ${errorMessage}` : `Server error: ${errorMessage}`,
      error: errorMessage,
      details: errorDetails,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    const userId = req.user._id;
    const leaves = await LeaveRequest.find({ userId }).sort({ createdAt: -1 });
    res.json(leaves);
  } catch (error) {
    console.error('Get my leaves error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getLeavesByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify the userId matches the authenticated user (employees can only see their own)
    // Or allow HR/Admin to see any user's leaves
    if (req.user.role !== 'HR' && req.user.role !== 'Admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized to view this user\'s leaves' });
    }

    const leaves = await LeaveRequest.find({ userId })
      .populate('userId', 'name username email department role')
      .sort({ createdAt: -1 });
    
    res.json(leaves);
  } catch (error) {
    console.error('Get leaves by userId error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllLeaves = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const leaves = await LeaveRequest.find(query)
      .populate('userId', 'name username email department role')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (error) {
    console.error('Get all leaves error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, hrComment } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const leaveRequest = await LeaveRequest.findById(id).populate('userId', 'name');
    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    const employeeName = leaveRequest.userId?.name || 'Unknown';
    const startDate = leaveRequest.startDate;
    const endDate = leaveRequest.endDate;
    const category = leaveRequest.category;

    const beforeData = JSON.stringify({ status: leaveRequest.status, comment: leaveRequest.hrComment });

    leaveRequest.status = status;
    if (hrComment) leaveRequest.hrComment = hrComment;

    await leaveRequest.save();
    const afterData = JSON.stringify({ status: leaveRequest.status, comment: leaveRequest.hrComment });

    await logAction(
      req.user._id,
      req.user.name,
      'UPDATE_LEAVE',
      'LEAVE',
      id,
      `${status} ${category} leave for ${employeeName} (${startDate} to ${endDate}). Comment: ${hrComment || 'None'}`,
      beforeData,
      afterData
    );

    await sendNotification(leaveRequest.userId._id || leaveRequest.userId, `Your leave request for ${startDate} was ${status}.`);

    res.json(leaveRequest);
  } catch (error) {
    console.error('Update leave status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPendingLeaves = async (req, res) => {
  try {
    const userRole = req.user.role;
    let query = { status: 'Pending' };

    // HR can only see employee requests
    if (userRole === 'HR') {
      const employees = await User.find({ role: 'Employee' }).select('_id');
      const employeeIds = employees.map(e => e._id);
      query.userId = { $in: employeeIds };
    }

    const leaves = await LeaveRequest.find(query)
      .populate('userId', 'name username email department role')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (error) {
    console.error('Get pending leaves error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

