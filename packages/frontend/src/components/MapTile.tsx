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
import { TileType } from "@generale/types";
import { type FaIconKey, createScaledFaIcon } from "~/utils/faIconGraphic";

export interface MapTileProps {
  coord: Coordinates;
  tile: Tile;
  size: number;
  playerDisplay: SyncedGameState["playerDisplay"];
  iconTextures: Record<TileType, FaIconKey | null>;
}

export const MapTile: Component<MapTileProps> = (props) => {
  const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);
  const [iconGraphics, setIconGraphics] = createSignal<PIXI.Graphics | undefined>(undefined);

  const tileColor = createMemo(() =>
    props.tile.type === TileType.Fog
      ? 0x444444
      : (props.tile.ownerId
          ? (props.playerDisplay[props.tile.ownerId]?.tileColor ?? 0xffffff)
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

  // 图标绘制
  createEffect(() => {
    const graphics = iconGraphics();
    const key = iconGcKey();
    if (!graphics) return;

    graphics.clear();
    graphics.removeChildren();

    if (key) {
      const iconSize = Math.round(props.size * 0.6);
      const scaledIcon = createScaledFaIcon(key, iconSize, 0xff0000);
      
      // 设置位置到瓦片中心
      scaledIcon.x = props.size / 2;
      scaledIcon.y = props.size / 2;
      
      graphics.addChild(scaledIcon);
    }
  });

  const x = props.coord.x * props.size;
  const y = props.coord.y * props.size;

  return (
    <P.Container x={x} y={y}>
      {/* 背景方块 */}
      <P.Graphics ref={setG} />
      
      {/* 图标容器 */}
      <P.Graphics ref={setIconGraphics} />

      {/* 兵力数 */}
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