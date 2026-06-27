import type {
  GameId,
  PlayerId,
  PreGamePlayerStatus,
  PreGameRoomState,
  SyncedPreGameServerEventPayload,
} from "@generale/types";
import { type Component, Show } from "solid-js";
import { makeEmptyRoom } from "~/game/defaults";
import type { PregameController } from "~/game/usePreGameRoom";
import { Alert, Button, Card, Panel, TakeoverOverlay } from "~/ui";
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
        <TakeoverOverlay scope="房间" dim={60} />
      </Show>

      <Show when={ctrl.notice()}>
        <Alert variant="info" class="shadow-lg">
          <div>
            Notice:
            <span>{ctrl.notice()}</span>
          </div>
        </Alert>
      </Show>

      <Show when={ctrl.gameInProgress()}>
        <Alert variant="info" class="shadow-sm mb-3">
          <div class="flex items-center justify-between w-full gap-3">
            <div>
              <div class="font-medium">游戏进行中</div>
              <div class="text-sm opacity-70">
                <Show when={ctrl.isLobby()} fallback={"你正在观战中。"}>
                  你可以在大厅等待本局结束，或进入观战。
                </Show>
              </div>
            </div>
            <Show when={ctrl.isLobby()}>
              <Button size="sm" variant="primary" onClick={ctrl.onEnterSpectate}>
                进入观战
              </Button>
            </Show>
            <Show when={ctrl.isSpectating()}>
              <Button size="sm" variant="ghost" onClick={ctrl.onLeaveSpectate}>
                退出观战
              </Button>
            </Show>
          </div>
        </Alert>
      </Show>

      <Card class="bg-base-200 p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold">房间信息</div>
            <div data-testid="room-game-id" class="text-sm opacity-70">Game ID: {room()?.gameId}</div>
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
                    alert("邀请链接已复制到剪贴板");
                  });
                }}
              >
                复制邀请链接
              </Button>
            </Show>
            <div class="opacity-70 text-sm">
              玩家上限 {room()?.playerLimit} · 队伍数 {room()?.teamCount}
            </div>
          </div>
        </div>
      </Card>

      <Panel title="玩家列表">
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

      <Panel title="房间设置" titleClass="text-lg font-semibold mb-2">
        <PreGameRoomStateFrom
          state={room()?.gameSetting ?? makeEmptyRoom().gameSetting}
          map={room()?.mapSetting ?? makeEmptyRoom().mapSetting}
          onChange={(s) => ctrl.onSettingChange(s)}
        />
      </Panel>

      <Panel title="房间模式">
        <div class="flex items-center gap-3 mb-3">
          <div class="btn-group">
            <Button
              size="sm"
              active={(room()?.roomType ?? "standard") === "standard"}
              disabled={!isHost()}
              onClick={() => ctrl.onRoomTypeChange("standard")}
            >
              Standard
            </Button>
            <Button
              size="sm"
              active={(room()?.roomType ?? "standard") === "custom"}
              disabled={!isHost()}
              onClick={() => ctrl.onRoomTypeChange("custom")}
            >
              Custom
            </Button>
          </div>
          <span class="text-xs opacity-60">
            {(room()?.roomType ?? "standard") === "standard"
              ? "仅可选 small / medium / large 预设"
              : "可自定义地图尺寸、地形频率等"}
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
              单人
            </Button>
            <Button
              size="sm"
              active={(room()?.teamMode ?? "ffa") === "team"}
              disabled={!isHost()}
              onClick={() => ctrl.onTeamModeChange("team")}
            >
              组队
            </Button>
          </div>
          <span class="text-xs opacity-60">
            {(room()?.teamMode ?? "ffa") === "ffa" ? "每人一队，前端隐藏队伍信息" : "可自由组队、换队、重命名"}
          </span>
        </div>
      </Panel>

      <Panel title="地图设置">
        <PreGameMapSettingForm
          setting={room()?.mapSetting ?? makeEmptyRoom().mapSetting}
          roomType={room()?.roomType ?? "standard"}
          onChange={(next) => ctrl.onMapChange(next)}
        />
      </Panel>

      <Panel title="操作">
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
