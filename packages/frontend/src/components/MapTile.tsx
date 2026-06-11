import {
  type Component,
  createSignal,
  createMemo,
  createEffect,
  Show,
} from "solid-js";
import * as P from "solid-pixi";
import * as PIXI from "pixi.js";
import type { Coordinates, Tile, SyncedGameState } from "@generale/types";
import { TileType, PlayerColor } from "@generale/types";

/** 把 tileColor 可能的 number / string（历史 enum 名）统一映射成数字色 */
function normalizeTileColor(c: number | string | undefined): number {
  if (typeof c === "number") return c;
  if (typeof c === "string") {
    const num = (PlayerColor as any)[c];
    if (typeof num === "number") return num;
  }
  return 0xffffff;
}
import { type FaIconKey, createScaledFaIcon } from "~/utils/faIconGraphic";

export interface MapTileProps {
  coord: Coordinates;
  tile: Tile;
  size: number;
  playerDisplay: SyncedGameState["playerDisplay"];
  iconTextures: Record<TileType, FaIconKey | null>;
  onClick?: (coord: Coordinates) => void; // 新增：点击回调
}

export const MapTile: Component<MapTileProps> = (props) => {
  const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);
  const [iconGraphics, setIconGraphics] = createSignal<PIXI.Graphics | undefined>(undefined);

  const tileColor = createMemo(() =>
    props.tile.type === TileType.Fog
      ? 0x444444
      : (props.tile.ownerId
          ? normalizeTileColor(props.playerDisplay[props.tile.ownerId]?.tileColor as any)
          : 0xffffff)
  );

  // 选出对应的 FaIconKey
  const iconGcKey = createMemo<FaIconKey | null>(() =>
    props.tile.type === TileType.Plain || props.tile.type === TileType.Fog
      ? null
      : props.iconTextures[props.tile.type] ?? null
  );

  const textStyle = createMemo(
    () =>
      new PIXI.TextStyle({
        fontSize: Math.max(8, Math.round(props.size * 0.42)),
        fill: "#ffffff",
        stroke: {
          color: "#000000",
          width: 2,
        },
        fontWeight: "bold",
        align: "center",
      })
  );

  // 背景绘制
  createEffect(() => {
    const graphics = g();
    if (!graphics) return;
    const size = Math.max(1, Math.floor(props.size));
    const color = tileColor();
    graphics.clear();
    graphics.rect(0, 0, size, size).fill({ color });
    graphics.stroke({ width: 1, color: 0x000000, alpha: 0.15 });
  });

  // 图标绘制（防御性：clear + removeChildren）
  createEffect(() => {
    const graphics = iconGraphics();
    const key = iconGcKey();
    if (!graphics) return;

    graphics.clear();
    // removeChildren 可能将 child 移除并触发销毁/parent 变更，保持 try/catch
    try {
      graphics.removeChildren();
    } catch (err) {
      console.warn("iconGraphics.removeChildren failed", err);
    }

    if (key) {
      const iconSize = Math.round(props.size * 0.6);
      const scaledIcon = createScaledFaIcon(key, iconSize, 0xff0000);
      
      // 设置位置到瓦片中心
      scaledIcon.x = props.size / 2;
      scaledIcon.y = props.size / 2;
      
      graphics.addChild(scaledIcon);
    }
  });

  // 用 accessor 包裹保持响应性：直接 const x = props.coord.x * props.size
  // 会把 size/coord 锁在首次渲染时的值，size 变化时位置不会更新。
  const x = () => props.coord.x * props.size;
  const y = () => props.coord.y * props.size;

  // 处理点击（通过 container 的 pointer 事件）
  const handlePointerDown: PIXI.FederatedEventHandler<PIXI.FederatedPointerEvent> = (e) => {
    // 阻止事件冒泡到上层（如果需要）
    e.stopPropagation();
    props.onClick?.(props.coord);
  };

  // --- 关键改动：ref wrapper，必须返回函数或 undefined ---
  return (
    <P.Container x={x()} y={y()} interactive buttonMode onpointerdown={handlePointerDown}>
      <P.Graphics ref={(inst) => { setG(inst); return () => setG(undefined); }} />
      <P.Graphics ref={(inst) => { setIconGraphics(inst); return () => setIconGraphics(undefined); }} />

      <Show when={props.tile.army > 0}>
        <P.Text
          anchor={0.5}
          x={props.size / 2}
          y={props.size / 2}
          style={textStyle()}
        >
          {String(props.tile.army)}
        </P.Text>
      </Show>
    </P.Container>
  );
};
