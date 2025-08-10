import { db } from '../db/client'
import { users } from '../db/schema'
import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto'
import { randomUUIDv7 } from 'bun'
import { eq } from 'drizzle-orm'

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
    const id = randomUUIDv7()
    const now = new Date()
    const hashedPassword = this.hashPassword(password)

    await db.insert(users).values({
      id,
      username,
      email,
      password: hashedPassword,
      verified: false,
      createdAt: now,
      updatedAt: now
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
