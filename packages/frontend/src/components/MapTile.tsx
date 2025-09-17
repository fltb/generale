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
import { type FaIconKey, getGraphicsContextFromFa } from "~/utils/faIconGraphic";

export interface MapTileProps {
  coord: Coordinates;
  tile: Tile;
  size: number;
  playerDisplay: SyncedGameState["playerDisplay"];
  iconTextures: Record<TileType, FaIconKey | null>;
}

export const MapTile: Component<MapTileProps> = (props) => {
  const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);

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

  createEffect(() => {
    const graphics = g();
    if (!graphics) return;

    const size = Math.max(1, Math.floor(props.size));
    const color = tileColor();

    graphics.clear();
    graphics.rect(0, 0, size, size).fill({ color });
    graphics.stroke({ width: 1, color: 0x000000, alpha: 0.15 });
  });

  const x = props.coord.x * props.size;
  const y = props.coord.y * props.size;

  return (
    <P.Container x={x} y={y}>
      {/* 背景方块 */}
      <P.Graphics ref={setG} />

      {/* 图标：这里用 GraphicsContext */}
      <Show when={iconGcKey()}>
        {(key) => (
          <P.Graphics
            context={getGraphicsContextFromFa(key(), 32, 0x000000)} // 复用缓存
            x={props.size / 2}
            y={props.size / 2}
            scale={props.size / 32 * 0.6} // 基于 32px 默认大小，缩放到合适尺寸
            tint={0x000000}
          />
        )}
      </Show>

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
