import { Application, P } from "solid-pixi";
import { createSignal, createMemo } from "solid-js";
import type { BombermanState } from "@generale/types";
import { useBombermanInput } from "./hooks/useBombermanInput";
import { MapLayer } from "./components/MapLayer";
import { EntityLayer } from "./components/EntityLayer";
import { HUD } from "./components/HUD";
import { VirtualControls } from "./components/VirtualControls";
import { Scoreboard } from "./components/Scoreboard";

interface BombermanGameProps {
  initialState: BombermanState;
  onAction: (op: any) => void;
  onBackToRoom: () => void;
}

export function BombermanGame(props: BombermanGameProps) {
  const { showVirtualControls } = useBombermanInput(props.onAction);
  const [showScoreboard] = createSignal(false);
  const state = createMemo(() => props.initialState);

  return (
    <div class="relative w-full h-screen overflow-hidden bg-gray-900">
      <div class="absolute inset-0" style={{ transform: "scale(2)", transformOrigin: "top left" }}>
        <Application resizeTo={window}>
          <MapLayer tiles={state().map.tiles} />
          <EntityLayer
            players={Object.values(state().players)}
            bombs={state().bombs}
            explosions={state().explosions}
            items={state().items}
          />
        </Application>
      </div>

      <HUD
        timeLeft={state().roundTimer ?? 0}
        aliveCount={Object.values(state().players).filter((p) => p.alive).length}
        totalPlayers={Object.keys(state().players).length}
      />

      {showVirtualControls() && <VirtualControls onAction={props.onAction} />}

      {showScoreboard() && (
        <Scoreboard
          players={Object.values(state().players).map((p) => ({
            name: p.playerId.slice(0, 8),
            rank: p.alive ? 1 : 2,
            score: p.alive ? 100 : 0,
          }))}
          onBackToRoom={props.onBackToRoom}
        />
      )}
    </div>
  );
}
