import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "../sessionService";

describe("SessionService", () => {
  const ONE_DAY_SECONDS = 60 * 60 * 24;
  let sessionService: SessionService;
  const userId = "user-123";

  beforeEach(() => {
    vi.useFakeTimers();
    sessionService = new SessionService(ONE_DAY_SECONDS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a new session", () => {
    const session = sessionService.create(userId);

    expect(session).toBeDefined();
    expect(session.userId).toBe(userId);
    expect(session.id).toEqual(expect.any(String));
    expect(session.createdAt.getTime()).toBe(Date.now());
    expect(session.expiresAt.getTime()).toBe(Date.now() + ONE_DAY_SECONDS * 1000);
  });

  it("should return undefined for a non-existent session id", () => {
    expect(sessionService.get("non-existent-id")).toBeUndefined();
  });

  it("should return undefined for null or undefined id", () => {
    expect(sessionService.get(null)).toBeUndefined();
    expect(sessionService.get(undefined)).toBeUndefined();
  });
});
