import dotenv from "dotenv";
import { initEmailService, sendVerificationEmail } from "../src/services/emailService";

dotenv.config();

async function sendTestEmail() {
  try {
    // Validate required SMTP environment variables
    const requiredVars = ["EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "TEST_EMAIL_TO"];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`${varName} is required in environment`);
      }
    }

    const EMAIL_FROM = process.env["EMAIL_FROM"] ?? "";
    const SMTP_HOST = process.env["SMTP_HOST"] ?? "";
    const SMTP_PORT = process.env["SMTP_PORT"] ?? "";
    const SMTP_USER = process.env["SMTP_USER"] ?? "";
    const SMTP_PASS = process.env["SMTP_PASS"] ?? "";
    const TEST_EMAIL_TO = process.env["TEST_EMAIL_TO"] ?? "";

    await initEmailService({
      method: "smtp",
      from: EMAIL_FROM,
      smtp: {
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT, 10),
        secure: true,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      },
      ...(process.env["HTTP_PROXY"] ? { proxy: process.env["HTTP_PROXY"] } : {}),
    });

    await sendVerificationEmail(TEST_EMAIL_TO, "Test Email from SMTP");

    console.log("Email sent successfully via SMTP");
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

sendTestEmail();
