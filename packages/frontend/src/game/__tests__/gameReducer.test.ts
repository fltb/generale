import { describe, it, expect } from "vitest";
import { applyGameEventLocal } from "../gameReducer";
import { applyPregameEventLocal } from "../pregameReducer";
import {
  PlayerColor,
  PlayerOperationType,
  PreGameMapType,
  PreGamePlayerStatus,
  SyncedGameClientActionTypes,
  SyncedPreGameClientActionTypes,
  type SyncedGameState,
  type SyncedPreGameState,
} from "@generale/types";

function mockGameState(overrides?: Partial<SyncedGameState>): SyncedGameState {
  return {
    map: { width: 10, height: 10, tiles: [] },
    players: {},
    status: "PLAYING" as any,
    teams: {},
    settings: {} as any,
    tick: 0,
    playerDisplay: {},
    playerOperationQueue: [],
    ...overrides,
  };
}

function makeOp() {
  return { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, percentage: 100 } };
}

function mockPregameState(): SyncedPreGameState {
  return {
    room: {
      gameId: "g1",
      roomType: "standard",
      teamMode: "ffa",
      hostId: "host",
      players: [
        {
          id: "host",
          name: "Host",
          isHost: true,
          teamId: "team1",
          tileColor: PlayerColor.Red,
          ready: 1,
          status: PreGamePlayerStatus.Lobby,
        },
        {
          id: "player1",
          name: "P1",
          isHost: false,
          teamId: "team1",
          tileColor: PlayerColor.Blue,
          ready: 0,
          status: PreGamePlayerStatus.Lobby,
        },
      ],
      mapSetting: {
        type: PreGameMapType.Random,
        width: 20,
        height: 20,
        tileFrequency: {},
        sizeLabel: "medium",
      },
      gameSetting: {
        speed: 1,
        afkThreshold: 3,
        tileGrow: {
          PLAIN: { duration: 40, growth: 1 },
          THRONE: { duration: 1, growth: 1 },
          BARRACKS: { duration: 1, growth: 1 },
          MOUNTAIN: { duration: 1e10, growth: 0 },
          SWAMP: { duration: 1, growth: -1 },
          FOG: { duration: 1e10, growth: 0 },
        },
      },
      teams: [{ id: "team1", name: "Team 1" }],
      teamCount: 1,
      playerLimit: 8,
      started: false,
    },
    selfId: "player1",
  };
}

describe("applyGameEventLocal", () => {
  it("PUSH appends operations to queue", () => {
    const state = mockGameState();
    const op = makeOp();
    const next = applyGameEventLocal(state, { type: SyncedGameClientActionTypes.PUSH, payload: [op] } as any);
    expect(next.playerOperationQueue).toHaveLength(1);
    expect(next.playerOperationQueue![0]).toEqual(op);
  });

  it("PUSH appends to existing queue", () => {
    const op1 = makeOp();
    const state = mockGameState({ playerOperationQueue: [op1] });
    const op2 = { type: PlayerOperationType.Move, payload: { from: { x: 1, y: 1 }, to: { x: 2, y: 2 }, percentage: 100 } };
    const next = applyGameEventLocal(state, { type: SyncedGameClientActionTypes.PUSH, payload: [op2] } as any);
    expect(next.playerOperationQueue).toHaveLength(2);
    expect(next.playerOperationQueue![0]).toEqual(op1);
    expect(next.playerOperationQueue![1]).toEqual(op2);
  });

  it("CLEAN_ALL empties queue", () => {
    const state = mockGameState({ playerOperationQueue: [makeOp()] });
    const next = applyGameEventLocal(state, { type: SyncedGameClientActionTypes.CLEAN_ALL } as any);
    expect(next.playerOperationQueue).toHaveLength(0);
  });

  it("unknown action returns cloned state unchanged", () => {
    const state = mockGameState();
    const next = applyGameEventLocal(state, { type: "UNKNOWN" } as any);
    expect(next.playerOperationQueue).toEqual([]);
  });

  it("does not mutate original state", () => {
    const state = mockGameState();
    const op = makeOp();
    applyGameEventLocal(state, { type: SyncedGameClientActionTypes.PUSH, payload: [op] } as any);
    expect(state.playerOperationQueue).toHaveLength(0);
  });
});

describe("applyPregameEventLocal", () => {
  it("READY marks non-host as ready", () => {
    const state = mockPregameState();
    const next = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.READY } as any);
    const p1 = next.room.players.find((p) => p.id === "player1");
    expect(p1?.ready).toBe(1);
  });

  it("READY does not affect host", () => {
    const state = mockPregameState();
    const next = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.READY } as any);
    const host = next.room.players.find((p) => p.id === "host");
    expect(host?.ready).toBe(1);
  });

  it("UNREADY marks non-host as unready", () => {
    const state = mockPregameState();
    const ready = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.READY } as any);
    const unready = applyPregameEventLocal(ready, { type: SyncedPreGameClientActionTypes.UNREADY } as any);
    const p1 = unready.room.players.find((p) => p.id === "player1");
    expect(p1?.ready).toBe(0);
  });

  it("CHANGE_SETTING merges game settings", () => {
    const state = mockPregameState();
    const next = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.CHANGE_SETTING, payload: { speed: 3 } } as any);
    expect(next.room.gameSetting.speed).toBe(3);
    expect(next.room.gameSetting.afkThreshold).toBe(3);
  });

  it("CHANGE_MAP replaces map setting", () => {
    const state = mockPregameState();
    const next = applyPregameEventLocal(state, {
      type: SyncedPreGameClientActionTypes.CHANGE_MAP,
      payload: { type: PreGameMapType.Random, width: 30, height: 30, tileFrequency: {}, sizeLabel: "large" },
    } as any);
    expect(next.room.mapSetting).toMatchObject({ width: 30, height: 30 });
  });

  it("CHANGE_ROOM_TYPE switches to custom", () => {
    const state = mockPregameState();
    const next = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE, payload: { roomType: "custom" } } as any);
    expect(next.room.roomType).toBe("custom");
    expect(next.room.mapSetting).toMatchObject({ type: PreGameMapType.Custom });
  });

  it("CHANGE_ROOM_TYPE switches back to standard", () => {
    const state = mockPregameState();
    const next = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE, payload: { roomType: "custom" } } as any);
    const back = applyPregameEventLocal(next, { type: SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE, payload: { roomType: "standard" } } as any);
    expect(back.room.roomType).toBe("standard");
    expect(back.room.mapSetting).toMatchObject({ type: PreGameMapType.Random, sizeLabel: "medium" });
  });

  it("RENAME_TEAM updates team name", () => {
    const state = mockPregameState();
    const next = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.RENAME_TEAM, payload: { teamId: "team1", name: "Alpha" } } as any);
    const team = next.room.teams.find((t) => t.id === "team1");
    expect(team?.name).toBe("Alpha");
  });

  it("DELETE_TEAM removes empty team", () => {
    const state = mockPregameState();
    state.room.teams.push({ id: "team2", name: "Empty Team" });
    state.room.teamCount = 2;
    const next = applyPregameEventLocal(state, { type: SyncedPreGameClientActionTypes.DELETE_TEAM, payload: { teamId: "team2" } } as any);
    expect(next.room.teams.length).toBe(1);
    expect(next.room.teamCount).toBe(1);
  });

  it("handles null initial state gracefully", () => {
    const next = applyPregameEventLocal(null, { type: SyncedPreGameClientActionTypes.READY } as any);
    expect(next.room.gameId).toBe("");
    expect(next.room.players).toEqual([]);
  });
});
