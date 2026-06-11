import { type Component, Show } from "solid-js";
import { Button, sfx } from "~/ui";

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
          <Button
            silent
            variant={props.ready ? "success" : "primary"}
            onClick={() => {
              // 准备/取消准备各有专属音效
              if (props.ready) sfx.unready(); else sfx.ready();
              // 交由父组件处理切换（父组件会 dispatch READY/UNREADY）
              props.onReadyToggle(!props.ready);
            }}
            disabled={props.started}
            title={props.started ? "游戏已开始，无法改变准备" : (props.ready ? "取消准备" : "准备")}
          >
            {props.ready ? '取消准备' : '准备'}
          </Button>
        </Show>

        <Show when={props.isHost}>
          <Button
            variant="accent"
            onClick={() => props.onStartGame?.()}
            disabled={props.started}
          >
            开始游戏
          </Button>
        </Show>

        <Button variant="ghost" onClick={() => props.onLeave?.()}>离开房间</Button>

        <Show when={props.isHost}>
          <Button variant="error" onClick={() => props.onDisband?.()}>解散房间</Button>
        </Show>
      </div>
    </div>
  );
};

export default PreGameControls;
