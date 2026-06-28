import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initEmailService, sendVerificationEmail } from "../emailService";

// Mock the nodemailer library
const mockSendMail = vi.fn();
const mockVerify = vi.fn();
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
    })),
  },
}));

const mockConfig = {
  method: "smtp" as const,
  from: "noreply@test.com",
  smtp: {
    host: "smtp.test.com",
    port: 587,
    secure: true,
    auth: { user: "user", pass: "pass" },
  },
};

describe("EmailService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub environment variables
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("EMAIL_FROM", "sender@app.com");
  });

  afterEach(() => {
    // This is required to reset the internal `transporter` variable in emailService.ts
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("should initialize the transporter and verify the connection", async () => {
    mockVerify.mockResolvedValue(true);
    await initEmailService(mockConfig);

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: mockConfig.smtp.host,
      port: mockConfig.smtp.port,
      secure: true,
      auth: mockConfig.smtp.auth,
      proxy: undefined,
    });
    expect(mockVerify).toHaveBeenCalled();
  });

  it("should throw an error if send is called before initialization", async () => {
    // We need to import a fresh version of the module where init was not called
    const { sendVerificationEmail: freshSend } = await import("../emailService");
    await expect(freshSend("test@example.com", "token123")).rejects.toThrow("Email service not initialized");
  });

  it("should send a verification email with the correct parameters", async () => {
    const to = "recipient@example.com";
    const token = "my-verification-token";
    const verificationUrl = `http://localhost:5173/verify-email?token=${token}`;

    vi.stubEnv("FRONTEND_BASE_URL", "http://localhost:5173");
    await initEmailService(mockConfig); // Initialize first
    await sendVerificationEmail(to, token);

    expect(mockSendMail).toHaveBeenCalledOnce();
    expect(mockSendMail).toHaveBeenCalledWith({
      from: "sender@app.com", // from .env
      to,
      subject: "请验证您的邮箱",
      html: expect.stringContaining(verificationUrl),
    });
  });
});
