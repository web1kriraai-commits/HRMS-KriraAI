import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  cancelBreak,
  getTodayAttendance,
  getAttendanceHistory,
  adminUpdateAttendance,
  adminCreateAttendance,
  deleteAttendance,
  recalculateHolidayFlags,
  recalculateHalfDayFlags,
  addManualHours,
  adminAddManualHours,
  adminBulkAddManualHours,
  getAllAttendance,
  getTodayAllAttendance,
  requestEarlyCheckout,
  reviewEarlyCheckout,
  submitOvertimeRequest,
  getPendingOvertimeRequests,
  reviewOvertimeRequest
} from '../controllers/attendanceController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Employee routes
router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.post('/break/start', startBreak);
router.post('/break/end', endBreak);
router.post('/break/cancel', cancelBreak);
router.get('/today', getTodayAttendance);
router.get('/history', getAttendanceHistory);
router.post('/request-early-checkout', requestEarlyCheckout);
router.post('/request-overtime', submitOvertimeRequest);

// Admin/HR routes
router.get('/all', authorize('HR', 'Admin'), getAllAttendance);
router.get('/today/all', authorize('HR', 'Admin'), getTodayAllAttendance);
router.post('/admin-create', authorize('HR', 'Admin'), adminCreateAttendance);
router.post('/admin/manual-hours', authorize('HR', 'Admin'), adminAddManualHours);
router.post('/admin/bulk-manual-hours', authorize('HR', 'Admin'), adminBulkAddManualHours);
router.post('/admin/recalculate-holiday-flags', authorize('HR', 'Admin'), recalculateHolidayFlags);
router.post('/admin/recalculate-halfday-flags', authorize('HR', 'Admin'), recalculateHalfDayFlags);
router.post('/manual-hours', addManualHours);
router.post('/admin/review-early-checkout/:recordId', authorize('HR', 'Admin'), reviewEarlyCheckout);
router.get('/admin/pending-overtime', authorize('HR', 'Admin'), getPendingOvertimeRequests);
router.post('/admin/review-overtime/:recordId', authorize('HR', 'Admin'), reviewOvertimeRequest);
router.put('/:recordId', authorize('HR', 'Admin'), adminUpdateAttendance);
router.delete('/:recordId', authorize('Admin'), deleteAttendance);

export default router;
