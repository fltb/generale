import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGameApi, getGameInfoApi, listGamesApi, prepareConnectApi } from "../gameApi";

function mockFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

beforeEach(() => vi.restoreAllMocks());

describe("createGameApi", () => {
  it("POST /api/game/create", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { gameId: "g1" } }));
    const res = await createGameApi({ mapId: "m1", maxPlayers: 4 } as any);
    expect((res as any).data.gameId).toBe("g1");
  });
});

describe("getGameInfoApi", () => {
  it("GET /api/game/info/:id", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { id: "g1", status: "PREGAME" } }));
    const res = await getGameInfoApi("g1");
    expect((res as any).data.id).toBe("g1");
  });
});

describe("listGamesApi", () => {
  it("GET /api/game/list", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { games: [] } }));
    const res = await listGamesApi();
    expect(Array.isArray((res as any).data.games)).toBe(true);
  });

  it("includes query params when provided", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ data: { games: [] } })),
    });
    vi.stubGlobal("fetch", fn);

    await listGamesApi({ page: "1", limit: "20" } as any);
    const url = fn.mock.calls[0][0];
    expect(url).toContain("page=1");
    expect(url).toContain("limit=20");
  });
});

describe("prepareConnectApi", () => {
  it("GET /api/game/connect/:id", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { domains: { primary: "game-abc" }, phase: "PREGAME" } }));
    const res = await prepareConnectApi("g1");
    expect((res as any).data.domains.primary).toBe("game-abc");
  });
});
