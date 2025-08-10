import { randomUUIDv7 } from "bun";

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Very small in-memory session store. In production you would back this with
 * Redis or a database table. For tests and local dev an in-memory map keeps
 * things simple.
 */
class SessionService {
  private sessions = new Map<string, Session>();
  private maxAgeMs: number;

  constructor(maxAgeSeconds = 60 * 60 * 24 * 7) {
    this.maxAgeMs = maxAgeSeconds * 1000;
  }

  create(userId: string): Session {
    const id = randomUUIDv7();
    const now = new Date();
    const session: Session = {
      id,
      userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.maxAgeMs)
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * Get a session by id and automatically renew/expire old sessions.
   */
  get(id: string | undefined | null): Session | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    // Auto-renew if session is still valid
    if (session.expiresAt.getTime() > Date.now()) {
      session.expiresAt = new Date(Date.now() + this.maxAgeMs);
      return session;
    }
    
    // Delete expired session
    this.sessions.delete(id);
    return undefined;
  }

  delete(id: string) {
    this.sessions.delete(id);
  }
}

export const sessionService = new SessionService();
