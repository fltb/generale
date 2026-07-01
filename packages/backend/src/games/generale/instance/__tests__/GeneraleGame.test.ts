import { describe, it, expect } from "vitest";
import { GeneraleGame } from "../GeneraleGame";
import type { GameState, PlayerId, TeamId } from "@generale/types";
import { GameStatus, PlayerStatus, TileType, SyncedGameClientActionTypes } from "@generale/types";

function mockConn(id: string): any {
  const cbs: Record<string, Function[]> = {};
  const conn: any = {
    onOpen: (cb: Function) => (cbs["open"] = [...(cbs["open"] ?? []), cb]),
    onClose: (cb: Function) => (cbs["close"] = [...(cbs["close"] ?? []), cb]),
    onDisconnect: (cb: Function) => (cbs["disconnect"] = [...(cbs["disconnect"] ?? []), cb]),
    onReconnect: (cb: Function) => (cbs["reconnect"] = [...(cbs["reconnect"] ?? []), cb]),
    onClientMessage: (cb: Function) => (cbs["message"] = [...(cbs["message"] ?? []), cb]),
    send: () => {},
    close: () => { for (const cb of (cbs["close"] ?? [])) cb(); },
    getConnectionId: () => id,
    getContext: () => ({}),
  };
  return conn;
}

function makeGameState(playerCount: number = 2): GameState {
  const width = 10;
  const height = 10;
  const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i + 1}` as PlayerId);
  const teamIds = Array.from({ length: playerCount }, (_, i) => `team${i + 1}` as TeamId);

  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      type: TileType.Plain as const,
      ownerId: null as PlayerId | null,
      army: 0,
    })),
  );

  for (let i = 0; i < playerCount; i++) {
    const pid = playerIds[i]!;
    const t = tiles[i]?.[i];
    if (t) {
      t.ownerId = pid;
      t.army = 5;
    }
  }

  const players: Record<string, any> = {};
  for (let i = 0; i < playerCount; i++) {
    const pid = playerIds[i]!;
    const tid = teamIds[i]!;
    players[pid] = {
      id: pid,
      army: 5,
      land: 1,
      status: PlayerStatus.Playing,
      lastActiveTick: 0,
      teamId: tid,
    };
  }

  const teams: Record<string, any> = {};
  for (let i = 0; i < playerCount; i++) {
    const pid = playerIds[i]!;
    const tid = teamIds[i]!;
    teams[tid] = {
      id: tid,
      memberIds: [pid],
      status: PlayerStatus.Playing,
    };
  }

  return {
    status: GameStatus.Playing,
    tick: 0,
    players,
    teams,
    map: { width, height, tiles },
    settings: {
      tileGrow: {
        [TileType.Plain]: { duration: 10, growth: 1 },
        [TileType.Throne]: { duration: 1, growth: 1 },
        [TileType.Barracks]: { duration: 1, growth: 1 },
        [TileType.Mountain]: { duration: 1e10, growth: 0 },
        [TileType.Swamp]: { duration: 1, growth: -1 },
        [TileType.Fog]: { duration: 1e10, growth: 0 },
      },
      afkThreshold: 200,
    },
  } as GameState;
}

describe("GeneraleGame", () => {
  it("creates with initial state", () => {
    const state = makeGameState(2);
    const gi = new GeneraleGame(state, { playerDisplay: {} }, ["p1", "p2"]);
    expect(gi.getState().status).toBe(GameStatus.Playing);
    gi.destroy();
  });

  it("addPlayer registers connector and canJoin returns success", () => {
    const gi = new GeneraleGame(makeGameState(2), { playerDisplay: {} }, ["p1", "p2"]);
    const r = gi.addPlayer({ id: "p1", name: "P1" }, mockConn("p1"));
    expect(r.success).toBe(true);
    gi.destroy();
  });

  it("addPlayer rejects unknown player", () => {
    const gi = new GeneraleGame(makeGameState(2), { playerDisplay: {} }, ["p1", "p2"]);
    const r = gi.addPlayer({ id: "unknown", name: "X" }, mockConn("unknown"));
    expect(r.success).toBe(false);
    gi.destroy();
  });

  it("addPlayer rejects destroyed instance", () => {
    const gi = new GeneraleGame(makeGameState(2), { playerDisplay: {} }, ["p1", "p2"]);
    gi.destroy();
    const r = gi.addPlayer({ id: "p1", name: "P1" }, mockConn("p1"));
    expect(r.success).toBe(false);
  });

  it("addSpectator works for non-player", () => {
    const gi = new GeneraleGame(makeGameState(2), { playerDisplay: {} }, ["p1", "p2"]);
    const r = gi.addSpectator({ id: "spec1", name: "Spec" }, mockConn("spec1"));
    expect(r.success).toBe(true);
    gi.destroy();
  });

  it("advance processes tick without error", () => {
    const gi = new GeneraleGame(makeGameState(2), { playerDisplay: {} }, ["p1", "p2"]);
    gi.addPlayer({ id: "p1", name: "P1" }, mockConn("p1"));
    gi.addPlayer({ id: "p2", name: "P2" }, mockConn("p2"));
    gi.advance();
    expect(gi.getState().status).toBe(GameStatus.Playing);
    gi.destroy();
  });

  it("surrender triggers end game callbacks", () => {
    return new Promise<void>((done) => {
      const state = makeGameState(2);
      const gi = new GeneraleGame(state, { playerDisplay: {} }, ["p1", "p2"]);
      gi.addPlayer({ id: "p1", name: "P1" }, mockConn("p1"));
      gi.addPlayer({ id: "p2", name: "P2" }, mockConn("p2"));

      gi.onEndGame((result) => {
        expect(result.winnerId).toBe("p2");
        expect(result.reason).toContain("surrender");
        gi.destroy();
        done();
      });

      (gi as any).handleClientEvent?.("p1", { type: SyncedGameClientActionTypes.SURRENDER, optimisticId: 1 });
    });
  });

  it("canJoin returns success for existing player", () => {
    const gi = new GeneraleGame(makeGameState(2), { playerDisplay: {} }, ["p1", "p2"]);
    expect(gi.canJoin("p1").success).toBe(true);
    gi.destroy();
  });

  it("canJoin returns false for destroyed instance", () => {
    const gi = new GeneraleGame(makeGameState(2), { playerDisplay: {} }, ["p1", "p2"]);
    gi.destroy();
    expect(gi.canJoin("p1").success).toBe(false);
  });
});
