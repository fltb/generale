import { For, Show, createMemo, createSignal, createEffect, type Component, onMount, onCleanup } from "solid-js";
import * as P from "solid-pixi";
import * as PIXI from "pixi.js";

import type { SyncedGameState, Coordinates, PlayerOperation } from "@generale/types";
import { PlayerOperationType, TileType } from "@generale/types";

import { MapTile } from "./MapTile";
import { type FaIconKey, createScaledFaIcon } from "~/utils/faIconGraphic";

export interface MapRenderProps {
  state: SyncedGameState;
  // 可选回调：若宿主想收到新增指令可以传入（非必须）
  onOperationQueued?: (op: PlayerOperation) => void;
  /** 当前客户端玩家 id，用于首帧把 cursor 自动放到自己的 throne 上 */
  selfId?: string;
  /** 按 'c' 键时调用：清空操作队列 */
  onClearQueue?: () => void;
}

const ICON_MAP = {
  right: "faArrowRight",
  left: "faArrowLeft",
  up: "faArrowUp",
  down: "faArrowDown",
} as const;

type DirectionKey = keyof typeof ICON_MAP;

const TILE_ICON_MAP: Record<TileType, FaIconKey | null> = {
  [TileType.Plain]: null,
  [TileType.Fog]: null,
  [TileType.Throne]: "faCrown",
  [TileType.Barracks]: "faHelmetSafety",
  [TileType.Mountain]: "faMountain",
  [TileType.Swamp]: "faWater",
};

const OperationArrow: Component<{
  op: PlayerOperation;
  size: number;
  z?: number;
}> = (props) => {
  const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);

  createEffect(() => {
    const graphics = g();
    if (!graphics) return;

    if (props.op.type !== PlayerOperationType.Move) {
      graphics.clear();
      try { graphics.removeChildren(); } catch { }
      return;
    }

    const payload = (props.op as any).payload;
    if (!payload) {
      graphics.clear();
      try { graphics.removeChildren(); } catch { }
      return;
    }

    const from: Coordinates = payload.from;
    const to: Coordinates = payload.to;

    const sx = (from.x + 0.5) * props.size;
    const sy = (from.y + 0.5) * props.size;
    const ex = (to.x + 0.5) * props.size;
    const ey = (to.y + 0.5) * props.size;

    graphics.clear();
    try { graphics.removeChildren(); } catch { }

    const dx = ex - sx;
    const dy = ey - sy;
    let dir: DirectionKey = "right";
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? "right" : "left";
    } else {
      dir = dy > 0 ? "down" : "up";
    }

    const arrowSize = Math.min(24, props.size * 0.4);
    const arrow = createScaledFaIcon(ICON_MAP[dir], arrowSize, 0x222222);

    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    const offset = props.size * 0.05;
    const dxn = Math.sign(dx);
    const dyn = Math.sign(dy);

    try {
      arrow.x = mx + dxn * offset;
      arrow.y = my + dyn * offset;
      graphics.addChild(arrow);
    } catch (err) {
      console.warn("OperationArrow.addChild failed", err);
    }
  });

  // ref wrapper — 必须返回 cleanup 函数或 undefined
  return <P.Graphics ref={(inst) => { setG(inst); return () => setG(undefined); }} zIndex={props.z ?? 0} />;
};

export const MapRender: Component<MapRenderProps> = (props) => {
  const TILE_SIZE = 36;
  const map = createMemo(() => props.state?.map ?? { width: 0, height: 0, tiles: [] });
  const iconTextures = createMemo<Record<TileType, FaIconKey | null>>(() => TILE_ICON_MAP);

  // active cursor。默认 (1,1) 只是占位，下面的 effect 会在拿到自己的 throne 后覆盖。
  const [active, setActive] = createSignal<Coordinates | null>({ x: 1, y: 1 });
  const [gCursor, setGCursor] = createSignal<PIXI.Graphics | undefined>(undefined);

  // 自动定位 cursor 到自己 throne：第一次扫到属于 selfId 的 throne 就置位，置位后不再覆盖
  // （用户随后点击 / 方向键移动的位置由 active signal 自己管，不应该被 state 更新拽回）。
  // spectator 没有 selfId 或地图里没有自己的 throne 时不做事，保持默认。
  const [cursorInitialized, setCursorInitialized] = createSignal(false);
  createEffect(() => {
    if (cursorInitialized()) return;
    const id = props.selfId;
    if (!id) return;
    const m = map();
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

  createEffect(() => {
    const graphics = gCursor();
    graphics?.clear();
    const c = active();
    if (!graphics || !c) return;

    const cx = c.x;
    const cy = c.y;
    if (typeof cx !== "number" || typeof cy !== "number") {
      graphics.clear();
      return;
    }

    const x = cx * TILE_SIZE;
    const y = cy * TILE_SIZE;
    const pad = 2;

    // 直接设置 graphics 的位置到瓦片左上角（世界坐标下）
    graphics.x = x;
    graphics.y = y;

    graphics
      .rect(pad / 2, pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
      .stroke({ width: 3, color: 0xffd34d, alpha: 0.95 });

    graphics
      .rect(pad / 2, pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
      .stroke({ width: 6, color: 0xffd34d, alpha: 0.12 });
  });

  // 检查坐标是否在地图范围内
  const inBounds = (c: Coordinates) =>
    c.x >= 0 && c.y >= 0 && c.x < (map()?.width ?? 0) && c.y < (map()?.height ?? 0);

  // 点击格子回调（MapTile 会调用）
  const handleTileClick = (coord: Coordinates) => {
    const cur = active();
    if (cur && cur.x === coord.x && cur.y === coord.y) {
      setActive(null);
    } else {
      setActive(coord);
    }
  };

  // 将移动指令通过回调上报给宿主（MapRender 不再存 localOps）
  const enqueueMove = (from: Coordinates, to: Coordinates, percentage = 100) => {
    if (!inBounds(to)) return;
    const op: PlayerOperation = {
      type: PlayerOperationType.Move,
      payload: { from, to, percentage },
    } as any;
    props.onOperationQueued?.(op);
  };

  // 键盘控制：方向键/WASD 移动；c 清空操作队列
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      // 'c' 不依赖 active，单独处理
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        props.onClearQueue?.();
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

  const offsetX = 0;
  const offsetY = 0;

  return (
    // world container：所有地图内容都在这里（由外层的 Application 决定缩放/分辨率）
    <P.Container x={offsetX} y={offsetY} name="world" sortableChildren>
      {/* ===== map layer: tiles ===== */}
      <P.Container name="mapLayer">
        <For each={map().tiles}>
          {(row, yIdx) => (
            <For each={row ?? []}>
              {(tile, xIdx) => {
                const coord: Coordinates = { x: xIdx(), y: yIdx() };
                return (
                  <MapTile
                    coord={coord}
                    tile={tile}
                    size={TILE_SIZE}
                    playerDisplay={props.state.playerDisplay}
                    iconTextures={iconTextures()}
                    onClick={handleTileClick}
                  />
                );
              }}
            </For>
          )}
        </For>
      </P.Container>

      {/* ===== entity layer: (units / players) - keep separate in case you add sprites later ===== */}
      <P.Container name="entityLayer" />

      {/* ===== overlay layer: arrows / cursor / highlights - still in world space ===== */}
      <P.Container name="overlayLayer">
        {/* operation arrows (world-space coordinates inside OperationArrow) */}
        <For each={props.state.playerOperationQueue ?? []}>
          {(op, i) => <OperationArrow op={op} size={TILE_SIZE} z={100 + i()} />}
        </For>

        {/* single cursor graphics (we reuse and update it via gCursor signal + createEffect above) */}
        <P.Graphics
          ref={(inst) => {
            // 必须返回 cleanup 函数或 undefined
            setGCursor(inst);
            return () => setGCursor(undefined);
          }}
          zIndex={999}
        />
      </P.Container>
    </P.Container>
  );
};
