import express from 'express';
import { login, changePassword, getCurrentUser, resetPassword } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/change-password', authenticate, changePassword);
router.get('/me', authenticate, getCurrentUser);

// Reset Password (no authentication required)
router.post('/reset-password', resetPassword);

export default router;



