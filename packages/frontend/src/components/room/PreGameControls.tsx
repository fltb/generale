import { type Component, createSignal, Show } from "solid-js";

export interface PreGameControlsProps {
  started: boolean;
  isHost: boolean;
  onReadyToggle: (ready: boolean) => void;
  onStartGame?: () => void;
  onLeave?: () => void;
  onDisband?: () => void;
}

export const PreGameControls: Component<PreGameControlsProps> = (props) => {
  const [ready, setReady] = createSignal(false);

  return (
    <div class="space-y-3">
      <div class="flex gap-3">
        <Show when={!props.isHost}>
          <button
            class={`btn ${ready() ? 'btn-success' : 'btn-primary'}`}
            onClick={() => { setReady(r => !r); props.onReadyToggle(!ready()); }}
          >
            {ready() ? '取消准备' : '准备'}
          </button>
        </Show>

        <Show when={props.isHost}>
          <button
            class="btn btn-accent"
            onClick={() => props.onStartGame?.()}
            disabled={props.started}
          >
            开始游戏
          </button>
        </Show>

        <button class="btn btn-ghost" onClick={() => props.onLeave?.()}>离开房间</button>

        <Show when={props.isHost}>
          <button class="btn btn-error" onClick={() => props.onDisband?.()}>解散房间</button>
        </Show>
      </div>
    </div>
  );
};
