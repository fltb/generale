import { Elysia, t } from 'elysia'
import { db } from '../db/client'

import {
  registerReqSchema,
  loginReqSchema,
  userSuccessRespSchema,
  messageRespSchema,
  errorRespSchema,
  verifyReqSchema,
  resetPasswordReqSchema,
  passwordResetTokenRespSchema,
  logoutRespSchema,
  requestPasswordResetReqSchema,
  changePasswordReqSchema,
  changeEmailReqSchema,
  confirmEmailChangeReqSchema,
  changeUsernameReqSchema,
  changeUsernameRespSchema,
} from '@generale/types'

import { verificationTokens, users } from '../db/schema'
import { userService } from '../services/userService'
import { profileService, ProfileService } from '../services/profileService'
import { sendVerificationEmail, sendPasswordResetEmail, sendEmailChangeConfirmation, sendEmailChangeNotification } from '../services/emailService'
import { sessionService } from '../services/sessionService'
import { closeAllConnectionsForUser } from '../plugins/websocket'
import { and, eq } from 'drizzle-orm'

/** 32 字节 URL-safe 随机串，用于 register / reset / change-email 这类放在链接里的不可记忆 token */
function generateOpaqueToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

// 将 sid 设为可选，避免在没有 cookie 时触发 422 校验错误
export const cookieScheme = t.Cookie({
  sid: t.Optional(t.String())
})

/**
 * 拼装 `/me` 和 `/login` 共用的"当前用户视图"。
 * 一次 getProfile 查询完成所有字段（避免之前 /me 和 /login 各自调 getProfile +
 * getAvatarUrlsForDisplay 两次的浪费），并保证两个端点的 response shape 完全一致。
 *
 * 包含敏感字段 email——只能给"自己"用，不能拿去做"按 userId 查别人"。
 */
async function buildSelfUserView(user: {
  id: string
  username: string
  email: string
  usernameChangedAt: Date | null
}) {
  const profile = await profileService.getProfile(user.id)
  const defaults = ProfileService.defaultAvatarUrls()
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    ...(profile?.displayName ? { displayName: profile.displayName } : {}),
    avatarUrl: profile?.avatarUrl || defaults.avatarUrl,
    avatarThumbUrl: profile?.avatarThumbUrl || defaults.avatarThumbUrl,
    ...(profile?.bio ? { bio: profile.bio } : {}),
    ...(user.usernameChangedAt ? { usernameChangedAt: user.usernameChangedAt.toISOString() } : {}),
  }
}

export const userRoutes = new Elysia()
  // 替换 register handler 为下面实现（保留其它路由不变）
  .post(
    '/register',
    async ({ body, set }) => {
      const { username, password, email } = body

      // 1) username collision check
      //    - 已验证用户占用：真冲突，拒绝
      //    - 未验证用户占用：视为「已放弃的注册会话」，清掉以便重新走完整流程
      //      （这样用户用同一/不同邮箱重试注册时，不会被自己之前未验证的草稿挡住）
      const usernameOwner = await userService.findByUsername(username)
      if (usernameOwner) {
        if (usernameOwner.verified) {
          set.status = 409
          return { error: '用户名已存在' }
        }
        try {
          await userService.delete(usernameOwner.id)
          console.info(`register: cleared abandoned unverified user ${usernameOwner.id} (username=${usernameOwner.username}) to free username`)
        } catch (err) {
          console.error('Failed to delete abandoned unverified user during register:', usernameOwner.id, err)
          set.status = 500
          return { error: '服务器错误：无法清理过期注册' }
        }
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
          db.delete(verificationTokens).where(and(eq(verificationTokens.userId, existing.id), eq(verificationTokens.purpose, 'register'))).run()
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

        // generate & store new token（链接 token，URL-safe，长度足够防爆破）
        const code = generateOpaqueToken()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        try {
          db.insert(verificationTokens).values({ token: code, userId: existing.id, purpose: 'register', expiresAt }).run()
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

      // generate token and store（链接 token，URL-safe）
      const code = generateOpaqueToken()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 分钟有效
      try {
        db.insert(verificationTokens).values({ token: code, userId: user.id, purpose: 'register', expiresAt }).run()
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
      const { token } = body

      // 直接按 token + purpose 查，不再依赖 email 提交
      const row = db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.token, token), eq(verificationTokens.purpose, 'register')))
        .get()

      if (!row) {
        set.status = 400
        return { error: '无效的验证链接' }
      }

      const expiresAt = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime()
      if (expiresAt < Date.now()) {
        // token expired -> 删 token，临时未验证用户也清掉，鼓励重新注册
        try {
          db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run()
        } catch (err) {
          console.error('Failed to delete expired verification token', err)
        }
        try {
          await userService.delete(row.userId)
        } catch (err) {
          console.error('Failed to delete unverified (expired) user', row.userId, err)
        }
        set.status = 400
        return { error: '验证链接已过期，请重新注册' }
      }

      await userService.markVerified(row.userId)
      try {
        db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run()
      } catch (err) {
        console.error('Failed to delete verification token after success', err)
      }

      return { success: true, message: '邮箱验证成功，可登录' }
    },
    {
      body: verifyReqSchema,
      response: {
        200: messageRespSchema,
        400: errorRespSchema,
      }
    }
  )
  .post(
    '/login',
    async ({ body, cookie: { sid }, set }) => {
      // 入参 `username` 字段历史上是 username，现在也接受 email。
      // 优先按 username 查；查不到再按 email 兜底，覆盖"用户用邮箱登录"场景。
      const { username, password } = body;
      let user = await userService.findByUsername(username)
      if (!user) {
        user = await userService.findByEmail(username)
      }
      if (!user) {
        set.status = 401
        return { error: 'user not found' }
      }
      if (!userService.verifyPassword(password, user.password)) {
        set.status = 401
        return { error: 'invalid credentials' }
      }
      // 反重复登录：清旧 session + 立刻关掉旧端的所有 WS 连接
      //   - 旧端 HTTP 端点拿 401 → 前端 useAuth 自动清空 user
      //   - 旧端 WS 各 sub-connector 触发 onClose → RoomInstance/GameInstance
      //     的 handleDisconnect 正常清理（Playing → Disconnected 等）
      // 顺序：先删 session，再关 WS。这样 WS 关闭如果触发重连，新连接的 auth
      // 校验已经失败，不会留下漏网的旧权限。
      sessionService.deleteAllForUser(user.id)
      closeAllConnectionsForUser(user.id)
      const session = sessionService.create(user.id)

      sid!.set({
        value: session.id,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
      // 和 /me 同形：loginMutation.onSuccess 直接把这份写进 ["me"] cache，头像/displayName 立刻就有
      return { user: await buildSelfUserView(user) }
    },
    {
      body: loginReqSchema,
      response: {
        200: userSuccessRespSchema,
        401: errorRespSchema
      }
    }
  )
  .patch(
    '/me/username',
    async ({ body, cookie: { sid }, set }) => {
      const session = sid?.value ? sessionService.get(sid.value) : undefined
      if (!session) { set.status = 401; return { error: '未登录' } }
      try {
        const result = await userService.updateUsername(session.userId, body.username)
        return { username: result.username, usernameChangedAt: result.usernameChangedAt.toISOString() }
      } catch (err: any) {
        set.status = 400
        return { error: err?.message ?? '修改失败' }
      }
    },
    {
      body: changeUsernameReqSchema,
      response: {
        200: changeUsernameRespSchema,
        400: errorRespSchema,
        401: errorRespSchema,
      },
      cookie: cookieScheme,
    }
  )
  .post(
    '/logout',
    async ({ cookie: { sid } }) => {
      if (sid?.value) {
        // 拿到 userId 后再删 session，方便顺手把 WS 关掉，避免 sub-connector 残留
        const session = sessionService.get(sid.value)
        sessionService.delete(sid.value)
        if (session) {
          closeAllConnectionsForUser(session.userId)
        }
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
        200: logoutRespSchema
      },
      cookie: cookieScheme
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
      return { user: await buildSelfUserView(user) }
    },
    {
      response: {
        200: userSuccessRespSchema,
        401: errorRespSchema,
        404: errorRespSchema
      },
      cookie: cookieScheme
    }
  )
  .post(
    '/reset-password',
    async ({ body }) => {
      const { token, newPassword } = body;

      // 用途必须是 reset-password，防止注册验证码 / 改邮箱 token 被拿来改密码
      const verificationToken = db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.token, token), eq(verificationTokens.purpose, 'reset-password')))
        .get();

      if (!verificationToken || new Date(verificationToken.expiresAt) < new Date()) {
        return { error: '无效或过期的重置链接', valid: false };
      }

      await userService.updatePassword(verificationToken.userId, newPassword);
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
  /**
   * 忘记密码：邮箱存在就发 reset 链接，邮箱不存在也返回 200，避免泄露注册情况
   */
  .post(
    '/forgot-password',
    async ({ body }) => {
      const { email } = body
      const user = await userService.findByEmail(email)

      // 邮箱命中再发邮件；不命中静默 200。出错的话也吞掉，统一 200 不漏信息
      if (user) {
        try {
          // 清掉这个用户旧的 reset-password token，保证只有一条有效
          db.delete(verificationTokens)
            .where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, 'reset-password')))
            .run()
          const token = generateOpaqueToken()
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
          db.insert(verificationTokens)
            .values({ token, userId: user.id, purpose: 'reset-password', expiresAt })
            .run()
          await sendPasswordResetEmail(email, token)
        } catch (err) {
          console.error('forgot-password: failed for', email, err)
          // 故意不暴露细节
        }
      }
      return { success: true, message: '如果该邮箱已注册，我们已发送重置链接' }
    },
    {
      body: requestPasswordResetReqSchema,
      response: { 200: messageRespSchema, 400: errorRespSchema },
    }
  )
  /**
   * 登录态下改密码：必须验当前密码
   */
  .post(
    '/change-password',
    async ({ body, cookie: { sid }, set }) => {
      const session = sid?.value ? sessionService.get(sid.value) : undefined
      if (!session) {
        set.status = 401
        return { error: '未登录' }
      }
      const user = await userService.findById(session.userId)
      if (!user) {
        set.status = 404
        return { error: '用户不存在' }
      }
      if (!userService.verifyPassword(body.currentPassword, user.password)) {
        set.status = 401
        return { error: '当前密码错误' }
      }
      if (body.currentPassword === body.newPassword) {
        set.status = 400
        return { error: '新密码不能与当前密码相同' }
      }
      await userService.updatePassword(user.id, body.newPassword)

      // 改密成功 → 撤销该用户所有 session + 关掉所有 WS（包括当前调用的这一端）。
      // 然后给当前调用方重发一个新 session/cookie，让"自己"无缝继续；其它端被踢。
      // 这是改密的标准安全姿势：怀疑泄露才会改密，旧凭证应该立刻全部失效。
      sessionService.deleteAllForUser(user.id)
      closeAllConnectionsForUser(user.id)
      const newSession = sessionService.create(user.id)
      sid!.set({
        value: newSession.id,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })

      return { success: true, message: '密码已更新；其它已登录设备已被踢下线' }
    },
    {
      body: changePasswordReqSchema,
      response: { 200: messageRespSchema, 400: errorRespSchema, 401: errorRespSchema, 404: errorRespSchema },
      cookie: cookieScheme,
    }
  )
  /**
   * 登录态下发起改邮箱：验当前密码 + 检查新邮箱未被占用 + 发确认链接到新邮箱
   */
  .post(
    '/change-email',
    async ({ body, cookie: { sid }, set }) => {
      const session = sid?.value ? sessionService.get(sid.value) : undefined
      if (!session) {
        set.status = 401
        return { error: '未登录' }
      }
      const user = await userService.findById(session.userId)
      if (!user) {
        set.status = 404
        return { error: '用户不存在' }
      }
      if (!userService.verifyPassword(body.currentPassword, user.password)) {
        set.status = 401
        return { error: '当前密码错误' }
      }
      const newEmail = body.newEmail.trim().toLowerCase()
      if (newEmail === user.email.toLowerCase()) {
        set.status = 400
        return { error: '新邮箱与当前邮箱相同' }
      }
      const taken = await userService.findByEmail(newEmail)
      if (taken && taken.id !== user.id) {
        set.status = 409
        return { error: '该邮箱已被使用' }
      }

      // 清旧 change-email token，保证只有一条有效
      try {
        db.delete(verificationTokens)
          .where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, 'change-email')))
          .run()
      } catch { /* ignore */ }

      const token = generateOpaqueToken()
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      try {
        db.insert(verificationTokens)
          .values({ token, userId: user.id, purpose: 'change-email', newEmail, expiresAt })
          .run()
      } catch (err) {
        console.error('change-email: insert token failed for', user.id, err)
        set.status = 500
        return { error: '服务器错误：无法创建变更凭证' }
      }

      // 给新邮箱发确认链接；给旧邮箱发通知。任一失败都不致命，回 200 提示用户去新邮箱看
      try { await sendEmailChangeConfirmation(newEmail, token) } catch (e) { console.error('confirm email failed', e) }
      try { await sendEmailChangeNotification(user.email, newEmail) } catch (e) { console.error('notify old email failed', e) }

      return { success: true, message: '确认链接已发到新邮箱，30 分钟内点击生效' }
    },
    {
      body: changeEmailReqSchema,
      response: { 200: messageRespSchema, 400: errorRespSchema, 401: errorRespSchema, 404: errorRespSchema, 409: errorRespSchema },
      cookie: cookieScheme,
    }
  )
  /**
   * 改邮箱确认：用户点新邮箱里链接、前端再 POST 过来
   */
  .post(
    '/confirm-email-change',
    async ({ body, set }) => {
      const { token } = body
      const row = db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.token, token), eq(verificationTokens.purpose, 'change-email')))
        .get()
      if (!row) {
        set.status = 400
        return { error: '无效的链接' }
      }
      if (new Date(row.expiresAt) < new Date()) {
        // 顺手删过期 token
        db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run()
        set.status = 400
        return { error: '链接已过期，请重新发起变更' }
      }
      if (!row.newEmail) {
        // 数据不一致 —— 不应该发生，因为 change-email 插入时一定带了 newEmail
        set.status = 500
        return { error: '服务器错误：变更凭证不完整' }
      }
      // 临门检查：变更期间新邮箱可能被别人占了
      const taken = await userService.findByEmail(row.newEmail)
      if (taken && taken.id !== row.userId) {
        db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run()
        set.status = 409
        return { error: '该邮箱已被使用' }
      }
      try {
        db.update(users)
          .set({ email: row.newEmail, updatedAt: new Date() })
          .where(eq(users.id, row.userId))
          .run()
      } catch (err) {
        console.error('confirm-email-change: update users failed for', row.userId, err)
        set.status = 500
        return { error: '服务器错误：无法更新邮箱' }
      }
      db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run()
      return { success: true, message: '邮箱已更新，请用新邮箱登录' }
    },
    {
      body: confirmEmailChangeReqSchema,
      response: { 200: messageRespSchema, 400: errorRespSchema, 409: errorRespSchema, 500: errorRespSchema },
    }
  )

export default userRoutes
