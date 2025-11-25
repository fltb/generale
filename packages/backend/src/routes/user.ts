import { Elysia } from 'elysia'
import { db } from '../db/client'

import {
  registerReqSchema,
  loginReqSchema,
  userSuccessRespSchema,
  messageRespSchema,
  errorRespSchema,
  verifyReqSchema,
  resetPasswordReqSchema,
  passwordResetTokenRespSchema
} from '@generale/types/dist/api'

import { verificationTokens, users } from '../db/schema'
import { userService } from '../services/userService'
import { sendVerificationEmail } from '../services/emailService'
import { sessionService } from '../services/sessionService'
import { eq } from 'drizzle-orm'

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export const userRoutes = new Elysia()
  // 替换 register handler 为下面实现（保留其它路由不变）
  .post(
    '/register',
    async ({ body, set }) => {
      const { username, password, email } = body

      // 1) username collision check — if username taken by other user (not the same email user), reject
      const usernameOwner = await userService.findByUsername(username)
      if (usernameOwner) {
        set.status = 409
        return { error: '用户名已存在' }
      }

      // 2) check email
      const existing = await userService.findByEmail(email)

      if (existing) {
        // email exists
        if (existing.verified) {
          // already verified -> can't re-register
          set.status = 409
          return { error: '邮箱已注册' }
        }

        // existing user but not verified -> we will COMPLETELY OVERWRITE this user (keep same id)
        // Steps:
        //  - delete old tokens
        //  - update password via userService.updatePassword (handles hashing)
        //  - update username (if changed)
        //  - ensure verified = false and updatedAt is refreshed
        //  - issue new token and send verification email

        try {
          db.delete(verificationTokens).where(eq(verificationTokens.userId, existing.id)).run()
        } catch (err) {
          console.error('Failed to delete old verification tokens for overwrite-register:', existing.id, err)
        }

        // update password (hashed inside service)
        try {
          await userService.updatePassword(existing.id, password)
        } catch (err) {
          console.error('Failed to update password during overwrite-register for user', existing.id, err)
          set.status = 500
          return { error: '服务器错误：无法更新密码' }
        }

        // If username changed — but we've already checked username uniqueness above.
        if (existing.username !== username) {
          try {
            db.update(users).set({ username }).where(eq(users.id, existing.id)).run()
          } catch (err) {
            console.error('Failed to update username during overwrite-register for user', existing.id, err)
            set.status = 500
            return { error: '服务器错误：无法更新用户名' }
          }
        }

        // Ensure verified flag false and bump updatedAt
        try {
          db.update(users).set({ verified: false, updatedAt: new Date() }).where(eq(users.id, existing.id)).run()
        } catch (err) {
          console.error('Failed to reset verified flag/updatedAt during overwrite-register for user', existing.id, err)
          set.status = 500
          return { error: '服务器错误：无法更新用户状态' }
        }

        // generate & store new token
        const code = generateCode()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        try {
          db.insert(verificationTokens).values({ token: code, userId: existing.id, expiresAt }).run()
        } catch (err) {
          console.error('Failed to insert new verification token for overwrite-register:', existing.id, err)
          set.status = 500
          return { error: '服务器错误：无法创建验证凭证' }
        }

        // send verification email (wrap in try/catch so registration doesn't crash)
        try {
          await sendVerificationEmail(email, code)
        } catch (err) {
          console.error('Failed to send verification email (overwrite-register):', email, err)
          // 这里选择返回 success，但提醒发送失败（你也可以改成 set.status = 500 并返回 error）
          return { success: true, message: '已更新用户并生成新验证码（发送邮件失败，请稍后重试）' }
        }

        return { success: true, message: '已使用新信息覆盖未验证用户，验证码已发送到邮箱，请查收' }
      }

      // 3) not existing -> create new user (unchanged behavior)
      const user = await userService.create(username, password, email)

      // generate token and store
      const code = generateCode()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 分钟有效
      try {
        db.insert(verificationTokens).values({ token: code, userId: user.id, expiresAt }).run()
      } catch (err) {
        console.error('Failed to insert verification token for new user:', user.id, err)
        set.status = 500
        return { error: '服务器错误：无法创建验证凭证' }
      }

      // send email
      try {
        await sendVerificationEmail(email, code)
      } catch (err) {
        console.error('Failed to send verification email for new user:', email, err)
        // consider deleting user row if you prefer fail-fast: await userService.delete(user.id)
        // For now, return success but notify
        return { success: true, message: '注册成功，但无法发送验证邮件，请稍后重试' }
      }

      return { success: true, message: '验证码已发送到邮箱，请查收' }
    },
    {
      body: registerReqSchema,
      response: {
        200: messageRespSchema,
        409: errorRespSchema
      }
    }
  )
  .post(
    '/verify',
    async ({ body, set }) => {
      const { email, code } = body

      const user = await userService.findByEmail(email)
      if (!user) {
        set.status = 404
        return { error: '用户不存在' }
      }

      const row = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.userId, user.id))
        .get()

      if (!row) {
        set.status = 400
        return { error: '没有找到验证凭证，请重新注册' }
      }

      const expiresAt = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime()
      const now = Date.now()

      if (row.token !== code) {
        set.status = 400
        return { error: '验证码错误' }
      }

      if (expiresAt < now) {
        // token expired -> delete token and delete the unverified user
        try {
          db.delete(verificationTokens).where(eq(verificationTokens.userId, user.id)).run()
        } catch (err) {
          console.error('Failed to delete expired verification token for user', user.id, err)
        }

        try {
          // delete unverified user
          await userService.delete(user.id)
        } catch (err) {
          console.error('Failed to delete unverified (expired) user', user.id, err)
        }

        set.status = 400
        return { error: '验证码已过期，已删除临时用户，请重新注册' }
      }

      // valid token and not expired
      await userService.markVerified(user.id)
      try {
        db.delete(verificationTokens).where(eq(verificationTokens.userId, user.id)).run()
      } catch (err) {
        console.error('Failed to delete verification token after successful verify for user', user.id, err)
      }

      return { success: true, message: '邮箱验证成功，可登录' }
    },
    {
      body: verifyReqSchema,
      response: {
        200: messageRespSchema,
        400: errorRespSchema,
        404: errorRespSchema
      }
    }
  )
  .post(
    '/login',
    async ({ body, cookie: { sid }, set }) => {
      // `body` is now fully typed
      const { username, password } = body;
      const user = await userService.findByUsername(username)
      if (!user || !userService.verifyPassword(password, user.password)) {
        set.status = 401
        return { error: 'invalid credentials' }
      }
      const session = sessionService.create(user.id)

      sid!.set({
        value: session.id,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
      return { user: { id: user.id, username: user.username, email: user.email } }
    },
    {
      body: loginReqSchema,
      response: {
        200: userSuccessRespSchema,
        401: errorRespSchema
      }
    }
  )
  .get(
    '/me',
    async ({ cookie: { sid }, set }) => {
      const session = sid?.value ? sessionService.get(sid.value) : undefined
      if (!session) {
        set.status = 401
        return { error: 'unauthorized' }
      }
      const user = await userService.findById(session.userId)
      if (!user) {
        set.status = 404
        return { error: 'user not found' }
      }
      return { user: { id: user.id, username: user.username, email: user.email } }
    },
    {
      response: {
        200: userSuccessRespSchema,
        401: errorRespSchema,
        404: errorRespSchema
      }
    }
  )
  .post(
    '/reset-password',
    async ({ body }) => {
      const { token, newPassword } = body;

      // Verify token exists and is not expired
      const verificationToken = db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.token, token))
        .get();

      if (!verificationToken || new Date(verificationToken.expiresAt) < new Date()) {
        return { error: '无效或过期的重置链接', valid: false };
      }

      // Update user's password
      await userService.updatePassword(verificationToken.userId, newPassword);

      // Delete used token
      db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run();

      return { success: true, message: '密码重置成功', valid: true };
    },
    {
      body: resetPasswordReqSchema,
      response: {
        200: passwordResetTokenRespSchema,
        400: errorRespSchema
      }
    }
  )

export default userRoutes
