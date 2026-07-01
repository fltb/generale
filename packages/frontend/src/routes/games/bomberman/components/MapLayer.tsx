import type { BombermanTile } from "@generale/types";
import { For } from "solid-js";

const TILE_SIZE = 36;
const HARD_WALL_COLOR = 0x666666;
const SOFT_WALL_COLOR = 0xccaa66;
const EMPTY_COLOR = 0x336633;

interface MapLayerProps {
  tiles: BombermanTile[][];
}

export function MapLayer(props: MapLayerProps) {
  return (
    <div
      class="grid"
      style={{
        display: "grid",
        "grid-template-columns": `repeat(${props.tiles[0]?.length ?? 0}, ${TILE_SIZE}px)`,
      }}
    >
      <For each={props.tiles}>
        {(row) => (
          <For each={row}>
            {(tile) => {
              let bg = EMPTY_COLOR;
              if (tile.type === "hard_wall") bg = HARD_WALL_COLOR;
              else if (tile.type === "soft_wall") bg = SOFT_WALL_COLOR;
              return (
                <div
                  style={{
                    width: `${TILE_SIZE}px`,
                    height: `${TILE_SIZE}px`,
                    background: `#${bg.toString(16).padStart(6, "0")}`,
                    border: "1px solid #444",
                  }}
                />
              );
            }}
          </For>
        )}
      </For>
    </div>
  );
}
