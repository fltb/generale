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
      try { graphics.removeChildren(); } catch {}
      return;
    }

    const payload = (props.op as any).payload;
    if (!payload) {
      graphics.clear();
      try { graphics.removeChildren(); } catch {}
      return;
    }

    const from: Coordinates = payload.from;
    const to: Coordinates = payload.to;

    const sx = (from.x + 0.5) * props.size;
    const sy = (from.y + 0.5) * props.size;
    const ex = (to.x + 0.5) * props.size;
    const ey = (to.y + 0.5) * props.size;

    graphics.clear();
    try { graphics.removeChildren(); } catch {}

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

  // active cursor
  const [active, setActive] = createSignal<Coordinates | null>({x: 1, y: 1});

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

  // 键盘控制：当有 active 时，按方向键/WASD 会上报一条 move 并把 active 移到目标
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
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
    <P.Container x={offsetX} y={offsetY}>
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

      {/* 只渲染传入 state 的队列（上游 + 测试端如果需要合并，应由宿主提供合并后的 state） */}
      <P.Container>
        <For each={props.state.playerOperationQueue ?? []}>
          {(op, i) => <OperationArrow op={op} size={TILE_SIZE} z={100 + i()} />}
        </For>
      </P.Container>

      {/* Cursor */}
      <Show when={active()}>
        {(c) => {
          const [gCursor, setGCursor] = createSignal<PIXI.Graphics | undefined>(undefined);
          createEffect(() => {
            const graphics = gCursor();
            if (!graphics) return;
            graphics.clear();

            const cx = c().x;
            const cy = c().y;
            if (typeof cx !== "number" || typeof cy !== "number") {
              graphics.clear();
              return;
            }

            const x = cx * TILE_SIZE;
            const y = cy * TILE_SIZE;
            const pad = 2;

            graphics
              .rect(x + pad / 2, y + pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
              .stroke({ width: 3, color: 0xffd34d, alpha: 0.95 });

            graphics
              .rect(x + pad / 2, y + pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
              .stroke({ width: 6, color: 0xffd34d, alpha: 0.12 });
          });

          return <P.Graphics ref={(inst) => { setGCursor(inst); return () => setGCursor(undefined); }} />;
        }}
      </Show>

    </P.Container>
  );
};
