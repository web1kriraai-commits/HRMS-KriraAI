import nodemailer from 'nodemailer';
import { Resend } from 'resend';

// Initialize Resend if API key is provided
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY || 're_FW8gcH2H_5uKsbQjn1g6GJfpyP9mDtMYk';
  if (!apiKey) return null;
  return new Resend(apiKey);
};

// Create SMTP transporter
const createSMTPTransporter = () => {
  if (!process.env.SMTP_USER && !process.env.SMTP_PASS && process.env.NODE_ENV !== 'development') {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

/**
 * Sends an OTP email using the configured provider (Resend or SMTP)
 * @param {Object} params 
 * @param {string} params.email - Recipient email
 * @param {string} params.otp - OTP code
 * @param {string} params.adminName - Name of the admin requesting reset
 * @param {string} params.userName - Name of the user being reset
 * @param {string} params.username - Username of the user being reset
 */
export const sendOTPEmail = async ({ email, otp, adminName, userName, username }) => {
  const provider = process.env.EMAIL_PROVIDER || 'resend';
  const fromEmail = process.env.EMAIL_FROM || 'KriraAI <onboarding@resend.dev>';

  console.log(`\n--- Email Sending Process (${provider.toUpperCase()}) ---`);
  console.log(`To: ${email}`);
  console.log(`OTP: ${otp}`);

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #4F46E5;">Password Reset Request</h2>
      <p>Hello ${adminName || 'Admin'},</p>
      <p>You have requested to reset the password for user: <strong>${userName || 'User'} (${username || 'N/A'})</strong></p>
      <p>Your OTP for password reset is:</p>
      <div style="background-color: #F3F4F6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px; margin: 0;">${otp}</h1>
      </div>
      <p style="color: #6B7280; font-size: 14px;">This OTP will expire in 10 minutes.</p>
      <p style="color: #6B7280; font-size: 14px;">If you did not request this password reset, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
      <p style="color: #9CA3AF; font-size: 12px;">This is an automated message from HRMS System.</p>
    </div>
  `;

  if (provider === 'resend') {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key not configured');

    console.log(`Sending email via Resend...`);
    console.log(`From: ${fromEmail}`);

    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Password Reset OTP - HRMS',
        html: htmlContent
      });

      console.log('Resend API Response:', JSON.stringify(result, null, 2));

      if (result.error) {
        console.error('Resend Error:', result.error);
        throw new Error(result.error.message);
      }
      return result;
    } catch (error) {
      console.error('Resend API Call Failed:', error);
      throw error;
    }
  } else {
    // SMTP (Nodemailer)
    const transporter = createSMTPTransporter();
    if (!transporter) throw new Error('SMTP configuration missing');

    const info = await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: 'Password Reset OTP - HRMS',
      html: htmlContent
    });

    console.log('Message sent: %s', info.messageId);
    return info;
  }
};

// Generate 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

