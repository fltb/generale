import type { Coordinates, SyncedGameState, Tile } from "@generale/types";
import { TileType } from "@generale/types";
import * as PIXI from "pixi.js";
import { type Component, createEffect, createMemo, createSignal, Show } from "solid-js";
import * as P from "solid-pixi";
import { DEFAULT_TILE_THEME } from "~/game/render/tileTheme";
import type { FaIconKey, IconFactory } from "~/utils/faIconGraphic";
import { tileColorNumber } from "~/utils/playerColor";

export interface MapTileProps {
  coord: Coordinates;
  tile: Tile;
  size: number;
  playerDisplay: SyncedGameState["playerDisplay"];
  iconTextures: Record<TileType, FaIconKey | null>;
  onClick?: (coord: Coordinates) => void;
  iconFactory?: IconFactory;
}

export const MapTile: Component<MapTileProps> = (props) => {
  const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);
  const [iconGraphics, setIconGraphics] = createSignal<PIXI.Graphics | undefined>(undefined);

  const tileColor = createMemo(() =>
    props.tile.type === TileType.Fog
      ? DEFAULT_TILE_THEME.colors.fog
      : props.tile.ownerId
        ? tileColorNumber(props.playerDisplay[props.tile.ownerId]?.tileColor)
        : DEFAULT_TILE_THEME.colors.unowned,
  );

  // 选出对应的 FaIconKey
  const iconGcKey = createMemo<FaIconKey | null>(() =>
    props.tile.type === TileType.Plain || props.tile.type === TileType.Fog
      ? null
      : (props.iconTextures[props.tile.type] ?? null),
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
      }),
  );

  // 背景绘制
  createEffect(() => {
    const graphics = g();
    if (!graphics) return;
    const size = Math.max(1, Math.floor(props.size));
    const color = tileColor();
    graphics.clear();
    graphics.rect(0, 0, size, size).fill({ color });
    graphics.stroke({
      width: 1,
      color: DEFAULT_TILE_THEME.colors.gridStroke,
      alpha: DEFAULT_TILE_THEME.colors.gridStrokeAlpha,
    });
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
      const scaledIcon = props.iconFactory?.createScaledIcon(key, iconSize, DEFAULT_TILE_THEME.colors.tileIcon);

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
      <P.Graphics
        ref={(inst) => {
          setG(inst);
          return () => setG(undefined);
        }}
      />
      <P.Graphics
        ref={(inst) => {
          setIconGraphics(inst);
          return () => setIconGraphics(undefined);
        }}
      />

      <Show when={props.tile.army > 0}>
        <P.Text anchor={0.5} x={props.size / 2} y={props.size / 2} style={textStyle()}>
          {String(props.tile.army)}
        </P.Text>
      </Show>
    </P.Container>
  );
};
