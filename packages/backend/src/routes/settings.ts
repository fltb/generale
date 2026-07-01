import { type Elysia, t } from "elysia";
import { db } from "../db/client";
import { userSettings, gameUserSettings } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { sessionService } from "../services/sessionService";
import { GLOBAL_SETTINGS_KEYS } from "@generale/types";

function getUserId(cookie: { sid?: { value?: string } }): string | null {
  const sid = cookie?.sid?.value;
  if (!sid) return null;
  const session = sessionService.get(sid);
  return session?.userId ?? null;
}

export function settingsRoutes(app: Elysia) {
  return app
    .get("/global", async ({ cookie }) => {
      const userId = getUserId(cookie);
      if (!userId) return { success: false, message: "Not authorized" };
      const rows = await db
        .select({ key: userSettings.key, value: userSettings.value })
        .from(userSettings)
        .where(eq(userSettings.userId, userId));
      const result: Record<string, string> = {};
      for (const r of rows) result[r.key] = r.value;
      return { success: true, data: result };
    })
    .patch(
      "/global",
      async ({ cookie, body }) => {
        const userId = getUserId(cookie);
        if (!userId) return { success: false, message: "Not authorized" };
        const now = new Date();
        for (const [key, value] of Object.entries(body as Record<string, string>)) {
          if (!(GLOBAL_SETTINGS_KEYS as readonly string[]).includes(key)) continue;
          await db
            .insert(userSettings)
            .values({ userId, key, value: String(value), updatedAt: now })
            .onConflictDoUpdate({
              target: [userSettings.userId, userSettings.key],
              set: { value: String(value), updatedAt: now },
            });
        }
        return { success: true };
      },
      { body: t.Record(t.String(), t.String()) },
    )
    .get("/game/:gameType", async ({ cookie, params }) => {
      const userId = getUserId(cookie);
      if (!userId) return { success: false, message: "Not authorized" };
      const rows = await db
        .select({ key: gameUserSettings.key, value: gameUserSettings.value })
        .from(gameUserSettings)
        .where(and(eq(gameUserSettings.userId, userId), eq(gameUserSettings.gameType, params.gameType)));
      const result: Record<string, string> = {};
      for (const r of rows) result[r.key] = r.value;
      return { success: true, data: result };
    })
    .patch(
      "/game/:gameType",
      async ({ cookie, params, body }) => {
        const userId = getUserId(cookie);
        if (!userId) return { success: false, message: "Not authorized" };
        const now = Date.now();
        for (const [key, value] of Object.entries(body as Record<string, string>)) {
          await db
            .insert(gameUserSettings)
            .values({ userId, gameType: params.gameType, key, value: String(value), updatedAt: now })
            .onConflictDoUpdate({
              target: [gameUserSettings.userId, gameUserSettings.gameType, gameUserSettings.key],
              set: { value: String(value), updatedAt: now },
            });
        }
        return { success: true };
      },
      { body: t.Record(t.String(), t.String()) },
    );
}
