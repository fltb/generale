// src/components/MapRender.tsx
import { For, Show, createMemo, createSignal, createEffect, type Component } from "solid-js";
import * as P from "solid-pixi";
import * as PIXI from "pixi.js";

import type { SyncedGameState, Coordinates, PlayerOperation } from "@generale/types";
import { PlayerOperationType, TileType } from "@generale/types";

import { MapTile } from "./MapTile";
import { type FaIconKey, createScaledFaIcon } from "~/utils/faIconGraphic";

export interface MapRenderProps {
  state: SyncedGameState;
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
  // 其他类型根据需要加
};

const OperationArrow: Component<{
  op: PlayerOperation;
  size: number; // tile size
  z?: number;
}> = (props) => {
  const [g, setG] = createSignal<PIXI.Graphics>();

  createEffect(() => {
    const graphics = g();
    if (!graphics) return;

    // 只处理 MOVE 操作
    if (props.op.type !== PlayerOperationType.Move) {
      graphics.clear();
      graphics.removeChildren();
      return;
    }

    const payload = (props.op as any).payload;
    if (!payload) {
      graphics.clear();
      graphics.removeChildren();
      return;
    }

    const from: Coordinates = payload.from;
    const to: Coordinates = payload.to;

    // 起点、终点格子中心
    const sx = (from.x + 0.5) * props.size;
    const sy = (from.y + 0.5) * props.size;
    const ex = (to.x + 0.5) * props.size;
    const ey = (to.y + 0.5) * props.size;

    graphics.clear();
    graphics.removeChildren();

    // 判断方向（主要 4 个方向）
    const dx = ex - sx;
    const dy = ey - sy;
    let dir: DirectionKey = "right"; // 默认
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? "right" : "left";
    } else {
      dir = dy > 0 ? "down" : "up";
    }

    // 箭头大小
    const arrowSize = Math.min(24, props.size * 0.4);

    // 创建缩放后的箭头图标
    const arrow = createScaledFaIcon(ICON_MAP[dir], arrowSize, 0x222222);

    // 计算箭头位置：格子交界处
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    // 稍微往目标方向偏移，使箭头贴近目标格子
    const offset = props.size * 0.05;
    const dxn = Math.sign(dx);
    const dyn = Math.sign(dy);

    arrow.x = mx + dxn * offset;
    arrow.y = my + dyn * offset;

    graphics.addChild(arrow);
  });

  return <P.Graphics ref={setG} zIndex={props.z ?? 0} />;
};

/**
 * MapRender: 渲染整个地图（tiles）、操作队列箭头、以及可选的选中框 cursor。
 */
export const MapRender: Component<MapRenderProps> = (props) => {
  // conservative constant tile size — 可按需调整 / 改成 prop
  const TILE_SIZE = 36;

  // convenience
  const map = createMemo(() => props.state.map);

  const iconTextures = createMemo<Record<TileType, FaIconKey | null>>(() => {
    return TILE_ICON_MAP;
  });

  const [cursor, setCursor] = createSignal<Coordinates | null>({x: 1, y: 1});

  // container offset (if you want to center map later, adjust here)
  const offsetX = 0;
  const offsetY = 0;

  return (
    <P.Container x={offsetX} y={offsetY}>
      {/* Base tiles: nested For (rows -> cols) */}
      <For each={map().tiles}>
        {(row, yIdx) => (
          <For each={row}>
            {(tile, xIdx) => {
              // xIdx(), yIdx() are accessors returning number
              const coord: Coordinates = { x: xIdx(), y: yIdx() };
              return (
                <MapTile
                  coord={coord}
                  tile={tile}
                  size={TILE_SIZE}
                  playerDisplay={props.state.playerDisplay}
                  iconTextures={iconTextures()}
                />
              );
            }}
          </For>
        )}
      </For>

      {/* Cursor: if present, draw a highlighted rectangle around the tile */}
      <Show when={cursor()}>
        {(c) => {
          const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);
          createEffect(() => {
            const graphics = g();
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

            // 主描边（实心金黄框）
            graphics
              .rect(x + pad / 2, y + pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
              .stroke({ width: 3, color: 0xffd34d, alpha: 0.95 });

            // 外圈的淡光晕
            graphics
              .rect(x + pad / 2, y + pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
              .stroke({ width: 6, color: 0xffd34d, alpha: 0.12 });
          });

          return <P.Graphics ref={setG} />;
        }}
      </Show>

            {/* Operation arrows (render on top of tiles). Draw in order. */}
      <P.Container>
        <For each={props.state.playerOperationQueue}>
          {(op, i) => <OperationArrow op={op} size={TILE_SIZE} z={100 + i()} />}
        </For>
      </P.Container>


    </P.Container>
  );
};