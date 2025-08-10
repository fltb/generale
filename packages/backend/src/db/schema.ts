import { 
  sqliteTable, 
  text, 
  integer 
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'

export const users = sqliteTable('users', {
  // Store UUIDs as TEXT; generate by default in JS
  id: text('id')
    .primaryKey()
    .notNull()
    .$defaultFn(() => randomUUID()),

  username: text('username')
    .notNull(),

  email: text('email')
    .notNull(),

  password: text('password')
    .notNull(),

  // Boolean stored as 0/1
  verified: integer('verified', { mode: 'boolean' })
    .notNull()
    .default(false),

  // Timestamps stored as integer (ms since epoch) or use CURRENT_TIMESTAMP
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),

  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`)
})

export const verificationTokens = sqliteTable('verification_tokens', {
  token: text('token')
    .primaryKey()
    .notNull(),

  // Reference user.id (TEXT)
  userId: text('user_id')
    .notNull()
    .references(() => users.id),

  expiresAt: integer('expires_at', { mode: 'timestamp' })
    .notNull()
})

// User profiles
export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`(CURRENT_TIMESTAMP)`),
});
