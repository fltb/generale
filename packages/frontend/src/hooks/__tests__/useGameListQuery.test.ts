import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildListQueryFromFilters } from "../useGameListQuery";

describe("buildListQueryFromFilters", () => {
  it("returns empty query for empty filters", () => {
    const q = buildListQueryFromFilters({});
    expect(q).toEqual({});
  });

  it("passes through valid filter values", () => {
    const q = buildListQueryFromFilters({ status: "lobby", roomName: "test" });
    expect(q.status).toBe("lobby");
    expect(q.roomName).toBe("test");
  });

  it("skips undefined, null, and empty string values", () => {
    const q = buildListQueryFromFilters({
      status: "lobby",
      hostName: undefined,
      hasPassword: null,
      roomName: "",
    } as any);
    expect(q.status).toBe("lobby");
    expect(q.hostName).toBeUndefined();
    expect(q.hasPassword).toBeUndefined();
    expect(q.roomName).toBeUndefined();
  });

  it("includes pagination and sort options", () => {
    const q = buildListQueryFromFilters(
      { status: "lobby" },
      { offset: 10, limit: 25, sortBy: "createdAt", sortOrder: "desc" },
    );
    expect(q.offset).toBe("10");
    expect(q.limit).toBe("25");
    expect(q.sortBy).toBe("createdAt");
    expect(q.sortOrder).toBe("desc");
  });

  it("does not set limit when only offset given (code behavior)", () => {
    const q = buildListQueryFromFilters({}, { offset: 0 });
    expect(q.offset).toBe("0");
    expect(q.limit).toBeUndefined();
  });

  it("converts non-string values to strings", () => {
    const q = buildListQueryFromFilters({}, { offset: 0, limit: 10 });
    expect(typeof q.offset).toBe("string");
    expect(typeof q.limit).toBe("string");
  });
});
