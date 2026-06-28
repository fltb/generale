import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { userSettings } from "../db/schema";

export class UserSettingsService {
  getAll(userId: string): Record<string, string> {
    const rows = db.select().from(userSettings)
      .where(eq(userSettings.userId, userId))
      .all();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async set(userId: string, key: string, value: string): Promise<void> {
    const now = new Date();
    await db.insert(userSettings)
      .values({ userId, key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.key],
        set: { value, updatedAt: now },
      })
      .run();
  }
}

export const userSettingsService = new UserSettingsService();
