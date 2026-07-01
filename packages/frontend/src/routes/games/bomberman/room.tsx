import { type BombermanState, GameStatus } from "@generale/types";
import { useParams, useNavigate } from "@solidjs/router";
import { createSignal, onMount } from "solid-js";
import { BombermanGame } from "./game";

export function BombermanRoom() {
  const params = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = createSignal<"loading" | "room" | "game" | "error">("loading");

  onMount(async () => {
    try {
      const res = await fetch(`/api/bomberman/room/connect/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setPhase("game");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    }
  });

  if (phase() === "loading") {
    return <div class="p-8 text-center">Loading...</div>;
  }

  if (phase() === "error") {
    return <div class="p-8 text-center text-red-500">Failed to connect</div>;
  }

  if (phase() === "game") {
    const dummyState: BombermanState = {
      status: GameStatus.Playing,
      tick: 0,
      map: {
        width: 15,
        height: 13,
        tiles: Array.from({ length: 13 }, () => Array.from({ length: 15 }, () => ({ type: "empty" as const }))),
      },
      players: {
        p1: { playerId: "p1", alive: true, x: 1, y: 1, bombMax: 1, bombActive: 0, blastRadius: 1, speed: 1, items: [] },
      },
      bombs: [],
      explosions: [],
      items: [],
      config: {
        mapWidth: 15,
        mapHeight: 13,
        playerLimit: 1,
        tickRate: 4,
        bombFuse: 12,
        bombLimit: 1,
        blastRadius: 1,
        roundTimeSec: 0,
        shrinkEnabled: false,
        itemDropRate: 0.6,
        items: ["BOMB_UP", "FIRE_UP"],
        mode: "multi",
      },
    };

    return <BombermanGame initialState={dummyState} onAction={() => {}} onBackToRoom={() => navigate("/bomberman")} />;
  }

  return null;
}
