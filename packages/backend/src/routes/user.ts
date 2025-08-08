import { Elysia } from 'elysia'
import { db } from '../db/client'

import {
  registerReqSchema,
  loginReqSchema,
  userSuccessRespSchema,
  messageRespSchema,
  errorRespSchema,
  okRespSchema
} from '@generale/types'

import { verificationTokens } from '../db/schema'
import { userService } from '../services/userService'
import { sendVerificationEmail } from '../services/emailService'
import { sessionService } from '../services/sessionService'
import { randomUUIDv7 } from 'bun'
import { eq } from 'drizzle-orm'

export const userRoutes = new Elysia({ prefix: '/api' })
  .post(
    '/register',
    async ({ body, set }) => {
      // `body` is now fully typed, no need for casting
      const { username, password, email } = body;
      if (await userService.findByUsername(username)) {
        set.status = 409
        return { error: '用户名已存在' }
      }
      if (await userService.findByEmail(email)) {
        set.status = 409
        return { error: '邮箱已注册' }
      }
      const user = await userService.create(username, password, email)
      const token = randomUUIDv7()
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      db.insert(verificationTokens)
        .values({ token, userId: user.id, expiresAt })
        .run()
      await sendVerificationEmail(email, token)
      return { success: true, message: '验证邮件已发送，请查收' }
    },
    {
      body: registerReqSchema,
      response: {
        200: messageRespSchema,
        409: errorRespSchema
      }
    }
  )
  .get(
    '/verify',
    async ({ query, set }) => {
      const token = String(query['token'])
      const row = db.select().from(verificationTokens).where(eq(verificationTokens.token, token)).get()
      if (!row || row.expiresAt.getTime() < Date.now()) {
        set.status = 400
        return { error: '验证链接无效或已过期' }
      }
      await userService.markVerified(row.userId)
      db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run()
      return { success: true, message: '邮箱验证成功，可登录' }
    },
    {
      response: {
        200: messageRespSchema,
        400: errorRespSchema
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
