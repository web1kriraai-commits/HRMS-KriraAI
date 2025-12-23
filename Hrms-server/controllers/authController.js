import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generateOTP, storeOTP, verifyOTP } from '../utils/otpStorage.js';
import { sendNotification } from './notificationController.js';



const generateToken = (userId) => {
  // Generate token with 1 year expiration
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '365d' });
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || username.trim() === '') {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (!password || password.trim() === '') {
      return res.status(400).json({ message: 'Password is required' });
    }

    const usernameLower = username.toLowerCase().trim();

    // Find user by username
    const user = await User.findOne({ username: usernameLower });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        department: user.department,
        isActive: user.isActive,
        isFirstLogin: user.isFirstLogin,
        lastLogin: user.lastLogin
      },
      requiresPasswordChange: user.isFirstLogin || false
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user._id;

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = newPassword;
    user.isFirstLogin = false;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        department: user.department,
        isActive: user.isActive,
        isFirstLogin: user.isFirstLogin,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Send OTP for password reset - requires admin email
export const sendResetPasswordOTP = async (req, res) => {
  try {
    const { email, username, newPassword } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (!username || !username.trim()) {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'New password is required and must be at least 4 characters' });
    }

    // Verify email belongs to an admin
    const emailLower = email.toLowerCase().trim();

    // First check if email exists
    const userWithEmail = await User.findOne({ email: emailLower });

    if (!userWithEmail) {
      return res.status(404).json({ message: 'No account found with this email address' });
    }

    // Check if email belongs to an admin
    const admin = await User.findOne({
      email: emailLower,
      role: 'Admin',
      isActive: true
    });

    if (!admin) {
      // Check if user exists but is not admin
      if (userWithEmail.role !== 'Admin') {
        return res.status(403).json({ message: `This email belongs to a ${userWithEmail.role} account. Only Admin emails can be used for password reset.` });
      }
      if (!userWithEmail.isActive) {
        return res.status(403).json({ message: 'This Admin account is inactive. Please contact system administrator.' });
      }
      return res.status(403).json({ message: 'Email must belong to an active Admin account' });
    }

    // Find the user whose password needs to be reset
    const usernameLower = username.toLowerCase().trim();
    const user = await User.findOne({ username: usernameLower });

    if (!user) {
      return res.status(404).json({ message: 'No account found with this username' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP with new password
    storeOTP(email.toLowerCase().trim(), otp, usernameLower, newPassword);

    try {
      // Send OTP as notification to the admin user
      const notificationMessage = `🔐 Password Reset OTP for ${user.name} (@${user.username}): ${otp}\n\nThis OTP will expire in 10 minutes.`;

      await sendNotification(admin._id, notificationMessage);

      console.log(`OTP notification sent to admin: ${admin.name} (${admin.email})`);

      return res.json({
        message: 'OTP has been sent as a notification to your admin dashboard. Please check your notifications.',
        email: emailLower
      });

    } catch (emailError) {
      console.error('Final Email Sending Error:', emailError.message);

      return res.status(500).json({
        message: `Failed to send email: ${emailError.message}`
      });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Verify OTP and reset password
export const resetPassword = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (!otp || !otp.trim()) {
      return res.status(400).json({ message: 'OTP is required' });
    }

    // Verify OTP (this also returns the stored newPassword)
    const otpVerification = verifyOTP(email.toLowerCase().trim(), otp.trim());

    if (!otpVerification.valid) {
      return res.status(400).json({ message: otpVerification.message });
    }

    // Find user by username from OTP storage
    const usernameLower = otpVerification.username;
    const newPassword = otpVerification.newPassword;

    const user = await User.findOne({ username: usernameLower });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    // Update password using the stored password from OTP
    user.password = newPassword;
    user.isFirstLogin = false;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

