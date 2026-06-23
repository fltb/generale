import { db } from '../db/client'
import { users, profiles } from '../db/schema'
import { verificationTokens } from '../db/schema' // 用于删除 token
import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { DEFAULT_AVATAR_THUMB_URL, DEFAULT_AVATAR_URL } from './profileService'

export interface User {
  id: string
  username: string
  email: string
  password: string
  verified: boolean
  createdAt: Date
  updatedAt: Date
}

export class UserService {
  /**
   * Hash and salt password using PBKDF2.
   */
  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex')
    const hash = pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex')
    return `${salt}$${hash}`
  }

  /**
   * Compare raw password against stored hash.
   */
  verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split('$')
    if (!salt || !hash) return false
    const calcHash = pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex')
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calcHash, 'hex'))
  }

  /**
   * Create a new user record.
   */
  async create(
    username: string,
    password: string,
    email: string
  ): Promise<User> {
    const id = randomUUID()
    const now = new Date()
    const hashedPassword = this.hashPassword(password)

    db.insert(users).values({
      id,
      username,
      email,
      password: hashedPassword,
      verified: false,
      createdAt: now,
      updatedAt: now
    }).run()

    // 顺手建一行 profile，displayName 默认 = username。
    // 这样新用户一注册就有 displayName，下游全链路（/me、WS context、PlayerList）
    // 直接拿到字符串值，不用再做 "?? username" 兜底。
    db.insert(profiles).values({
      userId: id,
      displayName: username,
      avatarUrl: DEFAULT_AVATAR_URL,
      avatarThumbUrl: DEFAULT_AVATAR_THUMB_URL,
      updatedAt: now,
    }).run()

    return { id, username, email, password: hashedPassword, verified: false, createdAt: now, updatedAt: now }
  }

  /**
   * Find user by primary key.
   */
  async findById(id: string): Promise<User | undefined> {
    const row = await db.select().from(users).where(eq(users.id, id)).get()
    return row ? this.map(row) : undefined
  }

  /**
   * Find user by username.
   */
  async findByUsername(username: string): Promise<User | undefined> {
    const row = await db.select().from(users).where(eq(users.username, username)).get()
    return row ? this.map(row) : undefined
  }

  /**
   * Find user by email.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const row = await db.select().from(users).where(eq(users.email, email)).get()
    return row ? this.map(row) : undefined
  }

  /**
   * Mark user as verified.
   */
  async markVerified(id: string): Promise<void> {
    const now = new Date()
    await db.update(users)
      .set({ verified: true, updatedAt: now })
      .where(eq(users.id, id))
      .run()
  }

    async isVerified(id: string): Promise<boolean> {
    const row = db.select({ verified: users.verified }).from(users).where(eq(users.id, id)).get()
    if (!row) return false
    return Boolean(row.verified)
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
  async delete(userId: string): Promise<void> {
    try {
      // delete verification tokens for user
      try {
        db.delete(verificationTokens).where(eq(verificationTokens.userId, userId)).run()
      } catch (err) {
        console.warn('userService.delete: failed to delete verificationTokens for', userId, err)
      }
      // delete the user row
      db.delete(users).where(eq(users.id, userId)).run()
      console.info(`userService.delete: removed user ${userId}`)
    } catch (err) {
      console.error('userService.delete: failed to remove user', userId, err)
      throw err
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = this.hashPassword(newPassword);
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId))
      .run();
  }

  /**
   * Map raw DB row to User.
   */
  private map(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      verified: Boolean(row.verified),
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)
    }
  }
}

/**
 * Singleton instance of UserService
 */
export const userService = new UserService()
