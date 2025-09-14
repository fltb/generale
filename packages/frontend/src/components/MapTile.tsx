// src/components/MapTile.tsx
import {
  Component,
  createSignal,
  createMemo,
  createEffect,
  Show,
} from "solid-js";
import P from "solid-pixi"; // P.Graphics, P.Sprite, P.Text, P.Container
import * as PIXI from "pixi.js";

import type { Coordinates, Tile, PlayerId, PlayerCore } from "@generale/types";
import { TileType, PlayerColor } from "@generale/types";

export interface MapTileProps {
  coord: Coordinates;
  tile: Tile;
  size: number;
  players: Record<PlayerId, PlayerCore & { color: PlayerColor }>;
  iconTextures: Record<TileType, PIXI.Texture>;
}

export const MapTile: Component<MapTileProps> = (props) => {
  // store Graphics instance in a signal (官方示例模式)
  const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);

  // cached reactive values
  const tileColor = createMemo(() =>
    props.tile.type === TileType.Fog ? 0x444444 : 0xaaaaaa
  );
  const iconTexture = createMemo<PIXI.Texture | null>(() =>
    props.tile.type === TileType.Plain || props.tile.type === TileType.Fog
      ? null
      : props.iconTextures[props.tile.type] ?? null
  );
  const ownerTint = createMemo(() =>
    props.tile.ownerId
      ? props.players[props.tile.ownerId]?.color ?? 0xffffff
      : 0xffffff
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

  // 命令式绘制：当 g()、props.size、props.tile.type、tileColor() 等变化时会重新执行
  createEffect(() => {
    const graphics = g();
    if (!graphics) return;

    const size = Math.max(1, Math.floor(props.size));
    const color = tileColor();

    graphics.clear();
    // 可选：换成 rect(0.5,0.5,size-1,size-1) 做像素对齐
    graphics.rect(0, 0, size, size).fill({ color });
    graphics.stroke({ width: 1, color: 0x000000, alpha: 0.15 });

    if (props.tile.type === TileType.Fog) {
      graphics.rect(0, 0, size, size).fill({ color: 0x000000, alpha: 0.28 });
    }
  });

  const x = props.coord.x * props.size;
  const y = props.coord.y * props.size;

  return (
    <P.Container x={x} y={y}>
      {/* 按官方示例，把 ref 绑定到 setG（signal setter） */}
      <P.Graphics ref={setG} />

      {/* icon：注意这里传入的是 iconTexture()（实际 Texture）而不是 Accessor */}
      <Show when={iconTexture()}>
        <P.Sprite
          texture={iconTexture()!}
          width={props.size * 0.6}
          height={props.size * 0.6}
          x={props.size / 2}
          y={props.size / 2}
          anchor={0.5}
          tint={ownerTint()}
        />
      </Show>

      {/* 兵力：Text 的文本放 children（solid-pixi 的类型要求） */}
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
