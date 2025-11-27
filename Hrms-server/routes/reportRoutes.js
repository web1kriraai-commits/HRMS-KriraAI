import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { exportAttendanceReport } from '../controllers/reportController.js';

const router = express.Router();

router.get('/attendance', authenticate, authorize('HR', 'Admin'), exportAttendanceReport);

export default router;



