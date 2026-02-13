import { type Component, Show } from "solid-js";

export interface PreGameControlsProps {
  started: boolean;
  isHost: boolean;
  ready: boolean; // <- 受控 ready 状态由上层传入
  onReadyToggle: (ready: boolean) => void;
  onStartGame?: () => void;
  onLeave?: () => void;
  onDisband?: () => void;
}

export const PreGameControls: Component<PreGameControlsProps> = (props) => {
  return (
    <div class="space-y-3">
      <div class="flex gap-3">
        <Show when={!props.isHost}>
          <button
            class={`btn ${props.ready ? 'btn-success' : 'btn-primary'}`}
            onClick={() => {
              // 交由父组件处理切换（父组件会 dispatch READY/UNREADY）
              props.onReadyToggle(!props.ready);
            }}
            disabled={props.started}
            title={props.started ? "游戏已开始，无法改变准备" : (props.ready ? "取消准备" : "准备")}
          >
            {props.ready ? '取消准备' : '准备'}
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

export default PreGameControls;
