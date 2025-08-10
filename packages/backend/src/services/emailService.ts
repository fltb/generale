import nodemailer from 'nodemailer';

type EmailConfig = {
  method: 'smtp';
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

export async function initEmailService(config: EmailConfig) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: true,
    auth: {
      user: config.smtp.auth.user,
      pass: config.smtp.auth.pass
    },
    proxy: config.proxy
  });

  await transporter.verify();
}

export async function sendVerificationEmail(email: string, code: string) {
  if (!transporter) {
    throw new Error('Email service not initialized');
  }

  await transporter.sendMail({
    from: process.env['EMAIL_FROM'],
    to: email,
    subject: '请验证您的邮箱',
    html: `<p>您的验证码是：</p><h2>${code}</h2><p>10 分钟内有效</p>`
  })
}
