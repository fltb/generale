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
export async function sendVerificationEmail(email: string, token: string) {
  const link = `${process.env["APP_URL"]}/api/verify?token=${token}`
  await transporter.sendMail({
    from: 'no-reply@example.com',
    to: email,
    subject: '请验证您的邮箱',
    html: `<p>请点击以下链接完成验证：</p><a href="${link}">${link}</a>`
  })
}
