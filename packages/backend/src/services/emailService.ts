import { createT } from "@generale/i18n";
import nodemailer from "nodemailer";

type EmailConfig = {
  method: "smtp";
  from: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  proxy?: string;
};

let transporter: nodemailer.Transporter;

export async function initEmailServiceWithEnv() {
  const requiredVars = ["EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];

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

  console.log("Email service init successfully via SMTP");
}

export async function initEmailService(config: EmailConfig) {
  transporter = nodemailer.createTransport(config.smtp as unknown as Parameters<typeof nodemailer.createTransport>[0]);

  try {
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
  } catch {
    console.warn("[email] SMTP verification failed — email service may not work. Check your SMTP credentials.");
  }
}

export async function sendVerificationEmail(email: string, token: string, locale = "en") {
  if (!transporter) {
    throw new Error("Email service not initialized");
  }
  const t = createT(locale);
  const url = `${frontendBase()}/verify-email?token=${encodeURIComponent(token)}`;
  console.debug(`sent verification link to ${email}: ${url}`);
  await transporter.sendMail({
    from: process.env["EMAIL_FROM"],
    to: email,
    subject: t("Please verify your email"),
    html: `
      <p>${t("Welcome! Click the link below to verify your email (valid for 10 minutes):")}</p>
      <p><a href="${url}">${url}</a></p>
      <p>${t("If you did not perform this action, please ignore this email.")}</p>
    `,
  });
}

function frontendBase(): string {
  return process.env["FRONTEND_BASE_URL"] || "http://localhost:5173";
}

export async function sendPasswordResetEmail(email: string, token: string, locale = "en") {
  if (!transporter) {
    throw new Error("Email service not initialized");
  }
  const t = createT(locale);
  const url = `${frontendBase()}/reset-password?token=${encodeURIComponent(token)}`;
  console.debug(`sent password reset link to ${email}: ${url}`);
  await transporter.sendMail({
    from: process.env["EMAIL_FROM"],
    to: email,
    subject: t("Reset your password email"),
    html: `
      <p>${t("Someone requested a password reset for this account. If not you, ignore this email.")}</p>
      <p>${t("Click the link below to set a new password (valid for 10 minutes):")}</p>
      <p><a href="${url}">${url}</a></p>
    `,
  });
}

export async function sendEmailChangeConfirmation(newEmail: string, token: string, locale = "en") {
  if (!transporter) {
    throw new Error("Email service not initialized");
  }
  const t = createT(locale);
  const url = `${frontendBase()}/confirm-email-change?token=${encodeURIComponent(token)}`;
  console.debug(`sent email-change confirmation to ${newEmail}: ${url}`);
  await transporter.sendMail({
    from: process.env["EMAIL_FROM"],
    to: newEmail,
    subject: t("Confirm email change"),
    html: `
      <p>${t("Someone requested to change the email bound to this account to this address.")}</p>
      <p>${t("Click the link below to complete the change (valid for 30 minutes):")}</p>
      <p><a href="${url}">${url}</a></p>
      <p>${t("If this was not you, ignore this email. The change will not take effect.")}</p>
    `,
  });
}

export async function sendEmailChangeNotification(oldEmail: string, newEmail: string, locale = "en") {
  if (!transporter) {
    throw new Error("Email service not initialized");
  }
  const t = createT(locale);
  console.debug(`sent email-change notification to ${oldEmail}, target: ${newEmail}`);
  await transporter.sendMail({
    from: process.env["EMAIL_FROM"],
    to: oldEmail,
    subject: t("Email change notification"),
    html: `
      <p>${t("Your account's email is being changed to:")} <b>${newEmail}</b>.</p>
      <p>${t("If you did not request this, please log in and change your password immediately.")}</p>
    `,
  });
}
