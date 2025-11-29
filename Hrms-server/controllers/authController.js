import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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

// Reset Password - verify email and set new password
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || email.trim() === '') {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    const emailLower = email.toLowerCase().trim();

    // Find user by email
    const user = await User.findOne({ email: emailLower });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    // Update password
    user.password = newPassword;
    user.isFirstLogin = false;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

