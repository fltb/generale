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
            title={props.started ? t("Game already started, cannot change ready status") : props.ready ? t("Cancel Ready") : t("Ready")}
          >
            {props.ready ? t("Cancel Ready") : t("Ready")}
          </Button>
        </Show>

        <Show when={props.isHost}>
          <Button data-testid="start-game" variant="accent" onClick={() => props.onStartGame?.()} disabled={props.started}>
            {t("Start Game")}
          </Button>
        </Show>

        <Button variant="ghost" data-testid="leave-room" onClick={() => props.onLeave?.()}>
          {t("Leave Room")}
        </Button>

        <Show when={props.isHost}>
          <Button variant="error" data-testid="disband-room" onClick={() => props.onDisband?.()}>
            {t("Disband Room")}
          </Button>
        </Show>
      </div>
    </div>
  );
};

export default PreGameControls;
