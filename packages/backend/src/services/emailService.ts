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

export async function initEmailServiceWithEnv() {
  try {
    // Validate required SMTP environment variables
    const requiredVars = [
      'EMAIL_FROM',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
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
    
    console.log('Email service init successfully via SMTP');
  } catch (error) {
    console.error('Failed to init email service:', error);
  }
}



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
