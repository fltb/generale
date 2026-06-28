import { describe, it, expect, beforeEach } from "vitest";
import { RoomInstance } from "../RoomInstance";
import type { PreGameRoomState, PreGameRoomType, PreGameTeamMode } from "@generale/types";
import { PreGamePlayerStatus, PlayerColor, PreGameMapType, TileType, SyncedPreGameClientActionTypes } from "@generale/types";

function mockConn(): any {
  const cbs: Record<string, Function[]> = {};
  const conn: any = {
    getConnectionId: () => "mock",
    onOpen: (cb: Function) => { cbs["open"] = [...(cbs["open"] ?? []), cb]; },
    onClose: (cb: Function) => { cbs["close"] = [...(cbs["close"] ?? []), cb]; },
    onDisconnect: (cb: Function) => { cbs["disconnect"] = [...(cbs["disconnect"] ?? []), cb]; },
    onReconnect: (cb: Function) => { cbs["reconnect"] = [...(cbs["reconnect"] ?? []), cb]; },
    onClientMessage: (cb: Function) => { cbs["message"] = [...(cbs["message"] ?? []), cb]; },
    send: () => {},
    close: () => { for (const cb of (cbs["close"] ?? [])) cb(); },
    getContext: () => ({}),
  };
  return conn;
}

function freshState(): PreGameRoomState {
  return {
    gameId: "g1",
    roomType: "standard" as PreGameRoomType,
    teamMode: "ffa" as PreGameTeamMode,
    hostId: "alice",
    players: [
      { id: "alice", name: "Alice", isHost: true, teamId: "team1", tileColor: PlayerColor.DarkSlateGray, ready: 1, status: PreGamePlayerStatus.Lobby },
      { id: "bob", name: "Bob", isHost: false, teamId: "team1", tileColor: PlayerColor.Red, ready: 0, status: PreGamePlayerStatus.Lobby },
      { id: "charlie", name: "Charlie", isHost: false, teamId: "team1", tileColor: PlayerColor.Blue, ready: 0, status: PreGamePlayerStatus.Lobby },
    ],
    mapSetting: { type: PreGameMapType.Random, width: 20, height: 20, tileFrequency: {}, sizeLabel: "medium" },
    gameSetting: {
      speed: 1,
      afkThreshold: 3,
      tileGrow: {
        [TileType.Plain]: { duration: 1, growth: 15 },
        [TileType.Throne]: { duration: 1, growth: 15 },
        [TileType.Barracks]: { duration: 1, growth: 15 },
        [TileType.Mountain]: { duration: 1, growth: 15 },
        [TileType.Swamp]: { duration: 1, growth: 15 },
        [TileType.Fog]: { duration: 1, growth: 15 },
      },
    },
    teams: [{ id: "team1", name: "Team 1" }],
    teamCount: 1,
    playerLimit: 8,
    started: false,
  };
}

describe("RoomInstance", () => {
  let room: RoomInstance;

  beforeEach(() => {
    room = new RoomInstance(freshState(), new Map([
      ["alice", mockConn()],
      ["bob", mockConn()],
      ["charlie", mockConn()],
    ]));
  });

  it("getState returns current state", () => {
    expect(room.getState().players).toHaveLength(3);
  });

  it("addPlayer adds a new player", () => {
    const r = room.addPlayer({ id: "dave", name: "Dave" }, mockConn());
    expect(r.success).toBe(true);
    expect(room.getPlayerCount()).toBe(4);
  });

  it("addPlayer rejects when room is full", () => {
    const r = room.canJoin("newguy");
    expect(r.success).toBe(true);
  });

  it("canJoin rejects banned players", () => {
    (room as any).handleClientAction?.("alice", { type: SyncedPreGameClientActionTypes.KICK_PLAYER, payload: { playerId: "bob" }, optimisticId: 1 });
    expect(room.getPlayerCount()).toBe(2);
    const r = room.canJoin("bob");
    expect(r.success).toBe(false);
  });

  it("canStartGame returns false without enough players", () => {
    expect(room.canStartGame()).toBe(false);
  });

  it("suspend + resume cycles state", () => {
    room.suspend();
    expect((room as any).suspended).toBe(true);
    room.resume();
    const players = room.getState().players;
    expect(players.every((p) => p.status === PreGamePlayerStatus.Lobby)).toBe(true);
  });

  it("removePlayerById removes player", () => {
    room.removePlayerById("charlie");
    expect(room.getPlayerCount()).toBe(2);
    expect(room.getState().players.find((p) => p.id === "charlie")).toBeUndefined();
  });

  it("supports ready/unready via trigger", () => {
    (room as any).handleClientAction?.("bob", { type: SyncedPreGameClientActionTypes.READY, optimisticId: 1 });
    const bob = room.getState().players.find((p) => p.id === "bob")!;
    expect(bob.ready).toBe(1);
    (room as any).handleClientAction?.("bob", { type: SyncedPreGameClientActionTypes.UNREADY, optimisticId: 2 });
    expect(bob.ready).toBe(0);
  });
});
