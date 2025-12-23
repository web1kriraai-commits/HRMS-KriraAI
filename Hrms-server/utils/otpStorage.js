// In-memory OTP storage
// Format: { email: { otp: string, expiresAt: Date, username: string, newPassword: string } }
const otpStorage = new Map();

// Generate 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP with 10 minute expiration
export const storeOTP = (email, otp, username, newPassword) => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiration
  
  otpStorage.set(email.toLowerCase(), {
    otp,
    expiresAt,
    username,
    newPassword
  });
  
  // Clean up expired OTPs after 10 minutes
  setTimeout(() => {
    otpStorage.delete(email.toLowerCase());
  }, 10 * 60 * 1000);
};

// Verify OTP
export const verifyOTP = (email, otp) => {
  const stored = otpStorage.get(email.toLowerCase());
  
  if (!stored) {
    return { valid: false, message: 'OTP not found or expired' };
  }
  
  if (new Date() > stored.expiresAt) {
    otpStorage.delete(email.toLowerCase());
    return { valid: false, message: 'OTP has expired' };
  }
  
  if (stored.otp !== otp) {
    return { valid: false, message: 'Invalid OTP' };
  }
  
  // OTP is valid, return username, newPassword and delete OTP
  const username = stored.username;
  const newPassword = stored.newPassword;
  otpStorage.delete(email.toLowerCase());
  
  return { valid: true, username, newPassword };
};

// Get stored OTP info (for debugging)
export const getOTPInfo = (email) => {
  return otpStorage.get(email.toLowerCase());
};

