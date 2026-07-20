import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAllUsers,
  getAllUsersForManagement,
  createUser,
  getUsersByRole,
  getEmployeeStats,
  deleteUser,
  updateUser,
  toggleUserActiveStatus,
  resetAllPaidLeaveAllocation,
  markSalaryAsPaid,
  saveSalarySlip,
  getMySalarySlips,
  getMySalarySlip,
  getUserSalarySlips
} from '../controllers/userController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', getAllUsers);
router.get('/manage/all', authorize('HR', 'Admin'), getAllUsersForManagement);
router.get('/role/:role', getUsersByRole);
router.get('/stats/employees', authorize('HR', 'Admin'), getEmployeeStats);
// Admin can create any role, HR can only create Employee (checked in controller)
router.post('/', authorize('HR', 'Admin'), createUser);
router.put('/:id', authorize('HR', 'Admin'), updateUser);
router.patch('/:id/status', authorize('HR', 'Admin'), toggleUserActiveStatus);
router.post('/reset-paid-leave', authorize('Admin'), resetAllPaidLeaveAllocation);
router.patch('/:userId/salary/:month/:year/payment', authorize('HR', 'Admin'), markSalaryAsPaid);
// Salary slip: employee read-only access to own slips; Admin/HR can save & view any
router.get('/me/salary-slips', getMySalarySlips);
router.get('/me/salary-slips/:month/:year', getMySalarySlip);
router.get('/:userId/salary-slips', authorize('HR', 'Admin'), getUserSalarySlips);
router.put('/:userId/salary-slip', authorize('HR', 'Admin'), saveSalarySlip);
router.delete('/:id', authorize('Admin'), deleteUser);

export default router;

