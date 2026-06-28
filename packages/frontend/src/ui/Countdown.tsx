import { type Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { sfx } from "./sound";
import { useT } from "~/i18n/useT";

/**
 * Countdown —— 开局 3…2…1…开战！全屏像素倒计时（带音效）。
 * 播完调用 onDone。挂载即开始。
 */
export interface CountdownProps {
  from?: number;
  onDone?: () => void;
}

export const Countdown: Component<CountdownProps> = (props) => {
  const { t } = useT();
  const [label, setLabel] = createSignal<string | null>(null);
  const timers: ReturnType<typeof setTimeout>[] = [];

  onMount(() => {
    const from = props.from ?? 3;
    let step = 0;
    const total = from + 1; // 数字若干步 + "开战!"

    const tick = () => {
      if (step < from) {
        setLabel(String(from - step));
        sfx.countdownBeep();
      } else if (step === from) {
        setLabel(t("Go!"));
        sfx.go();
      }
      step++;
      if (step <= total) {
        timers.push(setTimeout(tick, step === from + 1 ? 800 : 1000));
      } else {
        setLabel(null);
        props.onDone?.();
      }
    };
    tick();
  });

  onCleanup(() => timers.forEach(clearTimeout));

  return (
    <Show when={label()}>
      <div class="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center">
        <div
          class={`font-display text-7xl ${label() === t("Go!") ? "text-primary" : "text-base-content"} animate-countdown`}
          style={{ "text-shadow": "4px 4px 0 var(--pixel-ink)" }}
        >
          {label()}
        </div>
      </div>
    </Show>
  );
};

export default Countdown;
