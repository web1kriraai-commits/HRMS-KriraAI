import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  requestLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
  getPendingLeaves,
  getLeavesByUserId
} from '../controllers/leaveController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Employee routes
router.post('/request', requestLeave);
router.get('/my-leaves', getMyLeaves);
router.get('/user/:userId', getLeavesByUserId);

// HR/Admin routes
router.get('/all', authorize('HR', 'Admin'), getAllLeaves);
router.get('/pending', authorize('HR', 'Admin'), getPendingLeaves);
router.put('/:id/status', authorize('HR', 'Admin'), updateLeaveStatus);

export default router;

