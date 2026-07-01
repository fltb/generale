import { createSignal, onCleanup } from "solid-js";
import type { BombermanOperation } from "@generale/types";

export function useBombermanInput(onAction: (op: BombermanOperation) => void) {
  const [showVirtualControls, setShowVirtualControls] = createSignal(false);
  setShowVirtualControls(window.matchMedia("(pointer: coarse)").matches);

  const keyMap: Record<string, BombermanOperation> = {
    ArrowUp: { type: "MOVE", direction: "up" },
    ArrowDown: { type: "MOVE", direction: "down" },
    ArrowLeft: { type: "MOVE", direction: "left" },
    ArrowRight: { type: "MOVE", direction: "right" },
    w: { type: "MOVE", direction: "up" },
    s: { type: "MOVE", direction: "down" },
    a: { type: "MOVE", direction: "left" },
    d: { type: "MOVE", direction: "right" },
    " ": { type: "PLACE_BOMB" },
    e: { type: "DETONATE" },
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key === "Spacebar" ? " " : e.key;
    const op = keyMap[key];
    if (op) {
      e.preventDefault();
      onAction(op);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  return { showVirtualControls };
}
