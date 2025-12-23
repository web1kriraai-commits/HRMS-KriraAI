import express from 'express';
import { login, changePassword, getCurrentUser, resetPassword, sendResetPasswordOTP } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/change-password', authenticate, changePassword);
router.get('/me', authenticate, getCurrentUser);

// Reset Password with OTP (no authentication required)
router.post('/reset-password/send-otp', sendResetPasswordOTP);
router.post('/reset-password', resetPassword);

export default router;



