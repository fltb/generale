import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { eq, type InferSelectModel } from "drizzle-orm";
import { db } from "../db/client";
import { profiles, users, verificationTokens } from "../db/schema";
import { DEFAULT_AVATAR_THUMB_URL, DEFAULT_AVATAR_URL } from "./profileService";

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  usernameChangedAt: Date | null;
}

/** username 允许的字符集 + 频率限制 */
export const USERNAME_MIN_LEN = 3;
export const USERNAME_MAX_LEN = 50;
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
export const USERNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export class UserService {
  /**
   * Hash and salt password using PBKDF2.
   */
  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(password, salt, 1000, 32, "sha256").toString("hex");
    return `${salt}$${hash}`;
  }

  /**
   * Compare raw password against stored hash.
   */
  verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split("$");
    if (!(salt && hash)) return false;
    const calcHash = pbkdf2Sync(password, salt, 1000, 32, "sha256").toString("hex");
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calcHash, "hex"));
  }

  /**
   * Create a new user record.
   */
  create(username: string, password: string, email: string): User {
    const id = randomUUID();
    const now = new Date();
    const hashedPassword = this.hashPassword(password);

    db.insert(users)
      .values({
        id,
        username,
        email,
        password: hashedPassword,
        verified: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // 顺手建一行 profile，displayName 默认 = username。
    // 这样新用户一注册就有 displayName，下游全链路（/me、WS context、PlayerList）
    // 直接拿到字符串值，不用再做 "?? username" 兜底。
    db.insert(profiles)
      .values({
        userId: id,
        displayName: username,
        avatarUrl: DEFAULT_AVATAR_URL,
        avatarThumbUrl: DEFAULT_AVATAR_THUMB_URL,
        updatedAt: now,
      })
      .run();

    return {
      id,
      username,
      email,
      password: hashedPassword,
      verified: false,
      createdAt: now,
      updatedAt: now,
      usernameChangedAt: null,
    };
  }

  /**
   * Find user by primary key.
   */
  async findById(id: string): Promise<User | undefined> {
    const row = await db.select().from(users).where(eq(users.id, id)).get();
    return row ? this.map(row) : undefined;
  }

  /**
   * Find user by username.
   */
  async findByUsername(username: string): Promise<User | undefined> {
    const row = await db.select().from(users).where(eq(users.username, username)).get();
    return row ? this.map(row) : undefined;
  }

  /**
   * Find user by email.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const row = await db.select().from(users).where(eq(users.email, email)).get();
    return row ? this.map(row) : undefined;
  }

  /**
   * Mark user as verified.
   */
  async markVerified(id: string): Promise<void> {
    const now = new Date();
    await db.update(users).set({ verified: true, updatedAt: now }).where(eq(users.id, id)).run();
  }

  isVerified(id: string): boolean {
    const row = db.select({ verified: users.verified }).from(users).where(eq(users.id, id)).get();
    if (!row) return false;
    return Boolean(row.verified);
  }

  /**
   * Delete a user and related records.
   *
   * IMPORTANT: currently this removes verificationTokens and the users row.
   * If your system keeps other per-user data (sessions, profiles, game records, etc.)
   * you SHOULD delete those here as well to avoid orphaned rows.
   *
   * If you prefer transactional deletion and your DB client supports transactions,
   * wrap these operations in a transaction.
   */
  delete(userId: string): void {
    try {
      // delete verification tokens for user
      try {
        db.delete(verificationTokens).where(eq(verificationTokens.userId, userId)).run();
      } catch (err) {
        console.warn("userService.delete: failed to delete verificationTokens for", userId, err);
      }
      // delete the user row
      db.delete(users).where(eq(users.id, userId)).run();
      console.info(`userService.delete: removed user ${userId}`);
    } catch (err) {
      console.error("userService.delete: failed to remove user", userId, err);
      throw err;
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = this.hashPassword(newPassword);
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId)).run();
  }

  /**
   * 修改 username（受频率限制 + 防重名）。
   * 返回 nextAvailableAt：下一次可以修改的时间，供前端展示"X 天后可改"。
   */
  async updateUsername(userId: string, newUsername: string): Promise<{ username: string; usernameChangedAt: Date }> {
    const user = await this.findById(userId);
    if (!user) throw new Error("User not found");

    if (typeof newUsername !== "string" || newUsername.trim().length < USERNAME_MIN_LEN) {
      throw new Error(`用户名至少 ${USERNAME_MIN_LEN} 个字符`);
    }
    if (newUsername.trim().length > USERNAME_MAX_LEN) {
      throw new Error(`用户名最多 ${USERNAME_MAX_LEN} 个字符`);
    }
    if (!USERNAME_PATTERN.test(newUsername.trim())) {
      throw new Error("用户名只允许字母、数字、点号和短杠");
    }

    // 频率检查
    if (user.usernameChangedAt) {
      const elapsed = Date.now() - user.usernameChangedAt.getTime();
      if (elapsed < USERNAME_CHANGE_COOLDOWN_MS) {
        const waitDays = Math.ceil((USERNAME_CHANGE_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
        throw new Error(`${waitDays} 天后才能再次修改用户名`);
      }
    }

    // 重名检查
    const existing = await this.findByUsername(newUsername.trim());
    if (existing && existing.id !== userId) {
      throw new Error("该用户名已被使用");
    }

    const now = new Date();
    await db
      .update(users)
      .set({ username: newUsername.trim(), usernameChangedAt: now, updatedAt: now })
      .where(eq(users.id, userId))
      .run();

    return { username: newUsername.trim(), usernameChangedAt: now };
  }

  /**
   * Map raw DB row to User.
   */
  private map(row: InferSelectModel<typeof users>): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      verified: Boolean(row.verified),
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
      usernameChangedAt:
        row.usernameChangedAt instanceof Date
          ? row.usernameChangedAt
          : row.usernameChangedAt != null
            ? new Date(row.usernameChangedAt)
            : null,
    };
  }
}

/**
 * Singleton instance of UserService
 */
export const userService = new UserService();
