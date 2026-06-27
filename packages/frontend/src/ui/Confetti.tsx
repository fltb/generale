import { type Component, For } from "solid-js";

/**
 * Confetti —— 纯 DOM 的像素纸屑，用于胜利庆祝。
 * 不依赖任何库/资源：一堆带随机颜色/位置/延迟的小方块用 CSS 关键帧下落。
 */
export interface ConfettiProps {
  count?: number;
}

const COLORS = ["#f2b21c", "#3b82c4", "#3fa34d", "#d23b3b", "#f5e6c8", "#b8439b"];

// 不用 Math.random（环境里被禁用且无所谓真随机）——用确定性伪散布即可。
function spread(i: number) {
  const left = (i * 73) % 100;
  const color = COLORS[i % COLORS.length];
  const delay = ((i * 37) % 100) / 100; // 0..1s
  const dur = 1.8 + ((i * 53) % 120) / 100; // 1.8..3s
  const size = 6 + (i % 3) * 3; // 6/9/12 px
  return { left, color, delay, dur, size };
}

export const Confetti: Component<ConfettiProps> = (props) => {
  const items = () => Array.from({ length: props.count ?? 80 }, (_, i) => spread(i));
  return (
    <div class="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <For each={items()}>
        {(c) => (
          <div
            style={{
              position: "absolute",
              top: "-12px",
              left: `${c.left}%`,
              width: `${c.size}px`,
              height: `${c.size}px`,
              "background-color": c.color,
              "image-rendering": "pixelated",
              animation: `confetti-fall ${c.dur}s steps(20) ${c.delay}s infinite`,
            }}
          />
        )}
      </For>
    </div>
  );
};

export default Confetti;
