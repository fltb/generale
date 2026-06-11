import {
  type PreGameRoomState,
  type SyncedGameState,
  PreGameMapType,
} from "@generale/types";

/**
 * 房间 / 对局的初始默认 state。
 *
 * 这些默认值之前内联在 room/Room.tsx（makeEmptyRoom）和 game/Game.tsx（emptyState）里，
 * 属于领域数据而非视图，集中到此模块便于复用与测试。
 */

/** 提供一个 minimal empty PreGameRoomState，供初始 state 使用 */
export const makeEmptyRoom = (gameId = ""): PreGameRoomState => ({
  gameId,
  roomType: "standard",
  teamMode: "ffa",
  hostId: "",
  players: [],
  mapSetting: {
    type: PreGameMapType.Random,
    width: 20,
    height: 20,
    tileFrequency: {},
    sizeLabel: "medium",
  },
  gameSetting: {
    speed: 1,
    tileGrow: {
      PLAIN: { duration: 40, growth: 1 },
      THRONE: { duration: 1, growth: 1 },
      BARRACKS: { duration: 1, growth: 1 },
      MOUNTAIN: { duration: 1e10, growth: 0 },
      SWAMP: { duration: 1, growth: -1 },
      FOG: { duration: 1e10, growth: 0 },
    },
    afkThreshold: 30,
  },
  teams: [],
  teamCount: 0,
  playerLimit: 8,
  started: false,
});

/** minimal initial game state fallback（masked shape） */
export const makeEmptyGameState = (): SyncedGameState => ({
  status: undefined as any,
  tick: 0,
  map: { width: 0, height: 0, tiles: [] } as any,
  players: {},
  teams: {},
  settings: {} as any,
  playerDisplay: {},
  playerOperationQueue: [],
});
