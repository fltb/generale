import {
  type GameState,
  GameStatus,
  type MaskedGameState,
  type PlayerActionQueues,
  type PlayerId,
  PlayerOperationType,
  PlayerStatus,
  TileType,
} from "@generale/types";
import { autoJudge, handleMove, updateGameState } from "./game-utils";

/**
 * 进度推进函数
 * @param state  当前快照
 * @param queues 本 tick 各玩家操作队列
 * @returns 新的 state 和剩余队列
 */
export function tick(state: GameState, queues: PlayerActionQueues): { state: GameState; queue: PlayerActionQueues } {
  if (state.status === GameStatus.Ended) {
    return { state: structuredClone(state), queue: {} };
  }
  // 深拷贝保证纯函数
  const newState: GameState = structuredClone(state);
  const newQueues: PlayerActionQueues = {};

  for (const [pid, ops] of Object.entries(queues)) {
    // Using optional chaining ?. for a cleaner check
    if (newState.players[pid]?.status !== PlayerStatus.Playing) {
      newQueues[pid] = [];
      continue;
    }
    if (ops.length === 0) {
      newQueues[pid] = ops;
      continue;
    }

    const op = ops[0];
    // FIX (for errors on lines 30, 32, 36): Add a guard. If the ops array was somehow
    // modified to be empty, this prevents 'op' from being undefined.
    if (!op) {
      continue;
    }

    let ok = false;
    switch (
      op.type // This access is now safe
    ) {
      case PlayerOperationType.Move:
        ok = handleMove(newState, pid, op.payload);
        break;
      // case … 以后扩展
      default:
        // This access is now safe
        throw new Error(`Unknown op type ${op.type} of op ${op}`);
    }

    // 更新最后活跃 tick
    // FIX: Add a check to ensure the player still exists before updating them,
    // as they might have been defeated during this tick's operations.
    const player = newState.players[pid];
    if (ok && player) {
      player.lastActiveTick = newState.tick;
    }

    // 不管成功失败都丢掉队头那一条：
    // - 成功：自然消费
    // - 失败：废 op 单独丢弃，不连坐后面合法的 op
    //
    // 之前的实现是失败时把整条队列清空（`ok ? slice(1) : []`），导致
    // "第一下因为 cursor 默认 (1,1) 或 throne 兵力还=1 失败" 就把用户
    // 后续排好的几下也一起带走，UX 上表现为"第一下移动概率被丢弃"。
    newQueues[pid] = ops.slice(1);
  }

  updateGameState(newState);
  autoJudge(newState);
  return { state: newState, queue: newQueues };
}

/**
 * 生成单个玩家视角的战雾快照
 *
 * 原则：
 * - 玩家本人拥有的格子可见
 * - 队友拥有的格子可见
 * - 与玩家/队友拥有格子相邻（3x3）格子可见
 * - 其它格子替换成 FOG
 */
export function mask(state: GameState, playerId: PlayerId): MaskedGameState {
  // 直接深拷贝一份 state 用于返回（但我们仍然以原始 state 为“真值”来源）
  const copy = structuredClone(state);
  const player = state.players[playerId];

  // 容错：若玩家不存在，返回原始拷贝（不做遮罩）
  if (!player) return copy;

  const teamId = player.teamId;
  const team = teamId ? state.teams[teamId] : null;

  const height = state.map.height;
  const width = state.map.width;

  // visible[y][x] === true 表示该坐标对 playerId 可见
  const visible: boolean[][] = new Array(height);
  for (let y = 0; y < height; y++) {
    visible[y] = new Array(width).fill(false);
  }

  // Helper: mark a tile and its 3x3 neighborhood visible (bounds-checked)
  function markNeighborsVisible(cx: number, cy: number) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ny = cy + dy;
        const nx = cx + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
          const visibleRow = visible[ny];
          if (!visibleRow) continue;
          visibleRow[nx] = true;
        }
      }
    }
  }

  // 一次遍历：对所有被玩家或队友拥有的格子，标记自身及邻居为可见
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = state.map.tiles[y]?.[x];
      if (!tile) continue;

      // 属于玩家本人
      if (tile.ownerId === playerId) {
        markNeighborsVisible(x, y);
        continue;
      }

      // 属于队友
      if (team && tile.ownerId && team.memberIds.includes(tile.ownerId)) {
        markNeighborsVisible(x, y);
      }
    }
  }

  // 最后一次遍历：把不可见格子替换为 Fog（只改 copy.map）
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visible[y]?.[x]) {
        const copyRow = copy.map.tiles[y];
        if (!copyRow) continue;
        copyRow[x] = {
          type: TileType.Fog,
          ownerId: null,
          army: 0,
        };
      }
    }
  }

  return copy;
}
