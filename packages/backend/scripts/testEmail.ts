import { initEmailService, sendVerificationEmail } from '../src/services/emailService';
import dotenv from 'dotenv';

dotenv.config();

async function sendTestEmail() {
  try {
    // Validate required SMTP environment variables
    const requiredVars = [
      'EMAIL_FROM',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'TEST_EMAIL_TO',
    ];
    
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`${varName} is required in environment`);
      }
    }

    await initEmailService({
      method: 'smtp',
      from: process.env['EMAIL_FROM']!,
      smtp: {
        host: process.env['SMTP_HOST']!,
        port: parseInt(process.env['SMTP_PORT']!),
        secure: true,
        auth: {
          user: process.env['SMTP_USER']!,
          pass: process.env['SMTP_PASS']!
        }
      },
      proxy: process.env['HTTP_PROXY']!,
    });
    
    await sendVerificationEmail(
      process.env['TEST_EMAIL_TO']!, 
      'Test Email from SMTP', 
    );
    
    console.log('Email sent successfully via SMTP');
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

sendTestEmail();
