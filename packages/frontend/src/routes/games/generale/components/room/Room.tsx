import type {
  GameId,
  PlayerId,
  PreGamePlayerStatus,
  PreGameRoomState,
  SyncedPreGameServerEventPayload,
} from "@generale/types";
import { type Component, Show } from "solid-js";
import { makeEmptyRoom } from "~/routes/games/generale/hooks/defaults";
import type { PregameController } from "~/routes/games/generale/hooks/usePreGameRoom";
import { Alert, Button, Card, Panel, TakeoverOverlay } from "~/ui";
import { useT } from "~/i18n/useT";
import { PlayerList } from "./PlayerList";
import { PreGameControls } from "./PreGameControls";
import { PreGameMapSettingForm } from "./PreGameMapSettingForm";
import { PreGameRoomStateFrom } from "./StateForm";

export interface RoomWithSyncProps {
  ctrl: PregameController;
  playerId: PlayerId;
  gameId: GameId;
  visible?: boolean;
  password?: string;
  onStateUpdate?: (payload: { event?: SyncedPreGameServerEventPayload }) => void;
  onSelfStatusChange?: (status: PreGamePlayerStatus) => void;
  onRoomStateChange?: (room: PreGameRoomState) => void;
  onGameEndedReceived?: () => void;
  onExposeApi?: (api: { leaveSpectate: () => void } | null) => void;
}

/**
 * Room 组件：只负责渲染。连接 / 状态 / 动作由外部（ConnectedRoom）注入。
 */
export const RoomWithSync: Component<RoomWithSyncProps> = (props) => {
  const ctrl = props.ctrl;
  const { t } = useT();

  const room = ctrl.room;
  const selfId = ctrl.selfId;
  const isHost = ctrl.isHost;

  // Render: control visibility via root wrapper style so component never unmounts.
  // 用 accessor 包裹保持响应性：直接 const wrapperStyle = {...} 会在组件初始化时
  // 把 props.visible 锁死，phase 切换时 display 不会更新。
  // visible 缺省视为 true（向后兼容：不传也算可见）。
  const wrapperStyle = (): Record<string, string> => ({
    display: props.visible === false ? "none" : "block",
  });

  return (
    <div style={wrapperStyle()} class="p-6" aria-hidden={props.visible === false}>
      {/* 被同 user 另一个 sub 接管：盖一层模态挡住操作 */}
      <Show when={ctrl.displaced()}>
        <TakeoverOverlay scope={t("Room")} dim={60} />
      </Show>

      <Show when={ctrl.notice()}>
        <Alert variant="info" class="shadow-lg">
          <div>
            {t("Notice:")}
            <span>{ctrl.notice()}</span>
          </div>
        </Alert>
      </Show>

      <Show when={ctrl.gameInProgress()}>
        <Alert variant="info" class="shadow-sm mb-3">
          <div class="flex items-center justify-between w-full gap-3">
            <div>
              <div class="font-medium">{t("Game in Progress")}</div>
              <div class="text-sm opacity-70">
                <Show when={ctrl.isLobby()} fallback={t("You are spectating.")}>
                  {t("You can wait in the lobby for the game to end, or enter spectator mode.")}
                </Show>
              </div>
            </div>
            <Show when={ctrl.isLobby()}>
              <Button size="sm" variant="primary" onClick={ctrl.onEnterSpectate}>
                {t("Enter Spectate")}
              </Button>
            </Show>
            <Show when={ctrl.isSpectating()}>
              <Button size="sm" variant="ghost" onClick={ctrl.onLeaveSpectate}>
                {t("Leave Spectate")}
              </Button>
            </Show>
          </div>
        </Alert>
      </Show>

      <Card class="bg-base-200 p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold">{t("Room Info")}</div>
            <div data-testid="room-game-id" class="text-sm opacity-70">
              Game ID: {room()?.gameId}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Show when={isHost()}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const pw = props.password;
                  const link = `${location.origin}/game/${encodeURIComponent(props.gameId)}${pw ? `?join=${encodeURIComponent(pw)}` : ""}`;
                  navigator.clipboard.writeText(link).then(() => {
                    alert(t("Invite link copied to clipboard"));
                  });
                }}
              >
                {t("Copy Invite Link")}
              </Button>
            </Show>
            <div class="opacity-70 text-sm">
              {t("Player Limit")} {room()?.playerLimit} · {t("Teams")} {room()?.teamCount}
            </div>
          </div>
        </div>
      </Card>

      <Panel title={t("Player List")}>
        <PlayerList
          players={room()?.players ?? []}
          selfId={selfId()}
          hostId={room()?.hostId ?? ""}
          teamCount={room()?.teamCount ?? 2}
          teams={room()?.teams ?? []}
          teamMode={room()?.teamMode ?? "ffa"}
          onToggleReady={(playerId, ready) => ctrl.onToggleReadyForPlayer(playerId, ready)}
          onKick={isHost() ? ctrl.onKick : undefined}
          onTransferHost={isHost() ? ctrl.onTransferHost : undefined}
          onChangeTeam={(playerId, teamId) => {
            // playerId here is target player id (for joining, pass undefined to mean self)
            if (!playerId || playerId === selfId()) {
              // normal "join team" by clicking header -> move self
              ctrl.onChangeTeam(undefined, teamId);
            } else {
              // host moving other player
              ctrl.onChangeTeam(playerId, teamId);
            }
          }}
          onCreateTeam={isHost() ? ctrl.onCreateTeam : undefined}
          onRenameTeam={isHost() ? ctrl.onRenameTeam : undefined}
          onDeleteTeam={isHost() ? ctrl.onDeleteTeam : undefined}
          onChangeColor={ctrl.onChangeColor}
        />
      </Panel>

      <Panel title={t("Room Settings")} titleClass="text-lg font-semibold mb-2">
        <PreGameRoomStateFrom
          state={room()?.gameSetting ?? makeEmptyRoom().gameSetting}
          map={room()?.mapSetting ?? makeEmptyRoom().mapSetting}
          onChange={(s) => ctrl.onSettingChange(s)}
        />
      </Panel>

      <Panel title={t("Room Mode")}>
        <div class="flex items-center gap-3 mb-3">
          <div class="btn-group">
            <Button
              size="sm"
              active={(room()?.roomType ?? "standard") === "standard"}
              disabled={!isHost()}
              onClick={() => ctrl.onRoomTypeChange("standard")}
            >
              {t("Standard")}
            </Button>
            <Button
              size="sm"
              active={(room()?.roomType ?? "standard") === "custom"}
              disabled={!isHost()}
              onClick={() => ctrl.onRoomTypeChange("custom")}
            >
              {t("Custom")}
            </Button>
          </div>
          <span class="text-xs opacity-60">
            {(room()?.roomType ?? "standard") === "standard"
              ? t("Only small / medium / large presets available")
              : t("Customize map size, tile frequency, etc.")}
          </span>
        </div>

        <div class="flex items-center gap-3">
          <div class="btn-group">
            <Button
              size="sm"
              active={(room()?.teamMode ?? "ffa") === "ffa"}
              disabled={!isHost()}
              onClick={() => ctrl.onTeamModeChange("ffa")}
            >
              {t("Solo")}
            </Button>
            <Button
              size="sm"
              active={(room()?.teamMode ?? "ffa") === "team"}
              disabled={!isHost()}
              onClick={() => ctrl.onTeamModeChange("team")}
            >
              {t("Teams")}
            </Button>
          </div>
          <span class="text-xs opacity-60">
            {(room()?.teamMode ?? "ffa") === "ffa"
              ? t("Each player is their own team; team info hidden from UI")
              : t("Free to form teams, switch teams, rename")}
          </span>
        </div>
      </Panel>

      <Panel title={t("Map Settings")}>
        <PreGameMapSettingForm
          setting={room()?.mapSetting ?? makeEmptyRoom().mapSetting}
          roomType={room()?.roomType ?? "standard"}
          onChange={(next) => ctrl.onMapChange(next)}
        />
      </Panel>

      <Panel title={t("Actions")}>
        <PreGameControls
          isHost={isHost()}
          started={room()?.started ?? false}
          ready={ctrl.selfReady()}
          onReadyToggle={(ready: boolean) => ctrl.onToggleReadyForSelf(ready)}
          onStartGame={isHost() ? ctrl.onStartGame : undefined}
          onLeave={ctrl.onLeave}
          onDisband={isHost() ? ctrl.onDisband : undefined}
        />
      </Panel>
    </div>
  );
};

export default RoomWithSync;
