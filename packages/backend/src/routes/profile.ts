import {
  avatarUploadRespSchema,
  errorRespSchema,
  messageRespSchema,
  profileRespSchema,
  profileUpdateReqSchema,
} from "@generale/types";
import { Elysia, t as tSchema } from "elysia";
import { AVATAR_MAX_BYTES, ProfileService, profileService } from "../services/profileService";
import { sessionService } from "../services/sessionService";
import { userSettingsService } from "../services/userSettingsService";
import { userService } from "../services/userService";
import { tForRequest } from "../services/i18n";

const cookieScheme = tSchema.Cookie({
  sid: tSchema.Optional(tSchema.String()),
});

const ALLOWED_AVATAR_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export const profileRoutes = new Elysia({ prefix: "/profile" })
  .get(
    "/:userId",
    async ({ params: { userId }, set }) => {
      let user = await userService.findById(userId);
      if (!user) user = await userService.findByUsername(userId);
      if (!user) {
        set.status = 404;
        return { error: "用户不存在" };
      }

      const profile = await profileService.getProfile(user.id);
      const defaults = ProfileService.defaultAvatarUrls();
      return {
        userId: user.id,
        username: user.username,
        displayName: profile?.displayName || user.username,
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
    },
  )
  .patch(
    "/me",
    async ({ body, cookie: { sid }, set, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const sessionId = sid?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: t("Unauthorized") };
      }
      const patch: Partial<{ displayName: string; bio: string }> = {};
      if (typeof body.displayName === "string") patch.displayName = body.displayName.trim();
      if (typeof body.bio === "string") patch.bio = body.bio;

      if (Object.keys(patch).length === 0) {
        return { success: true, message: t("No changes") };
      }
      await profileService.updateProfile(userId, patch);
      return { success: true, message: t("Profile updated successfully") };
    },
    {
      body: profileUpdateReqSchema,
      response: {
        200: messageRespSchema,
        401: errorRespSchema,
      },
      cookie: cookieScheme,
    },
  )
  .post(
    "/avatar",
    async ({ body, cookie: { sid }, set, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const sessionId = sid?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: t("Unauthorized") };
      }

      const file = body.file;
      if (!file) {
        set.status = 400;
        return { error: t("No file provided") };
      }
      if (!ALLOWED_AVATAR_MIME.has(file.type)) {
        set.status = 400;
        return { error: t("Unsupported file type") };
      }
      if (file.size > AVATAR_MAX_BYTES) {
        set.status = 400;
        return { error: t("File too large") };
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      let result: { avatarUrl: string; avatarThumbUrl: string };
      try {
        result = await profileService.saveAvatarBytes(userId, bytes, file.type);
      } catch (e: unknown) {
        set.status = 400;
        return { error: e instanceof Error ? e.message : t("Invalid image") };
      }

      return {
        success: true,
        avatarUrl: result.avatarUrl,
        avatarThumbUrl: result.avatarThumbUrl,
        message: t("Avatar uploaded successfully"),
      };
    },
    {
      body: tSchema.Object({
        file: tSchema.File({
          maxSize: AVATAR_MAX_BYTES,
          type: ["image/png", "image/jpeg", "image/webp"],
        }),
      }),
      response: {
        200: avatarUploadRespSchema,
        400: errorRespSchema,
        401: errorRespSchema,
      },
      cookie: cookieScheme,
    },
  )
  .get(
    "/settings",
    ({ cookie: { sid }, set }) => {
      const sessionId = sid?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      return userSettingsService.getAll(userId);
    },
    { cookie: cookieScheme, response: tSchema.Record(tSchema.String(), tSchema.String()) },
  )
  .patch(
    "/settings",
    async ({ body, cookie: { sid }, set }) => {
      const sessionId = sid?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      await userSettingsService.set(userId, body.key, body.value);
      return { success: true };
    },
    {
      body: tSchema.Object({ key: tSchema.String(), value: tSchema.String() }),
      cookie: cookieScheme,
    },
  );

export default profileRoutes;
