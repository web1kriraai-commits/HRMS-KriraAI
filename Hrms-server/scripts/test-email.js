import dotenv from 'dotenv';
import { sendOTPEmail } from '../utils/emailService.js';

dotenv.config();

const testEmail = async () => {
    console.log('--- Email Service Test ---');
    console.log('EMAIL_PROVIDER:', process.env.EMAIL_PROVIDER || 'resend (default)');
    console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'onboarding@resend.dev (default)');

    try {
        const result = await sendOTPEmail({
            email: 'web1.kriraai@gmail.com',
            otp: '123456',
            adminName: 'Test Admin',
            userName: 'Test User',
            username: 'testuser'
        });

        console.log('\n--- SUCCESS ---');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('\n--- FAILED ---');
        console.error('Error:', error.message);
    }
};

testEmail();
