// MapRenderTest.tsx

import type { PlayerOperation, SyncedGameState } from "@generale/types";
import { GameStatus, PlayerOperationType, PlayerStatus, TileType } from "@generale/types";
import { createMemo, createSignal } from "solid-js";
import { MapRender } from "../MapRender";

/**
 * 完整且类型安全的测试用 state（使用枚举而不是裸数字）
 */
const testGameState: SyncedGameState = {
  status: GameStatus.Playing,
  tick: 0,
  settings: {
    tileGrow: {
      [TileType.Plain]: { duration: 5, growth: 1 },
      [TileType.Throne]: { duration: 3, growth: 2 },
      [TileType.Barracks]: { duration: 2, growth: 3 },
      [TileType.Mountain]: { duration: 0, growth: 0 },
      [TileType.Swamp]: { duration: 0, growth: 0 },
      [TileType.Fog]: { duration: 0, growth: 0 },
    },
    afkThreshold: 100,
  },
  players: {
    player1: {
      id: "player1",
      status: PlayerStatus.Playing,
      army: 100,
      land: 5,
      lastActiveTick: 0,
      teamId: "team1",
    },
    player2: {
      id: "player2",
      status: PlayerStatus.Playing,
      army: 80,
      land: 3,
      lastActiveTick: 0,
      teamId: "team2",
    },
  },
  teams: {
    team1: { id: "team1", memberIds: ["player1"], status: PlayerStatus.Playing },
    team2: { id: "team2", memberIds: ["player2"], status: PlayerStatus.Playing },
  },
  map: {
    width: 8,
    height: 6,
    tiles: Array(6)
      .fill(null)
      .map((_, _y) =>
        Array(8)
          .fill(null)
          .map((_, _x) => ({
            // 这里使用 TileType 枚举值，保证类型正确
            type:
              Math.random() > 0.7
                ? TileType.Mountain
                : Math.random() > 0.6
                  ? TileType.Barracks
                  : Math.random() > 0.5
                    ? TileType.Throne
                    : TileType.Plain,
            ownerId: Math.random() > 0.5 ? (Math.random() > 0.5 ? "player1" : "player2") : null,
            army: Math.floor(Math.random() * 20),
            _internalCounter: 0,
          })),
      ),
  },
  playerDisplay: {
    player1: { tileColor: 0xff0000 },
    player2: { tileColor: 0x0000ff },
  },
  playerOperationQueue: [
    {
      type: PlayerOperationType.Move,
      payload: {
        from: { x: 1, y: 1 },
        to: { x: 2, y: 1 },
        percentage: 50,
      },
    } as any,
    {
      type: PlayerOperationType.Move,
      payload: {
        from: { x: 3, y: 3 },
        to: { x: 4, y: 3 },
        percentage: 75,
      },
    } as any,
  ],
};

export default function MapRenderTest() {
  // 本地队列（通过 MapRender 的 onOperationQueued 上报）
  const [localOps, setLocalOps] = createSignal<PlayerOperation[]>([]);

  // 当 MapRender 上报新操作时，push 到 localOps
  const handleOperationQueued = (op: PlayerOperation) => {
    setLocalOps((prev) => [...prev, op]);
  };

  // 合并上游队列与本地队列（测试层负责合并）
  const combinedQueue = createMemo(() => {
    return [...(testGameState.playerOperationQueue ?? []), ...localOps()];
  });

  // 为 MapRender 构建一个临时 state（浅拷贝 testGameState 并替换队列）
  const renderState = createMemo<SyncedGameState>(() => {
    return {
      ...testGameState,
      playerOperationQueue: combinedQueue(),
    };
  });

  return <MapRender state={renderState()} onOperationQueued={handleOperationQueued} />;
}
