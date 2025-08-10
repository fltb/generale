import { db } from '../db/client';
import { profiles } from '../db/schema';
import { eq } from 'drizzle-orm';

export class ProfileService {
  async getProfile(userId: string) {
    return db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    await db
      .insert(profiles)
      .values({ userId, avatarUrl })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { avatarUrl }
      })
      .run();
  }

  async updateBio(userId: string, bio: string) {
    await db
      .insert(profiles)
      .values({ userId, bio })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { bio }
      })
      .run();
  }

  async updateProfile(userId: string, updates: Partial<{ avatarUrl: string; bio: string }>) {
    await db
      .insert(profiles)
      .values({ userId, ...updates })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: updates
      })
      .run();
  }
}

export const profileService = new ProfileService();
