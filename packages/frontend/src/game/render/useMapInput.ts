import {
  type Coordinates,
  type PlayerOperation,
  PlayerOperationType,
  type SyncedGameState,
  TileType,
} from "@generale/types";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";

type MapData = SyncedGameState["map"];

export interface UseMapInputParams {
  /** 当前地图（含 tiles） */
  map: () => MapData;
  /** 当前客户端玩家 id，用于首帧把 cursor 自动放到自己的 throne 上 */
  selfId: () => string | undefined;
  /** 新增移动指令时回调宿主 */
  onOperationQueued?: (op: PlayerOperation) => void;
  /** 按 'c' 键时调用：清空操作队列 */
  onClearQueue?: () => void;
}

/**
 * 地图输入逻辑：active cursor、点击选格、方向键/WASD 移动、自动定位到自己 throne。
 *
 * 从 MapRender 中拆出，使渲染组件回归"纯画"。cursor 的绘制仍在 MapRender（属于渲染），
 * 这里只维护 active 坐标并产出移动指令。
 */
export function useMapInput(params: UseMapInputParams) {
  // active cursor。默认 null（不放占位），由下面的 effect 在拿到自己的 throne 后置位，
  // 或由用户点击置位。避免在 cursor 还没定位到自己地盘时，方向键从占位坐标(1,1)发出
  // 一个非己方格子的无效移动 —— 服务端会丢弃，表现为"移动没反应"。
  const [active, setActive] = createSignal<Coordinates | null>(null);

  // 自动定位 cursor 到自己 throne：第一次扫到属于 selfId 的 throne 就置位，置位后不再覆盖
  // （用户随后点击 / 方向键移动的位置由 active signal 自己管，不应该被 state 更新拽回）。
  // spectator 没有 selfId 或地图里没有自己的 throne 时不做事，保持默认。
  const [cursorInitialized, setCursorInitialized] = createSignal(false);
  createEffect(() => {
    if (cursorInitialized()) return;
    const id = params.selfId();
    if (!id) return;
    const m = params.map();
    const tiles = m?.tiles;
    if (!tiles || tiles.length === 0) return;
    for (let y = 0; y < m.height; y++) {
      const row = tiles[y];
      if (!row) continue;
      for (let x = 0; x < m.width; x++) {
        const tile = row[x];
        if (tile && tile.type === TileType.Throne && tile.ownerId === id) {
          setActive({ x, y });
          setCursorInitialized(true);
          return;
        }
      }
    }
  });

  // 检查坐标是否在地图范围内
  const inBounds = (c: Coordinates) =>
    c.x >= 0 && c.y >= 0 && c.x < (params.map()?.width ?? 0) && c.y < (params.map()?.height ?? 0);

  // 点击格子回调（MapTile 会调用）
  const handleTileClick = (coord: Coordinates) => {
    const cur = active();
    if (cur && cur.x === coord.x && cur.y === coord.y) {
      setActive(null);
    } else {
      setActive(coord);
    }
  };

  // 将移动指令通过回调上报给宿主
  const enqueueMove = (from: Coordinates, to: Coordinates, percentage = 100) => {
    if (!inBounds(to)) return;
    const op: PlayerOperation = {
      type: PlayerOperationType.Move,
      payload: { from, to, percentage },
    };
    params.onOperationQueued?.(op);
  };

  // 键盘控制：方向键/WASD 移动；c 清空操作队列
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      // 'c' 不依赖 active，单独处理
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        params.onClearQueue?.();
        return;
      }

      const a = active();
      if (!a) return;

      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          dy = -1;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dy = 1;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dx = -1;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dx = 1;
          break;
        default:
          return;
      }

      e.preventDefault();

      const target = { x: a.x + dx, y: a.y + dy };
      if (!inBounds(target)) return;

      enqueueMove(a, target, 100);
      setActive(target);
    };

    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  return { active, setActive, handleTileClick };
}
