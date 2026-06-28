import { type Component, Show } from "solid-js";
import { useT } from "~/i18n/useT";
import { Button, sfx } from "~/ui";

export interface PreGameControlsProps {
  started: boolean;
  isHost: boolean;
  ready: boolean;
  onReadyToggle: (ready: boolean) => void;
  onStartGame?: () => void;
  onLeave?: () => void;
  onDisband?: () => void;
}

export const PreGameControls: Component<PreGameControlsProps> = (props) => {
  const { t } = useT();
  return (
    <div class="space-y-3">
      <div class="flex gap-3">
        <Show when={!props.isHost}>
          <Button
            data-testid="ready-toggle"
            silent
            variant={props.ready ? "success" : "primary"}
            onClick={() => {
              if (props.ready) sfx.unready();
              else sfx.ready();
              props.onReadyToggle(!props.ready);
            }}
            disabled={props.started}
            title={props.started ? t("游戏已开始，无法改变准备") : props.ready ? t("取消准备") : t("准备")}
          >
            {props.ready ? t("取消准备") : t("准备")}
          </Button>
        </Show>

        <Show when={props.isHost}>
          <Button data-testid="start-game" variant="accent" onClick={() => props.onStartGame?.()} disabled={props.started}>
            {t("开始游戏")}
          </Button>
        </Show>

        <Button variant="ghost" data-testid="leave-room" onClick={() => props.onLeave?.()}>
          {t("离开房间")}
        </Button>

        <Show when={props.isHost}>
          <Button variant="error" data-testid="disband-room" onClick={() => props.onDisband?.()}>
            {t("解散房间")}
          </Button>
        </Show>
      </div>
    </div>
  );
};

export default PreGameControls;
