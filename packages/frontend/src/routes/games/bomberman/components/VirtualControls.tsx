import type { BombermanOperation } from "@generale/types";

interface VirtualControlsProps {
  onAction: (op: BombermanOperation) => void;
}

export function VirtualControls(props: VirtualControlsProps) {
  return (
    <div class="fixed bottom-4 left-4 right-4 flex justify-between pointer-events-none z-50">
      <div class="pointer-events-auto grid grid-cols-3 gap-1">
        <div />
        <button
          type="button"
          class="w-14 h-14 bg-gray-700/80 rounded text-white text-2xl active:bg-gray-500 select-none touch-none"
          onTouchStart={(e) => { e.preventDefault(); props.onAction({ type: "MOVE", direction: "up" }); }}
        >
          ▲
        </button>
        <div />
        <button
          type="button"
          class="w-14 h-14 bg-gray-700/80 rounded text-white text-2xl active:bg-gray-500 select-none touch-none"
          onTouchStart={(e) => { e.preventDefault(); props.onAction({ type: "MOVE", direction: "left" }); }}
        >
          ◀
        </button>
        <div class="w-14 h-14" />
        <button
          type="button"
          class="w-14 h-14 bg-gray-700/80 rounded text-white text-2xl active:bg-gray-500 select-none touch-none"
          onTouchStart={(e) => { e.preventDefault(); props.onAction({ type: "MOVE", direction: "right" }); }}
        >
          ▶
        </button>
        <div />
        <button
          type="button"
          class="w-14 h-14 bg-gray-700/80 rounded text-white text-2xl active:bg-gray-500 select-none touch-none"
          onTouchStart={(e) => { e.preventDefault(); props.onAction({ type: "MOVE", direction: "down" }); }}
        >
          ▼
        </button>
        <div />
      </div>
      <button
        type="button"
        class="pointer-events-auto w-16 h-16 bg-red-600/80 rounded-full text-white text-2xl font-bold active:bg-red-400 select-none touch-none"
        onTouchStart={(e) => { e.preventDefault(); props.onAction({ type: "PLACE_BOMB" }); }}
      >
        💣
      </button>
    </div>
  );
}
