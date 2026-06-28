import type { GameId, PlayerId, SyncedPreGameServerEventPayload } from "@generale/types";
import { useNavigate } from "@solidjs/router";
import { type Component, createEffect, createSignal, Show } from "solid-js";
import { Application } from "solid-pixi";
import { DEFAULT_TILE_THEME } from "~/game/render/tileTheme";
import { useGameSession } from "~/game/useGameSession";
import bridge from "~/testBridge";
import { Badge, Button, Confetti, Countdown, Overlay, sfx, TakeoverOverlay, uiTheme } from "~/ui";
import { useT } from "~/i18n/useT";
import { MapRender, type ViewportApi } from "../MapRender";
import PlayerList from "./PlayerList";

export interface GameWithSyncProps {
  domain: string;
  gameId: GameId;
  playerId: PlayerId;
  autoOpen?: boolean;
  spectate?: boolean;
  freshStart?: boolean;
  onStateUpdate?: (payload: { event?: SyncedPreGameServerEventPayload }) => void;
  onDismissGameEnd?: () => void;
  onLeaveSpectate?: () => void;
}

export const GameWithSync: Component<GameWithSyncProps> = (props) => {
  const navigate = useNavigate();
  const { t } = useT();

  const ctrl = useGameSession({
    domain: props.domain,
    gameId: props.gameId,
    playerId: props.playerId,
    get spectate() {
      return props.spectate;
    },
    onStateUpdate: props.onStateUpdate,
    onDismissGameEnd: props.onDismissGameEnd,
  });

  function handleReturnToLobby(): void {
    if (!ctrl.gameEndedInfo()) return;
    props.onDismissGameEnd?.();
    navigate("/");
  }

  const mergedState = ctrl.mergedState;
  const endgameResult = ctrl.endgameResult;

  const mapReady = () => (mergedState()?.map?.width ?? 0) > 0;

  const [showCountdown, setShowCountdown] = createSignal(true);

  const [celebrate, setCelebrate] = createSignal(false);
  const [viewportApi, setViewportApi] = createSignal<ViewportApi | null>(null);

  createEffect(() => {
    const api = viewportApi();
    if (api) {
      bridge.viewportApi = {
        panMap: (_dx, _dy) => {},
        zoomMap: (_scale) => {},
        zoomIn: () => api.zoomIn(),
        zoomOut: () => api.zoomOut(),
        zoomReset: () => api.zoomReset(),
        getViewport: () => null,
      };
    }
  });
  const [playerPanelOpen, setPlayerPanelOpen] = createSignal(true);
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
    <div class="fixed inset-0 overflow-hidden select-none">
      {/* ---- 全屏地图背景 ---- */}
      <Show
        when={mapReady()}
        fallback={
          <div class="flex h-full w-full flex-col items-center justify-center gap-3 bg-base-300 text-base-content">
            <div class="font-display text-2xl text-primary animate-pulse">{t("Assembling the army…")}</div>
            <div class="text-sm opacity-60">{t("Syncing with the battlefield")}</div>
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
            onViewportReady={setViewportApi}
          />
        </Application>
      </Show>

      {/* ---- HUD: 顶部信息栏 ---- */}
      <div data-testid="game-hud" class="absolute top-0 left-0 right-0 flex items-center justify-between bg-base-200/70 backdrop-blur-sm px-3 py-2">
        <div class="flex items-center gap-3 text-sm">
          <span data-testid="game-id" class="font-semibold tracking-wide">{props.gameId}</span>
          <span class="opacity-60">
            Tick <span class="font-mono">{mergedState()?.tick}</span>
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <Show
            when={!props.spectate}
            fallback={
              <>
                <Badge variant="info" class="badge-xs" data-testid="spectator-badge">
                  {t("Spectating")}
                </Badge>
                <Button size="xs" variant="ghost" onClick={() => props.onLeaveSpectate?.()}>
                  {t("Leave Spectate")}
                </Button>
              </>
            }
          >
            <Button size="xs" variant="ghost" onClick={ctrl.handleClearQueue}>
              {t("Clear Queue")}
            </Button>
            <Button data-testid="surrender" size="xs" variant="warning" onClick={ctrl.handleSurrender}>
              {t("Surrender")}
            </Button>
            <Button size="xs" variant="ghost" onClick={ctrl.handleLeave}>
              {t("Leave")}
            </Button>
          </Show>
        </div>
      </div>

      {/* ---- HUD: 右侧玩家面板 ---- */}
      <div class="absolute right-0 top-10 max-h-[calc(100vh-8rem)] flex flex-col gap-0">
        <button
          type="button"
          class="self-end mr-2 bg-base-200/70 backdrop-blur-sm px-2 py-0.5 text-xs pixel-border"
          onClick={() => setPlayerPanelOpen((v) => !v)}
        >
          {playerPanelOpen() ? t("▶ Collapse") : t("◀ Players")}
        </button>
        <Show when={playerPanelOpen()}>
          <div class="w-44 max-h-full bg-base-200/70 backdrop-blur-sm overflow-auto mr-2">
            <PlayerList state={ctrl.state} compact />
          </div>
        </Show>
      </div>

      {/* ---- HUD: 底部缩放控制 ---- */}
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-base-200/80 backdrop-blur-sm pixel-border rounded px-3 py-1.5">
        <Button size="xs" variant="ghost" onClick={() => viewportApi()?.zoomOut()} title={t("Zoom Out (−)")}>
          −
        </Button>
        <Button size="xs" variant="ghost" onClick={() => viewportApi()?.zoomReset()} title={t("Reset Zoom (0)")}>
          ⊙
        </Button>
        <Button size="xs" variant="ghost" onClick={() => viewportApi()?.zoomIn()} title={t("Zoom In (=)")}>
          +
        </Button>
      </div>

      {/* ---- 开局倒计时 ---- */}
      <Show when={props.freshStart && mapReady() && showCountdown()}>
        <Countdown from={3} onDone={() => setShowCountdown(false)} />
      </Show>

      {/* ---- Displaced overlay ---- */}
      <Show when={ctrl.displaced()}>
        <TakeoverOverlay scope={t("Game")} dim={70} />
      </Show>

      {/* ---- 胜利纸屑 ---- */}
      <Show when={celebrate()}>
        <Confetti />
      </Show>

      {/* ---- 结算 overlay ---- */}
      <Show when={ctrl.gameEndedInfo()}>
        <Overlay dim={70} data-testid="game-end-overlay">
          <Show
            when={endgameResult()?.selfOutcome === "won"}
            fallback={
              <Show
                when={endgameResult()?.selfOutcome === "lost"}
                fallback={<h1 class="font-display text-4xl mb-4 animate-slam">{t("Game Over")}</h1>}
              >
                <h1 class={`font-display text-5xl mb-4 animate-slam ${uiTheme.outcome.lost}`}>{t("You Lost")}</h1>
              </Show>
            }
          >
            <h1 class={`font-display text-5xl mb-4 animate-slam ${uiTheme.outcome.won}`}>{t("You Won")}</h1>
          </Show>

          <Show when={endgameResult()?.winnerLabel}>
            <p class="mb-2 text-lg">
              {t("Winner: ")}<span class="font-semibold">{endgameResult()?.winnerLabel}</span>
            </p>
          </Show>

          <Show when={(endgameResult()?.loserLabels ?? []).length > 0}>
            <p class="mb-4 text-sm opacity-80">{t("Losers: ")}{endgameResult()?.loserLabels.join(" / ")}</p>
          </Show>

          <p class="mb-4 opacity-70">{t("Returning to room in 5 seconds…")}</p>

          <div class="flex gap-4">
            <Button variant="primary" onClick={ctrl.handleBackToRoom}>
              {t("Back to Room")}
            </Button>

            <Button variant="secondary" onClick={handleReturnToLobby}>
              {t("Back to Lobby")}
            </Button>
          </div>
        </Overlay>
      </Show>
    </div>
  );
};

export default GameWithSync;
