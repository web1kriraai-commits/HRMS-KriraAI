import LeaveRequest from '../models/LeaveRequest.js';
import User from '../models/User.js';
import { logAction } from './auditController.js';
import { sendNotification } from './notificationController.js';

export const requestLeave = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, category, reason, attachmentUrl } = req.body;

    if (!startDate || !endDate || !category || !reason) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const leaveRequest = new LeaveRequest({
      userId,
      userName: user.name,
      startDate,
      endDate,
      category,
      reason,
      attachmentUrl,
      status: 'Pending'
    });

    await leaveRequest.save();
    await sendNotification(userId, `Leave request submitted for ${startDate}`);

    // Notify HR/Admin
    const targetRoles = (user.role === 'HR' || user.role === 'Admin') ? ['Admin'] : ['HR', 'Admin'];
    const approvers = await User.find({ role: { $in: targetRoles }, isActive: true });
    
    for (const approver of approvers) {
      if (approver._id.toString() !== userId.toString()) {
        await sendNotification(approver._id, `New leave request from ${user.name}`);
      }
    }

    res.status(201).json(leaveRequest);
  } catch (error) {
    console.error('Request leave error:', error);
    res.status(500).json({ message: 'Server error' });
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

