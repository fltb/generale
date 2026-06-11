import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * 登录 session 服务。
 *
 * 之前用 in-memory Map，重启即丢；现在落到 sqlite 的 `sessions` 表：
 *  - 服务端平滑重启不掉登录
 *  - 多副本部署共享同一个 DB，session 行为一致
 *  - 反重复登录靠 `deleteAllForUser` —— `/login` 在 create 之前调一下，把该
 *    用户其它端的旧 session 全部踢掉
 *
 * 对外签名（create/get/delete）和老的 SessionService 一样，方便平滑替换。
 *
 * 设计取舍：每个 get() 都做一次 UPDATE 来推 expiresAt（滑动过期）。这条 SQL
 * 量很小，sqlite 单机够用。如果将来量上来了再用 lazy renewal（等 expiresAt
 * 接近 N% 才写）。
 */
export class SessionService {
  private maxAgeMs: number;

  constructor(maxAgeSeconds = 60 * 60 * 24 * 7) {
    this.maxAgeMs = maxAgeSeconds * 1000;
  }

  create(userId: string): Session {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.maxAgeMs);
    db.insert(sessions).values({ id, userId, createdAt: now, expiresAt }).run();
    return { id, userId, createdAt: now, expiresAt };
  }

  /**
   * 拿 session；过期的当不存在并删除；没过期顺手刷一次 expiresAt（滑动续期）。
   * 同步签名，避免上游全部改成 async。
   */
  get(id: string | undefined | null): Session | undefined {
    if (!id) return undefined;
    const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!row) return undefined;

    const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
    if (expiresAt.getTime() <= Date.now()) {
      // 过期 → 顺手清掉
      try { db.delete(sessions).where(eq(sessions.id, id)).run(); } catch { /* ignore */ }
      return undefined;
    }

    // 滑动续期
    const newExpiresAt = new Date(Date.now() + this.maxAgeMs);
    try {
      db.update(sessions).set({ expiresAt: newExpiresAt }).where(eq(sessions.id, id)).run();
    } catch (err) {
      // 写失败不影响 read；记一行 log
      console.warn('[sessionService.get] failed to slide expiresAt for', id, err);
    }

    return {
      id: row.id,
      userId: row.userId,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      expiresAt: newExpiresAt,
    };
  }

  delete(id: string) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
  }

  /**
   * 删除该用户所有 session —— 反重复登录核心：新登录调用一次，旧端下次请求 401。
   */
  deleteAllForUser(userId: string) {
    db.delete(sessions).where(eq(sessions.userId, userId)).run();
  }

  /**
   * 维护用：删除已过期的所有 session。可以挂个 cron / 启动期跑一次。
   * 不放进 get 的 hot path 以避免无谓写放大。
   */
  pruneExpired() {
    const all = db.select().from(sessions).all();
    const now = Date.now();
    let removed = 0;
    for (const row of all) {
      const exp = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime();
      if (exp <= now) {
        db.delete(sessions).where(eq(sessions.id, row.id)).run();
        removed++;
      }
    }
    return removed;
  }
}

export const sessionService = new SessionService();
