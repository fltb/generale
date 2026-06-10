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

/**
 * 注册邮箱验证邮件：发可点击链接 /verify-email?token=XXX，
 * 不再发 6 位数字让用户回填。
 */
export async function sendVerificationEmail(email: string, token: string) {
  if (!transporter) {
    throw new Error('Email service not initialized');
  }
  const url = `${frontendBase()}/verify-email?token=${encodeURIComponent(token)}`;
  console.debug(`sent verification link to ${email}: ${url}`);
  await transporter.sendMail({
    from: process.env['EMAIL_FROM'],
    to: email,
    subject: '请验证您的邮箱',
    html: `
      <p>欢迎注册！点击下面链接完成邮箱验证（10 分钟内有效）：</p>
      <p><a href="${url}">${url}</a></p>
      <p>如非本人操作可忽略本邮件。</p>
    `,
  });
}

/**
 * 前端域名，用于在邮件里拼出能直接点击的链接。
 * 缺省 fallback 到 localhost:5173（rsbuild 默认 dev 端口），生产部署务必设
 * FRONTEND_BASE_URL 环境变量。
 */
function frontendBase(): string {
  return process.env['FRONTEND_BASE_URL'] || 'http://localhost:5173';
}

/**
 * 忘记密码邮件：用户点链接跳转 /reset-password?token=XXX，前端再 POST /api/reset-password
 */
export async function sendPasswordResetEmail(email: string, token: string) {
  if (!transporter) {
    throw new Error('Email service not initialized');
  }
  const url = `${frontendBase()}/reset-password?token=${encodeURIComponent(token)}`;
  console.debug(`sent password reset link to ${email}: ${url}`);
  await transporter.sendMail({
    from: process.env['EMAIL_FROM'],
    to: email,
    subject: '重置您的密码',
    html: `
      <p>有人申请重置该邮箱关联账号的密码。如非本人请忽略这封邮件。</p>
      <p>点击下面链接设置新密码（10 分钟内有效）：</p>
      <p><a href="${url}">${url}</a></p>
    `,
  });
}

/**
 * 改邮箱时给"新邮箱"发的确认链接：跳转 /confirm-email-change?token=XXX
 */
export async function sendEmailChangeConfirmation(newEmail: string, token: string) {
  if (!transporter) {
    throw new Error('Email service not initialized');
  }
  const url = `${frontendBase()}/confirm-email-change?token=${encodeURIComponent(token)}`;
  console.debug(`sent email-change confirmation to ${newEmail}: ${url}`);
  await transporter.sendMail({
    from: process.env['EMAIL_FROM'],
    to: newEmail,
    subject: '确认邮箱变更',
    html: `
      <p>有人申请把账号绑定的邮箱改成这一个。</p>
      <p>点击下面链接完成变更（30 分钟内有效）：</p>
      <p><a href="${url}">${url}</a></p>
      <p>如非本人，可以无视这封邮件，变更不会生效。</p>
    `,
  });
}

/**
 * 改邮箱时给"旧邮箱"的通知（无确认按钮，仅告知）
 */
export async function sendEmailChangeNotification(oldEmail: string, newEmail: string) {
  if (!transporter) {
    throw new Error('Email service not initialized');
  }
  console.debug(`sent email-change notification to ${oldEmail}, target: ${newEmail}`);
  await transporter.sendMail({
    from: process.env['EMAIL_FROM'],
    to: oldEmail,
    subject: '邮箱变更通知',
    html: `
      <p>您的账号申请把绑定邮箱改成 <b>${newEmail}</b>。</p>
      <p>如非本人操作，请尽快登录修改密码并联系管理员。</p>
    `,
  });
}
