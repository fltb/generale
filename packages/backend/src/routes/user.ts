import {
  changeEmailReqSchema,
  changePasswordReqSchema,
  changeUsernameReqSchema,
  changeUsernameRespSchema,
  confirmEmailChangeReqSchema,
  errorRespSchema,
  loginReqSchema,
  logoutRespSchema,
  messageRespSchema,
  passwordResetTokenRespSchema,
  registerReqSchema,
  requestPasswordResetReqSchema,
  resetPasswordReqSchema,
  userSuccessRespSchema,
  verifyReqSchema,
} from "@generale/types";
import { and, eq } from "drizzle-orm";
import { Elysia, t as tSchema } from "elysia";
import { db } from "../db/client";
import { users, verificationTokens } from "../db/schema";
import { closeAllConnectionsForUser } from "../plugins/websocket";
import {
  sendEmailChangeConfirmation,
  sendEmailChangeNotification,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/emailService";
import { ProfileService, profileService } from "../services/profileService";
import { sessionService } from "../services/sessionService";
import { userService } from "../services/userService";
import { tForRequest } from "../services/i18n";

function generateOpaqueToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export const cookieScheme = tSchema.Cookie({
  sid: tSchema.Optional(tSchema.String()),
});

async function buildSelfUserView(user: {
  id: string;
  username: string;
  email: string;
  usernameChangedAt: Date | null;
}) {
  const profile = await profileService.getProfile(user.id);
  const defaults = ProfileService.defaultAvatarUrls();
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    ...(profile?.displayName ? { displayName: profile.displayName } : {}),
    avatarUrl: profile?.avatarUrl || defaults.avatarUrl,
    avatarThumbUrl: profile?.avatarThumbUrl || defaults.avatarThumbUrl,
    ...(profile?.bio ? { bio: profile.bio } : {}),
    ...(user.usernameChangedAt ? { usernameChangedAt: user.usernameChangedAt.toISOString() } : {}),
  };
}

export const userRoutes = new Elysia()
  .post(
    "/register",
    async ({ body, set, request }) => {
      const t = tForRequest({ request });
      const { username, password, email } = body;

      const usernameOwner = await userService.findByUsername(username);
      if (usernameOwner) {
        if (usernameOwner.verified) {
          set.status = 409;
          return { error: t("Username already exists") };
        }
        try {
          await userService.delete(usernameOwner.id);
          console.info(
            `register: cleared abandoned unverified user ${usernameOwner.id} (username=${usernameOwner.username}) to free username`,
          );
        } catch (err) {
          console.error("Failed to delete abandoned unverified user during register:", usernameOwner.id, err);
          set.status = 500;
          return { error: t("Server error: failed to clear expired registration") };
        }
      }

      const existing = await userService.findByEmail(email);

      if (existing) {
        if (existing.verified) {
          set.status = 409;
          return { error: t("Email already registered") };
        }

        try {
          db.delete(verificationTokens)
            .where(and(eq(verificationTokens.userId, existing.id), eq(verificationTokens.purpose, "register")))
            .run();
        } catch (err) {
          console.error("Failed to delete old verification tokens for overwrite-register:", existing.id, err);
        }

        try {
          await userService.updatePassword(existing.id, password);
        } catch (err) {
          console.error("Failed to update password during overwrite-register for user", existing.id, err);
          set.status = 500;
          return { error: t("Server error: failed to update password") };
        }

        if (existing.username !== username) {
          try {
            db.update(users).set({ username }).where(eq(users.id, existing.id)).run();
          } catch (err) {
            console.error("Failed to update username during overwrite-register for user", existing.id, err);
            set.status = 500;
            return { error: t("Server error: failed to update username") };
          }
        }

        try {
          db.update(users).set({ verified: false, updatedAt: new Date() }).where(eq(users.id, existing.id)).run();
        } catch (err) {
          console.error("Failed to reset verified flag/updatedAt during overwrite-register for user", existing.id, err);
          set.status = 500;
          return { error: t("Server error: failed to update user status") };
        }

        const code = generateOpaqueToken();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        try {
          db.insert(verificationTokens)
            .values({ token: code, userId: existing.id, purpose: "register", expiresAt })
            .run();
        } catch (err) {
          console.error("Failed to insert new verification token for overwrite-register:", existing.id, err);
          set.status = 500;
          return { error: t("Server error: failed to create verification token") };
        }

        try {
          await sendVerificationEmail(email, code);
        } catch (err) {
          console.error("Failed to send verification email (overwrite-register):", email, err);
          return { success: true, message: t("Updated user with new verification code") };
        }

        return { success: true, message: t("Updated user with new info; verification email sent") };
      }

      const user = await userService.create(username, password, email);

      const code = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      try {
        db.insert(verificationTokens).values({ token: code, userId: user.id, purpose: "register", expiresAt }).run();
      } catch (err) {
        console.error("Failed to insert verification token for new user:", user.id, err);
        set.status = 500;
        return { error: t("Server error: failed to create verification token") };
      }

      try {
        await sendVerificationEmail(email, code);
      } catch (err) {
        console.error("Failed to send verification email for new user:", email, err);
        return { success: true, message: t("Registration successful but failed to send verification email") };
      }

      return { success: true, message: t("Verification code sent to email") };
    },
    {
      body: registerReqSchema,
      response: {
        200: messageRespSchema,
        409: errorRespSchema,
      },
    },
  )
  .post(
    "/verify",
    async ({ body, set, request }) => {
      const t = tForRequest({ request });
      const { token } = body;

      const row = db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.token, token), eq(verificationTokens.purpose, "register")))
        .get();

      if (!row) {
        set.status = 400;
        return { error: t("Invalid verification link") };
      }

      const expiresAt = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime();
      if (expiresAt < Date.now()) {
        try {
          db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run();
        } catch (err) {
          console.error("Failed to delete expired verification token", err);
        }
        try {
          await userService.delete(row.userId);
        } catch (err) {
          console.error("Failed to delete unverified (expired) user", row.userId, err);
        }
        set.status = 400;
        return { error: t("Verification link expired, please register again") };
      }

      await userService.markVerified(row.userId);
      try {
        db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run();
      } catch (err) {
        console.error("Failed to delete verification token after success", err);
      }

      return { success: true, message: t("Email verified successfully, you can log in") };
    },
    {
      body: verifyReqSchema,
      response: {
        200: messageRespSchema,
        400: errorRespSchema,
      },
    },
  )
  .post(
    "/login",
    async ({ body, cookie: { sid }, set, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const { username, password } = body;
      let user = await userService.findByUsername(username);
      if (!user) {
        user = await userService.findByEmail(username);
      }
      if (!user) {
        set.status = 401;
        return { error: t("User not found") };
      }
      if (!userService.verifyPassword(password, user.password)) {
        set.status = 401;
        return { error: t("Invalid credentials") };
      }
      sessionService.deleteAllForUser(user.id);
      closeAllConnectionsForUser(user.id);
      const session = sessionService.create(user.id);

      sid?.set({
        value: session.id,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      return { user: await buildSelfUserView(user) };
    },
    {
      body: loginReqSchema,
      response: {
        200: userSuccessRespSchema,
        401: errorRespSchema,
      },
    },
  )
  .patch(
    "/me/username",
    async ({ body, cookie: { sid }, set, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const session = sid?.value ? sessionService.get(sid.value) : undefined;
      if (!session) {
        set.status = 401;
        return { error: t("Not logged in") };
      }
      try {
        const result = await userService.updateUsername(session.userId, body.username);
        return { username: result.username, usernameChangedAt: result.usernameChangedAt.toISOString() };
      } catch (err: unknown) {
        set.status = 400;
        return { error: err instanceof Error ? t(err.message as "Not logged in") : t("Update failed") };
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
    },
  )
  .post(
    "/logout",
    ({ cookie: { sid } }) => {
      if (sid?.value) {
        const session = sessionService.get(sid.value);
        sessionService.delete(sid.value);
        if (session) {
          closeAllConnectionsForUser(session.userId);
        }
        sid.set({
          value: "",
          path: "/",
          expires: new Date(0),
        });
      }
      return { ok: true };
    },
    {
      response: {
        200: logoutRespSchema,
      },
      cookie: cookieScheme,
    },
  )
  .get(
    "/me",
    async ({ cookie: { sid }, set, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const session = sid?.value ? sessionService.get(sid.value) : undefined;
      if (!session) {
        set.status = 401;
        return { error: t("Unauthorized") };
      }
      const user = await userService.findById(session.userId);
      if (!user) {
        set.status = 404;
        return { error: t("User not found") };
      }
      return { user: await buildSelfUserView(user) };
    },
    {
      response: {
        200: userSuccessRespSchema,
        401: errorRespSchema,
        404: errorRespSchema,
      },
      cookie: cookieScheme,
    },
  )
  .post(
    "/reset-password",
    async ({ body, set, request }) => {
      const t = tForRequest({ request });
      const { token, newPassword } = body;

      const verificationToken = db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.token, token), eq(verificationTokens.purpose, "reset-password")))
        .get();

      if (!verificationToken || new Date(verificationToken.expiresAt) < new Date()) {
        set.status = 400;
        return { error: t("Invalid or expired reset link"), valid: false };
      }

      await userService.updatePassword(verificationToken.userId, newPassword);
      db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run();

      return { success: true, message: t("Password reset successfully"), valid: true };
    },
    {
      body: resetPasswordReqSchema,
      response: {
        200: passwordResetTokenRespSchema,
        400: errorRespSchema,
      },
    },
  )
  .post(
    "/forgot-password",
    async ({ body, request }) => {
      const t = tForRequest({ request });
      const { email } = body;
      const user = await userService.findByEmail(email);

      if (user) {
        try {
          db.delete(verificationTokens)
            .where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, "reset-password")))
            .run();
          const token = generateOpaqueToken();
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
          db.insert(verificationTokens).values({ token, userId: user.id, purpose: "reset-password", expiresAt }).run();
          await sendPasswordResetEmail(email, token);
        } catch (err) {
          console.error("forgot-password: failed for", email, err);
        }
      }
      return { success: true, message: t("Reset link sent if email registered") };
    },
    {
      body: requestPasswordResetReqSchema,
      response: { 200: messageRespSchema, 400: errorRespSchema },
    },
  )
  .post(
    "/change-password",
    async ({ body, cookie: { sid }, set, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const session = sid?.value ? sessionService.get(sid.value) : undefined;
      if (!session) {
        set.status = 401;
        return { error: t("Not logged in") };
      }
      const user = await userService.findById(session.userId);
      if (!user) {
        set.status = 404;
        return { error: t("User not found") };
      }
      if (!userService.verifyPassword(body.currentPassword, user.password)) {
        set.status = 401;
        return { error: t("Current password is incorrect") };
      }
      if (body.currentPassword === body.newPassword) {
        set.status = 400;
        return { error: t("New password cannot be the same as current password") };
      }
      await userService.updatePassword(user.id, body.newPassword);

      sessionService.deleteAllForUser(user.id);
      closeAllConnectionsForUser(user.id);
      const newSession = sessionService.create(user.id);
      sid?.set({
        value: newSession.id,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });

      return { success: true, message: t("Password updated; other devices logged out") };
    },
    {
      body: changePasswordReqSchema,
      response: { 200: messageRespSchema, 400: errorRespSchema, 401: errorRespSchema, 404: errorRespSchema },
      cookie: cookieScheme,
    },
  )
  .post(
    "/change-email",
    async ({ body, cookie: { sid }, set, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const session = sid?.value ? sessionService.get(sid.value) : undefined;
      if (!session) {
        set.status = 401;
        return { error: t("Not logged in") };
      }
      const user = await userService.findById(session.userId);
      if (!user) {
        set.status = 404;
        return { error: t("User not found") };
      }
      if (!userService.verifyPassword(body.currentPassword, user.password)) {
        set.status = 401;
        return { error: t("Current password is incorrect") };
      }
      const newEmail = body.newEmail.trim().toLowerCase();
      if (newEmail === user.email.toLowerCase()) {
        set.status = 400;
        return { error: t("New email is the same as current email") };
      }
      const taken = await userService.findByEmail(newEmail);
      if (taken && taken.id !== user.id) {
        set.status = 409;
        return { error: t("Email already in use") };
      }

      try {
        db.delete(verificationTokens)
          .where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, "change-email")))
          .run();
      } catch {
        /* ignore */
      }

      const token = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      try {
        db.insert(verificationTokens)
          .values({ token, userId: user.id, purpose: "change-email", newEmail, expiresAt })
          .run();
      } catch (err) {
        console.error("change-email: insert token failed for", user.id, err);
        set.status = 500;
        return { error: t("Server error: failed to create change token") };
      }

      try {
        await sendEmailChangeConfirmation(newEmail, token);
      } catch (e) {
        console.error("confirm email failed", e);
      }
      try {
        await sendEmailChangeNotification(user.email, newEmail);
      } catch (e) {
        console.error("notify old email failed", e);
      }

      return { success: true, message: t("Confirmation link sent to new email") };
    },
    {
      body: changeEmailReqSchema,
      response: {
        200: messageRespSchema,
        400: errorRespSchema,
        401: errorRespSchema,
        404: errorRespSchema,
        409: errorRespSchema,
      },
      cookie: cookieScheme,
    },
  )
  .post(
    "/confirm-email-change",
    async ({ body, set, request }) => {
      const t = tForRequest({ request });
      const { token } = body;
      const row = db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.token, token), eq(verificationTokens.purpose, "change-email")))
        .get();
      if (!row) {
        set.status = 400;
        return { error: t("Invalid link") };
      }
      if (new Date(row.expiresAt) < new Date()) {
        db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run();
        set.status = 400;
        return { error: t("Link expired, please restart the process") };
      }
      if (!row.newEmail) {
        set.status = 500;
        return { error: t("Server error: incomplete change token") };
      }
      const taken = await userService.findByEmail(row.newEmail);
      if (taken && taken.id !== row.userId) {
        db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run();
        set.status = 409;
        return { error: t("Email already in use") };
      }
      try {
        db.update(users).set({ email: row.newEmail, updatedAt: new Date() }).where(eq(users.id, row.userId)).run();
      } catch (err) {
        console.error("confirm-email-change: update users failed for", row.userId, err);
        set.status = 500;
        return { error: t("Server error: failed to update email") };
      }
      db.delete(verificationTokens).where(eq(verificationTokens.token, token)).run();
      return { success: true, message: t("Email updated, please log in with new email") };
    },
    {
      body: confirmEmailChangeReqSchema,
      response: { 200: messageRespSchema, 400: errorRespSchema, 409: errorRespSchema, 500: errorRespSchema },
    },
  );

export default userRoutes;
