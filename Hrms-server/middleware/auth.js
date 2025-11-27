import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Check if authentication is disabled
const isAuthDisabled = process.env.DISABLE_AUTH === 'true';

export const authenticate = async (req, res, next) => {
  // If auth is disabled, set a default admin user or skip
  if (isAuthDisabled) {
    // Try to get first admin user, or create a mock user
    try {
      const adminUser = await User.findOne({ role: 'Admin', isActive: true }).select('-password');
      if (adminUser) {
        req.user = adminUser;
      } else {
        // Create a mock user object if no admin exists
        req.user = {
          _id: '000000000000000000000000',
          id: '000000000000000000000000',
          name: 'System',
          username: 'system',
          email: 'system@hrms.com',
          role: 'Admin',
          department: 'System',
          isActive: true,
          isFirstLogin: false
        };
      }
      return next();
    } catch (error) {
      // If database error, use mock user
      req.user = {
        _id: '000000000000000000000000',
        id: '000000000000000000000000',
        name: 'System',
        username: 'system',
        email: 'system@hrms.com',
        role: 'Admin',
        department: 'System',
        isActive: true,
        isFirstLogin: false
      };
      return next();
    }
  }

  // Normal authentication flow
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    // If auth is disabled, allow all
    if (isAuthDisabled) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    
    next();
  };
};

