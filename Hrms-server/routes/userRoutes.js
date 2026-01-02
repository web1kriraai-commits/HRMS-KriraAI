import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAllUsers,
  createUser,
  getUsersByRole,
  getEmployeeStats,
  deleteUser,
  updateUser,
  resetAllPaidLeaveAllocation,
  markSalaryAsPaid
} from '../controllers/userController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', getAllUsers);
router.get('/role/:role', getUsersByRole);
router.get('/stats/employees', authorize('HR', 'Admin'), getEmployeeStats);
// Admin can create any role, HR can only create Employee (checked in controller)
router.post('/', authorize('HR', 'Admin'), createUser);
router.put('/:id', authorize('HR', 'Admin'), updateUser);
router.post('/reset-paid-leave', authorize('Admin'), resetAllPaidLeaveAllocation);
router.patch('/:userId/salary/:month/:year/payment', authorize('HR', 'Admin'), markSalaryAsPaid);
router.delete('/:id', authorize('Admin'), deleteUser);

export default router;

