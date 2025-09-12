import nodemailer from 'nodemailer'

// Configure your SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env['SMTP_HOST'],
  port: Number(process.env['SMTP_PORT']),
  secure: true,
  auth: {
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS']
  }
})

export async function sendVerificationEmail(email: string, code: string) {
  await transporter.sendMail({
    from: process.env['SMTP_USER'],
    to: email,
    subject: '邮箱验证码',
    html: `<p>您的验证码是：</p><h2>${code}</h2><p>10 分钟内有效</p>`
  })
}