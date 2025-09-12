import { Elysia } from 'elysia'
import { db } from '../db/client'

import {
  registerReqSchema,
  loginReqSchema,
  userSuccessRespSchema,
  messageRespSchema,
  errorRespSchema,
  okRespSchema,
  verifyReqSchema
} from '@generale/types'

import { verificationTokens } from '../db/schema'
import { userService } from '../services/userService'
import { sendVerificationEmail } from '../services/emailService'
import { sessionService } from '../services/sessionService'
import { eq } from 'drizzle-orm'

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export const userRoutes = new Elysia({ prefix: '/api' })
  .post(
    '/register',
    async ({ body, set }) => {
      const { username, password, email } = body
      if (await userService.findByUsername(username)) {
        set.status = 409
        return { error: '用户名已存在' }
      }
      if (await userService.findByEmail(email)) {
        set.status = 409
        return { error: '邮箱已注册' }
      }
      const user = await userService.create(username, password, email)

      // 生成验证码并存储
      const code = generateCode()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 分钟有效
      db.insert(verificationTokens)
        .values({ token: code, userId: user.id, expiresAt })
        .run()

      await sendVerificationEmail(email, code)
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

      const row = db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.userId, user.id))
        .get()

      if (!row || row.token !== code || row.expiresAt.getTime() < Date.now()) {
        set.status = 400
        return { error: '验证码错误或已过期' }
      }

      await userService.markVerified(user.id)
      db.delete(verificationTokens).where(eq(verificationTokens.userId, user.id)).run()

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
  .post(
    '/logout',
    async ({ cookie: { sid } }) => {
      if (sid?.value) {
        sessionService.delete(sid.value)
        sid.set({
          value: '',
          path: '/',
          expires: new Date(0)
        })
      }
      return { ok: true }
    },
    {
      response: {
        200: okRespSchema
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

export default userRoutes
