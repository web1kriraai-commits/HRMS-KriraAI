import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  addHoliday,
  getHolidays,
  deleteHoliday,
  updateHoliday,
  autoAddSundaysForMonth
} from '../controllers/holidayController.js';

const router = express.Router();

router.get('/', authenticate, getHolidays);
router.post('/', authenticate, authorize('HR', 'Admin'), addHoliday);
router.post('/auto-add-sundays', authenticate, authorize('HR', 'Admin'), async (req, res) => {
  try {
    // Force mode - add Sundays for current month regardless of date
    const userInfo = {
      _id: req.user._id,
      name: req.user.name,
      role: req.user.role
    };
    const result = await autoAddSundaysForMonth(true, userInfo);
    res.json(result);
  } catch (error) {
    console.error('Auto-add Sundays error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.put('/:id', authenticate, authorize('Admin'), updateHoliday);
router.delete('/:id', authenticate, authorize('Admin'), deleteHoliday);

export default router;



