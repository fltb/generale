import { type Component, Show } from "solid-js";
import {
  type SyncedPreGameServerEventPayload,
  PreGamePlayerStatus,
  type GameId,
  type PlayerId,
} from "@generale/types";
import { PreGameRoomStateFrom } from "./StateForm";
import { PlayerList } from "./PlayerList";
import { PreGameControls } from "./PreGameControls";
import { PreGameMapSettingForm } from "./PreGameMapSettingForm";
import { usePreGameRoom } from "~/game/usePreGameRoom";
import { makeEmptyRoom } from "~/game/defaults";
import { Button, Card, Panel, Alert, TakeoverOverlay } from "~/ui";

export interface RoomWithSyncProps {
  domain: string;
  playerId: PlayerId;
  gameId: GameId;
  playerName: string;
  autoOpen?: boolean;
  /**
   * visible: 控制 UI 显示（true 或缺省 显示；false 隐藏但保持挂载）。
   * 隐藏而非 unmount 是为了避免 websocket 重连 / pregame instance 被误销毁。
   */
  visible?: boolean;
  /**
   * 父级回调：RoomWithSync 会在本地 state 更新 / server custom event 等场景调用此回调。
   * 注意 GAME_ENDED 不再走这里，而是通过专用 onGameEndedReceived。
   */
  onStateUpdate?: (payload: {
    event?: SyncedPreGameServerEventPayload;
  }) => void;
  /**
   * 当 self.status 变化时上报给父级——父级用这个决定显示房间还是游戏。
   * 缺省视为 Lobby（与服务端 enum 默认一致）。
   */
  onSelfStatusChange?: (status: PreGamePlayerStatus) => void;
  /**
   * 服务端 pregame 域的 GAME_ENDED 到达时调用。父级据此进入"结算窗口"维持
   * GameWithSync 挂载。和"用户 dismiss 结算 UI"是两条独立信号。
   */
  onGameEndedReceived?: () => void;
  /**
   * 暴露房间内部的几个 dispatcher 给父级，便于 GameWithSync（观战）等其它子组件
   * 触发 pregame 域的 action。只在挂载/卸载时调用一次。
   */
  onExposeApi?: (api: { leaveSpectate: () => void } | null) => void;
}

/**
 * Room 组件：连接 / 状态 / 动作全部委托给 usePreGameRoom 控制器，
 * 这里只负责渲染。
 */
export const RoomWithSync: Component<RoomWithSyncProps> = (props) => {
  const ctrl = usePreGameRoom({
    domain: props.domain,
    playerId: props.playerId,
    gameId: props.gameId,
    playerName: props.playerName,
    get visible() { return props.visible; },
    onStateUpdate: props.onStateUpdate,
    onSelfStatusChange: props.onSelfStatusChange,
    onGameEndedReceived: props.onGameEndedReceived,
    onExposeApi: props.onExposeApi,
  });

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
            <div class="text-sm opacity-70">Game ID: {room()?.gameId}</div>
          </div>
          <div>
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
        />
      </Panel>

      <Panel title="房间设置" titleClass="text-lg font-semibold mb-2">
        <PreGameRoomStateFrom
          state={room()?.gameSetting ?? (makeEmptyRoom().gameSetting)}
          map={room()?.mapSetting ?? (makeEmptyRoom().mapSetting)}
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
            >Standard</Button>
            <Button
              size="sm"
              active={(room()?.roomType ?? "standard") === "custom"}
              disabled={!isHost()}
              onClick={() => ctrl.onRoomTypeChange("custom")}
            >Custom</Button>
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
            >单人</Button>
            <Button
              size="sm"
              active={(room()?.teamMode ?? "ffa") === "team"}
              disabled={!isHost()}
              onClick={() => ctrl.onTeamModeChange("team")}
            >组队</Button>
          </div>
          <span class="text-xs opacity-60">
            {(room()?.teamMode ?? "ffa") === "ffa"
              ? "每人一队，前端隐藏队伍信息"
              : "可自由组队、换队、重命名"}
          </span>
        </div>
      </Panel>

      <Panel title="地图设置">
        <PreGameMapSettingForm
          setting={room()?.mapSetting ?? (makeEmptyRoom().mapSetting)}
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

      <Alert variant="info" class="shadow-lg">
        <div>
          Notice:
          <span>{ctrl.notice()}</span>
        </div>
      </Alert>
    </div>
  );
};

export default RoomWithSync;
