// SMS Service - Configure with your SMS provider (Twilio, MSG91, etc.)

// For Twilio
// import twilio from 'twilio';
// const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

export const sendOTPSMS = async (phone, otp) => {
  try {
    // Option 1: Using Twilio
    // await client.messages.create({
    //   body: `Your HRMS password reset OTP is: ${otp}. Valid for 10 minutes.`,
    //   from: process.env.TWILIO_PHONE,
    //   to: phone
    // });

    // Option 2: Using a generic HTTP API (like MSG91, TextLocal, etc.)
    // const response = await fetch('https://api.your-sms-provider.com/send', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', 'Authorization': process.env.SMS_API_KEY },
    //   body: JSON.stringify({
    //     to: phone,
    //     message: `Your HRMS password reset OTP is: ${otp}. Valid for 10 minutes.`
    //   })
    // });

    // For development/testing - just log the OTP
    console.log(`\n========================================`);
    console.log(`OTP for ${phone}: ${otp}`);
    console.log(`========================================\n`);

    return true;
  } catch (error) {
    console.error('Error sending OTP SMS:', error);
    throw error;
  }
};

// Generate 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

