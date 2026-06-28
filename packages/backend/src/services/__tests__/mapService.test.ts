import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseTags } from "../mapService";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  db: mockDb,
}));

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), rm: vi.fn() }));

import { mapService } from "../mapService";

describe("parseTags", () => {
  it("returns empty array for undefined", () => {
    expect(parseTags(undefined)).toEqual([]);
  });

  it("parses JSON array", () => {
    expect(parseTags('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("splits comma-separated string", () => {
    expect(parseTags("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("filters empty strings from comma-separated", () => {
    expect(parseTags("a,,b")).toEqual(["a", "b"]);
  });
});

describe("mapService CRUD", () => {
  const mockRow = {
    id: "map-1",
    name: "Test Map",
    description: "A test",
    authorId: "user-1",
    width: 20,
    height: 15,
    minPlayers: 2,
    maxPlayers: 4,
    isPublic: true,
    isDraft: false,
    hasCustomThumbnail: false,
    usageCount: 0,
    tags: '["pvp","standard"]',
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
  };

  function mockSelectChain<T>(returnValue: T) {
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), get: vi.fn().mockReturnValue(returnValue) };
    mockDb.select.mockReturnValue(chain);
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMeta", () => {
    it("returns row from db", () => {
      mockSelectChain(mockRow);
      const result = mapService.getMeta("map-1");
      expect(result).toEqual(mockRow);
    });

    it("returns undefined when not found", () => {
      mockSelectChain(undefined);
      const result = mapService.getMeta("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("getMetaOrThrow", () => {
    it("returns row when found", () => {
      mockSelectChain(mockRow);
      expect(mapService.getMetaOrThrow("map-1")).toEqual(mockRow);
    });

    it("throws Response when not found", () => {
      mockSelectChain(undefined);
      expect(() => mapService.getMetaOrThrow("nonexistent")).toThrow(Response);
    });
  });

  describe("create", () => {
    it("inserts a new map", () => {
      const runFn = vi.fn();
      const valuesFn = vi.fn().mockReturnValue({ run: runFn });
      mockDb.insert.mockReturnValue({ values: valuesFn });

      const result = mapService.create("user-1", {
        id: "new-map",
        name: "New Map",
        description: "desc",
        width: 10,
        height: 10,
        tileCount: 100,
        minPlayers: 2,
        maxPlayers: 4,
        isPublic: true,
        isDraft: false,
        tags: ["fun"],
        tiles: [[{} as any]],
      });

      expect(result.id).toBe("new-map");
      expect(runFn).toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("deletes when row exists", () => {
      mockSelectChain(mockRow);
      const runFn = vi.fn();
      mockDb.delete.mockReturnValue({ where: vi.fn().mockReturnValue({ run: runFn }) });

      const result = mapService.delete("map-1");
      expect(result).toBe(true);
      expect(runFn).toHaveBeenCalled();
    });

    it("returns false when row not found", () => {
      mockSelectChain(undefined);
      const result = mapService.delete("nonexistent");
      expect(result).toBe(false);
    });
  });
});
