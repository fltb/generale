import { type Component, Show } from "solid-js";
import {
  type SyncedPreGameServerEventPayload,
  type PlayerId,
  type GameId,
} from "@generale/types";
import { MapRender } from "../MapRender";
import { Application } from "solid-pixi";
import PlayerList from "./PlayerList";
import { useNavigate } from "@solidjs/router";
import { useGameSession } from "~/game/useGameSession";
import { DEFAULT_TILE_THEME } from "~/game/render/tileTheme";
import { Button, Card, Badge, Overlay, TakeoverOverlay, uiTheme } from "~/ui";

/**
 * Props:
 * - domain, gameId, playerId, ...
 * - onDismissGameEnd: 用户在结算 overlay 上点"回到房间" / 5s 计时器 / "返回大厅" 时调用。
 * - onStateUpdate: 把 server 自定义事件发给父层（用于展示/调试）
 */
export interface GameWithSyncProps {
  domain: string;
  gameId: GameId;
  playerId: PlayerId;
  autoOpen?: boolean;
  /**
   * 观战模式：connector 走的是同一个 game-* 域，但服务端会把这个连接接到
   * GameInstance.addSpectator 而非 addPlayer。客户端在这个模式下：
   * - 不发 PUSH / CLEAN_ALL / SURRENDER
   * - 隐藏操作按钮，"离开游戏" 替换成 "退出观战"（dispatch 到 pregame 域的 LEAVE_SPECTATE）
   * - MapRender 收到的 state 是未 mask 的完整地图
   *
   * 注意：LEAVE_SPECTATE 必须通过 pregame 域 dispatch。Game.tsx 自己不连 pregame，
   * 所以这里通过 onLeaveSpectate 回调把意图上报给父级（routes/room.tsx）路由处理。
   */
  spectate?: boolean;
  onStateUpdate?: (payload: { event?: SyncedPreGameServerEventPayload }) => void;
  onDismissGameEnd?: () => void;
  onLeaveSpectate?: () => void;
}

export const GameWithSync: Component<GameWithSyncProps> = (props) => {
  const navigate = useNavigate();

  const ctrl = useGameSession({
    domain: props.domain,
    gameId: props.gameId,
    playerId: props.playerId,
    get spectate() { return props.spectate; },
    onStateUpdate: props.onStateUpdate,
    onDismissGameEnd: props.onDismissGameEnd,
  });

  function handleReturnToLobby(): void {
    if (!ctrl.gameEndedInfo()) return;
    props.onDismissGameEnd?.();
    navigate('/');
  }

  const mergedState = ctrl.mergedState;
  const endgameResult = ctrl.endgameResult;

  return (
    <div class="p-4">
      <Card class="bg-base-200 p-3 mb-3 flex items-center justify-between">
        <div>
          <div class="text-lg font-semibold">游戏中 — {props.gameId}</div>
          <div class="text-sm opacity-70">Tick: {mergedState()?.tick}</div>
        </div>

        <div class="flex items-center gap-2">
          <Show when={!props.spectate} fallback={
            <>
              <Badge variant="info">观战中</Badge>
              <Button size="sm" variant="ghost" onClick={() => props.onLeaveSpectate?.()}>退出观战</Button>
            </>
          }>
            <Button size="sm" onClick={ctrl.handleClearQueue}>清空操作队列</Button>
            <Button size="sm" variant="warning" onClick={ctrl.handleSurrender}>投降</Button>
            <Button size="sm" variant="ghost" onClick={ctrl.handleLeave}>离开游戏</Button>
          </Show>
        </div>
      </Card>

      <PlayerList state={ctrl.state} />

      <Card class="bg-base-200 p-3">
        <Application
          background={DEFAULT_TILE_THEME.colors.appBackground}
          resizeTo={window}
          resolution={window.devicePixelRatio}
          autoDensity={true}
          antialias={true}
        >
          <MapRender
            state={mergedState()}
            onOperationQueued={ctrl.handleOperationQueued}
            selfId={props.spectate ? undefined : props.playerId}
            onClearQueue={props.spectate ? undefined : ctrl.handleClearQueue}
          />
        </Application>
      </Card>

      {/* Displaced overlay：被同 user 另一个 sub 接管，盖整屏，不可关。
          优先级高于 end-game overlay（虽然两者一般不会同时出现）。 */}
      <Show when={ctrl.displaced()}>
        <TakeoverOverlay scope="游戏" dim={70} />
      </Show>

      <Show when={ctrl.gameEndedInfo()}>
        <Overlay dim={70}>
          <Show
            when={endgameResult()?.selfOutcome === "won"}
            fallback={
              <Show
                when={endgameResult()?.selfOutcome === "lost"}
                fallback={<h1 class="text-4xl font-bold mb-4">游戏结束</h1>}
              >
                <h1 class={`text-5xl font-bold mb-4 ${uiTheme.outcome.lost}`}>你输了</h1>
              </Show>
            }
          >
            <h1 class={`text-5xl font-bold mb-4 ${uiTheme.outcome.won}`}>你赢了</h1>
          </Show>

          <Show when={endgameResult()?.winnerLabel}>
            <p class="mb-2 text-lg">
              获胜：<span class="font-semibold">{endgameResult()!.winnerLabel}</span>
            </p>
          </Show>

          <Show when={(endgameResult()?.loserLabels ?? []).length > 0}>
            <p class="mb-4 text-sm opacity-80">
              失败：{(endgameResult()!.loserLabels).join(" / ")}
            </p>
          </Show>

          <p class="mb-4 opacity-70">
            5 秒后返回房间
          </p>

          <div class="flex gap-4">
            <Button variant="primary" onClick={ctrl.handleBackToRoom}>
              回到房间
            </Button>

            <Button variant="secondary" onClick={handleReturnToLobby}>
              返回大厅
            </Button>
          </div>
        </Overlay>
      </Show>
    </div>
  );
};

export default GameWithSync;
