import { describe, it, expect } from "vitest";
import { applyGameFilters, applyGameSort, paginateGames } from "../gameListFilter";
import type { GameInfoSuccessResp } from "@generale/types/dist/api";

type Game = GameInfoSuccessResp["data"];

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    roomName: "Test Room",
    hostId: "u1",
    hostName: "Alice",
    type: "standard",
    map: "small",
    status: "PREGAME" as const,
    playerCount: 2,
    maxPlayers: 4,
    hasPassword: false,
    ...overrides,
  } as Game;
}

describe("applyGameFilters", () => {
  it("returns all games when no filters", () => {
    const games = [makeGame(), makeGame({ id: "g2" })];
    const result = applyGameFilters(games, {} as any);
    expect(result).toHaveLength(2);
  });

  it("filters by roomName (case-insensitive partial match)", () => {
    const games = [makeGame({ id: "g1", roomName: "Alpha" }), makeGame({ id: "g2", roomName: "Beta" })];
    expect(applyGameFilters(games, { roomName: "alp" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { roomName: "ALPHA" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { roomName: "bet" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { roomName: "gamma" } as any)).toHaveLength(0);
    expect(applyGameFilters(games, { roomName: "" } as any)).toHaveLength(2);
  });

  it("filters by type", () => {
    const games = [makeGame({ type: "standard" }), makeGame({ type: "custom" })];
    expect(applyGameFilters(games, { type: "standard" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { type: "custom" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { type: "coop" } as any)).toHaveLength(0);
  });

  it("filters by status", () => {
    const games = [makeGame({ status: "PREGAME" }), makeGame({ status: "PLAYING" })];
    expect(applyGameFilters(games, { status: "PREGAME" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { status: "PLAYING" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { status: "ENDED" } as any)).toHaveLength(0);
  });

  it("filters by hostName (case-insensitive partial)", () => {
    const games = [makeGame({ hostName: "Alice" }), makeGame({ hostName: "Bob" })];
    expect(applyGameFilters(games, { hostName: "ali" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { hostName: "b" } as any)).toHaveLength(1);
  });

  it("filters by standard map name", () => {
    const games = [makeGame({ map: "small" }), makeGame({ map: "large" as any })];
    expect(applyGameFilters(games, { map: "small" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { map: "large" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { map: "medium" } as any)).toHaveLength(0);
  });

  it("filters by custom map dimensions (WxH)", () => {
    const games = [
      makeGame({ map: { width: 20, height: 12 } }),
      makeGame({ map: "small" }),
    ];
    expect(applyGameFilters(games, { map: "20x12" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { map: "20X12" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { map: "10x10" } as any)).toHaveLength(0);
  });

  it("filters by minPlayers", () => {
    const games = [makeGame({ playerCount: 2 }), makeGame({ playerCount: 4 })];
    expect(applyGameFilters(games, { minPlayers: "3" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { minPlayers: "5" } as any)).toHaveLength(0);
  });

  it("filters by maxPlayers (against playerCount)", () => {
    const games = [makeGame({ playerCount: 2 }), makeGame({ playerCount: 4 })];
    expect(applyGameFilters(games, { maxPlayers: "3" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { maxPlayers: "5" } as any)).toHaveLength(2);
  });

  it("filters by hasPassword", () => {
    const games = [makeGame({ hasPassword: true }), makeGame({ hasPassword: false })];
    expect(applyGameFilters(games, { hasPassword: "true" } as any)).toHaveLength(1);
    expect(applyGameFilters(games, { hasPassword: "false" } as any)).toHaveLength(1);
  });

  it("handles empty game list", () => {
    expect(applyGameFilters([], { roomName: "test" } as any)).toHaveLength(0);
  });
});

describe("applyGameSort", () => {
  it("returns unsorted when no sortBy", () => {
    const games = [makeGame({ id: "g2" }), makeGame({ id: "g1" })];
    const result = applyGameSort(games, {} as any);
    expect(result[0].id).toBe("g2");
  });

  it("sorts by playerCount desc (default)", () => {
    const games = [makeGame({ id: "g1", playerCount: 2 }), makeGame({ id: "g2", playerCount: 4 })];
    const result = applyGameSort(games, { sortBy: "playerCount" } as any);
    expect(result[0].id).toBe("g2");
  });

  it("sorts by playerCount asc", () => {
    const games = [makeGame({ id: "g1", playerCount: 4 }), makeGame({ id: "g2", playerCount: 2 })];
    const result = applyGameSort(games, { sortBy: "playerCount", sortOrder: "asc" } as any);
    expect(result[0].id).toBe("g2");
  });

  it("handles null values in sort field", () => {
    const games = [makeGame({ id: "g1", playerCount: 2 }), makeGame({ id: "g2" } as any)];
    const result = applyGameSort(games, { sortBy: "playerCount" } as any);
    expect(result).toHaveLength(2);
  });

  it("does not mutate original array", () => {
    const games = [makeGame({ id: "g1", playerCount: 2 }), makeGame({ id: "g2", playerCount: 4 })];
    const before = games[0].id;
    applyGameSort(games, { sortBy: "playerCount" } as any);
    expect(games[0].id).toBe(before);
  });
});

describe("paginateGames", () => {
  const games = Array.from({ length: 25 }, (_, i) => makeGame({ id: `g${i}` }));

  it("returns first page with default offset/limit", () => {
    const result = paginateGames(games, {} as any);
    expect(result.total).toBe(25);
    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });

  it("respects custom offset and limit", () => {
    const result = paginateGames(games, { offset: "5", limit: "10" } as any);
    expect(result.items).toHaveLength(10);
    expect(result.items[0].id).toBe("g5");
  });

  it("marks hasMore false on last page", () => {
    const result = paginateGames(games, { offset: "20", limit: "10" } as any);
    expect(result.items).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });

  it("handles empty list", () => {
    const result = paginateGames([], {} as any);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });
});
