import { type Component, Show, createSignal, createEffect } from "solid-js";
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
import { Button, Card, Badge, Overlay, TakeoverOverlay, uiTheme, Countdown, Confetti, sfx } from "~/ui";

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
  /** 是否为全新开局（经 GAME_STARTED 进入）。仅全新开局放开局倒计时；重连/刷新/观战进来不放。 */
  freshStart?: boolean;
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

  // 地图是否已同步到（width>0）。pixi Application 只在地图就绪后挂载，
  // 避免在空地图(0x0)上初始化画布导致"只剩蓝底没有地图、刷新才好"的进场竞态。
  const mapReady = () => ((mergedState()?.map?.width ?? 0) > 0);

  // 开局倒计时：进入对局 UI 时播一次
  const [showCountdown, setShowCountdown] = createSignal(true);

  // 结算音效 + 胜利纸屑：selfOutcome 落定时各播一次
  const [celebrate, setCelebrate] = createSignal(false);
  let outcomePlayed = false;
  createEffect(() => {
    const outcome = endgameResult()?.selfOutcome;
    if (!outcome || outcomePlayed) return;
    outcomePlayed = true;
    if (outcome === "won") {
      sfx.victory();
      setCelebrate(true);
    } else if (outcome === "lost") {
      sfx.defeat();
    }
  });

  return (
    <div class="p-4">
      {/* 倒计时只在"全新开局"且战场就绪后播放；重连/刷新/观战进入进行中的对局不播 */}
      <Show when={props.freshStart && mapReady() && showCountdown()}>
        <Countdown from={3} onDone={() => setShowCountdown(false)} />
      </Show>

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
        {/* 地图就绪后才挂载 pixi 画布；未就绪时显示"召集军队中"占位，
            避免 pixi 在空地图上初始化引发的蓝屏进场竞态 */}
        <Show
          when={mapReady()}
          fallback={
            <div class="flex flex-col items-center justify-center gap-3 py-24 text-base-content">
              <div class="font-display text-2xl text-primary animate-pulse">召集军队中…</div>
              <div class="text-sm opacity-60">正在与战场同步</div>
            </div>
          }
        >
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
        </Show>
      </Card>

      {/* Displaced overlay：被同 user 另一个 sub 接管，盖整屏，不可关。
          优先级高于 end-game overlay（虽然两者一般不会同时出现）。 */}
      <Show when={ctrl.displaced()}>
        <TakeoverOverlay scope="游戏" dim={70} />
      </Show>

      <Show when={celebrate()}>
        <Confetti />
      </Show>

      <Show when={ctrl.gameEndedInfo()}>
        <Overlay dim={70}>
          <Show
            when={endgameResult()?.selfOutcome === "won"}
            fallback={
              <Show
                when={endgameResult()?.selfOutcome === "lost"}
                fallback={<h1 class="font-display text-4xl mb-4 animate-slam">游戏结束</h1>}
              >
                <h1 class={`font-display text-5xl mb-4 animate-slam ${uiTheme.outcome.lost}`}>你输了</h1>
              </Show>
            }
          >
            <h1 class={`font-display text-5xl mb-4 animate-slam ${uiTheme.outcome.won}`}>你赢了</h1>
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
