import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionService } from '../sessionService';

describe('SessionService', () => {
  const ONE_DAY_SECONDS = 60 * 60 * 24;
  let sessionService: SessionService;
  const userId = 'user-123';

  beforeEach(() => {
    // Use fake timers to control Date.now()
    vi.useFakeTimers();
    sessionService = new SessionService(ONE_DAY_SECONDS);
  });

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers();
  });

  it('should create a new session', () => {
    const session = sessionService.create(userId);

    expect(session).toBeDefined();
    expect(session.userId).toBe(userId);
    expect(session.id).toEqual(expect.any(String));
    expect(session.createdAt.getTime()).toBe(Date.now());
    expect(session.expiresAt.getTime()).toBe(Date.now() + ONE_DAY_SECONDS * 1000);
  });

  it('should get a valid session and renew it', () => {
    const session = sessionService.create(userId);
    
    // Advance time by 1 hour
    vi.advanceTimersByTime(1000 * 60 * 60);
    const newExpectedExpiry = Date.now() + ONE_DAY_SECONDS * 1000;

    const retrievedSession = sessionService.get(session.id);

    expect(retrievedSession).toBeDefined();
    expect(retrievedSession?.id).toBe(session.id);
    expect(retrievedSession?.expiresAt.getTime()).toBe(newExpectedExpiry);
  });

  it('should return undefined for a non-existent session id', () => {
    expect(sessionService.get('non-existent-id')).toBeUndefined();
  });

  it('should return undefined for null or undefined id', () => {
    expect(sessionService.get(null)).toBeUndefined();
    expect(sessionService.get(undefined)).toBeUndefined();
  });

  it('should delete an expired session upon retrieval', () => {
    const session = sessionService.create(userId);

    // Advance time just past the expiration date
    vi.advanceTimersByTime(ONE_DAY_SECONDS * 1000 + 1);

    expect(sessionService.get(session.id)).toBeUndefined();
    
    // Verify it was actually removed internally
    // @ts-expect-error - Accessing private property for testing
    expect(sessionService.sessions.has(session.id)).toBe(false);
  });

  it('should delete a session by id', () => {
    const session = sessionService.create(userId);
    
    // Verify it exists first
    expect(sessionService.get(session.id)).toBeDefined();

    sessionService.delete(session.id);

    // Verify it's gone
    expect(sessionService.get(session.id)).toBeUndefined();
  });
});