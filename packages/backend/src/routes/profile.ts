import { Elysia, t } from 'elysia';
import { profileService, ProfileService, AVATAR_MAX_BYTES } from '../services/profileService';
import { sessionService } from '../services/sessionService';
import {
  profileRespSchema,
  profileUpdateReqSchema,
  avatarUploadRespSchema,
  errorRespSchema,
  messageRespSchema
} from '@generale/types/dist/api';

const cookieScheme = t.Cookie({
  sid: t.Optional(t.String()),
});

const ALLOWED_AVATAR_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * 用户 profile 相关路由。
 *
 * 设计：
 * - `GET /profile/:userId` —— 公开拉取，任何人都能看；不返回 email/password 等敏感字段
 * - `PATCH /profile/me` —— 当前登录用户改 displayName / bio（文本类）
 * - `POST /profile/avatar` —— 当前登录用户上传新头像（multipart/form-data, 字段名 `file`）
 */
export const profileRoutes = new Elysia({ prefix: '/profile' })
  .get(
    '/:userId',
    async ({ params: { userId } }) => {
      // 单次查 profile，默认头像兜底直接用静态常量，避免再调一次 DB
      const profile = await profileService.getProfile(userId);
      const defaults = ProfileService.defaultAvatarUrls();
      return {
        userId,
        ...(profile?.displayName ? { displayName: profile.displayName } : {}),
        avatarUrl: profile?.avatarUrl || defaults.avatarUrl,
        avatarThumbUrl: profile?.avatarThumbUrl || defaults.avatarThumbUrl,
        ...(profile?.bio ? { bio: profile.bio } : {}),
        ...(profile?.updatedAt ? { updatedAt: profile.updatedAt.toISOString() } : {}),
      };
    },
    {
      response: {
        200: profileRespSchema,
        404: errorRespSchema,
      },
    }
  )
  .patch(
    '/me',
    async ({ body, cookie: { sid }, set }) => {
      const sessionId = sid?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      // 只取允许通过 PATCH 改的几个字段，避免恶意客户端塞 avatarUrl 等
      const patch: Partial<{ displayName: string; bio: string }> = {};
      if (typeof body.displayName === 'string') patch.displayName = body.displayName.trim();
      if (typeof body.bio === 'string') patch.bio = body.bio;

      if (Object.keys(patch).length === 0) {
        return { success: true, message: 'No changes' };
      }
      await profileService.updateProfile(userId, patch);
      return { success: true, message: 'Profile updated successfully' };
    },
    {
      body: profileUpdateReqSchema,
      response: {
        200: messageRespSchema,
        401: errorRespSchema,
      },
      cookie: cookieScheme,
    }
  )
  .post(
    '/avatar',
    async ({ body, cookie: { sid }, set }) => {
      const sessionId = sid?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }

      const file = body.file;
      if (!file) {
        set.status = 400;
        return { error: 'No file provided' };
      }
      if (!ALLOWED_AVATAR_MIME.has(file.type)) {
        set.status = 400;
        return { error: `Unsupported mime type: ${file.type}. Allowed: png/jpeg/webp` };
      }
      if (file.size > AVATAR_MAX_BYTES) {
        set.status = 400;
        return { error: `File too large: ${file.size} bytes (max ${AVATAR_MAX_BYTES})` };
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      let result: { avatarUrl: string; avatarThumbUrl: string };
      try {
        result = await profileService.saveAvatarBytes(userId, bytes, file.type);
      } catch (e: any) {
        // sharp 解码失败 / 维度超限 / mime 不匹配等都走这里
        set.status = 400;
        return { error: e?.message ?? 'Invalid image' };
      }

      return {
        success: true,
        avatarUrl: result.avatarUrl,
        avatarThumbUrl: result.avatarThumbUrl,
        message: 'Avatar uploaded successfully',
      };
    },
    {
      // 用 inline t.Object 让 elysia 自动解析 multipart
      body: t.Object({
        file: t.File({
          // 这里的 maxSize 是 elysia 解析层的硬上限；具体校验在 handler 里再做一次更友好的错误
          maxSize: AVATAR_MAX_BYTES,
          type: ['image/png', 'image/jpeg', 'image/webp'],
        }),
      }),
      response: {
        200: avatarUploadRespSchema,
        400: errorRespSchema,
        401: errorRespSchema,
      },
      cookie: cookieScheme,
    }
  );

export default profileRoutes;
