import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  addHoliday,
  getHolidays,
  deleteHoliday
} from '../controllers/holidayController.js';

const router = express.Router();

router.get('/', authenticate, getHolidays);
router.post('/', authenticate, authorize('HR', 'Admin'), addHoliday);
router.delete('/:id', authenticate, authorize('Admin'), deleteHoliday);

export default router;



