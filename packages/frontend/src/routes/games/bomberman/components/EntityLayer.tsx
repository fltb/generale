import type { BombermanPlayer, Bomb, Explosion, Item } from "@generale/types";
import { For, Show } from "solid-js";

const TILE_SIZE = 36;
const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"];

interface EntityLayerProps {
  players: BombermanPlayer[];
  bombs: Bomb[];
  explosions: Explosion[];
  items: Item[];
}

export function EntityLayer(props: EntityLayerProps) {
  return (
    <div class="pointer-events-none">
      <For each={props.players}>
        {(player, i) => (
          <Show when={player.alive}>
            <div
              class="absolute rounded-full w-5 h-5 transition-all"
              style={{
                background: PLAYER_COLORS[i() % PLAYER_COLORS.length],
                left: `${player.x * TILE_SIZE + 8}px`,
                top: `${player.y * TILE_SIZE + 8}px`,
              }}
            />
          </Show>
        )}
      </For>

      <For each={props.bombs}>
        {(bomb) => (
          <div
            class="absolute rounded w-5 h-5"
            style={{
              background: bomb.fuse % 4 < 2 ? "#333" : "#f00",
              left: `${bomb.x * TILE_SIZE + 6}px`,
              top: `${bomb.y * TILE_SIZE + 6}px`,
            }}
          />
        )}
      </For>

      <For each={props.explosions}>
        {(exp) => (
          <div
            class="absolute"
            style={{
              width: `${TILE_SIZE}px`,
              height: `${TILE_SIZE}px`,
              left: `${exp.x * TILE_SIZE}px`,
              top: `${exp.y * TILE_SIZE}px`,
              background: "#f60",
              opacity: exp.ttl / 8,
            }}
          />
        )}
      </For>

      <For each={props.items}>
        {(item) => (
          <div
            class="absolute w-3 h-3"
            style={{
              left: `${item.x * TILE_SIZE + 14}px`,
              top: `${item.y * TILE_SIZE + 14}px`,
              background: "#ff0",
            }}
          />
        )}
      </For>
    </div>
  );
}
