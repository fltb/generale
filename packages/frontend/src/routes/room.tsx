import {
  type Component,
  createSignal,
  createEffect,
  Show,
  onCleanup,
  Switch,
  Match,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import RoomWithSync, { type RoomWithSyncProps } from "~/components/room/Room";
import GameWithSync from "~/components/game/Game";
import { prepareConnectApi } from "~/api/gameApi";
import { GamePhase, SyncedPreGameServerEventPayloadType } from "@generale/types";

const RoomRoute: Component = () => {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [playerId, setPlayerId] = createSignal<string | null>(null);
  const [playerName, setPlayerName] = createSignal<string | null>(null);
  const [domainPrimary, setDomainPrimary] = createSignal<string | null>(null);
  const [phase, setPhase] = createSignal<GamePhase | "IDLE">(GamePhase.PREGAME);

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // HTTP prepare
  createEffect(() => {
    if (!params.id) return;
    const id = params.id;

    setError(null);
    setDomainPrimary(null);
    setPlayerId(null);
    setPlayerName(null);
    setPhase(GamePhase.PREGAME);

    let cancelled = false;
    onCleanup(() => (cancelled = true));

    (async () => {
      setLoading(true);
      try {
        const resp = await prepareConnectApi(id);
        if (cancelled) return;

        if (!resp?.success) {
          setError((resp as any)?.error ?? "Connect failed");
          return;
        }

        const data = resp.data;
        setPlayerId(data.playerId);
        setPlayerName(null); // TODO: get name use user api
        setPhase(data.phase);
        setDomainPrimary(data.domains.primary);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
  });

  /** 子组件统一上报 phase */
  const handlePhaseChange: RoomWithSyncProps["onStateUpdate"] = (next) => {

    if (next.event) {
      switch (next.event.type) {
        case SyncedPreGameServerEventPayloadType.KICKED:
          setError("你已被提出房间");
          setPhase(GamePhase.ENDED);
          break;
        case SyncedPreGameServerEventPayloadType.DISBANDED:
          setPhase(GamePhase.DISBANDED);
          break;
        case SyncedPreGameServerEventPayloadType.GAME_STARTED:
          setPhase(GamePhase.INGAME);
          break; // 已经在 setPhase 处理
      }
    }
  };

  return (
    <main class="container mx-auto p-6">
      {/* 错误优先 */}
      <Switch>
        <Match when={!!error()}>
          <div class="alert alert-error mb-4">
            <span>{error()}</span>
            <button
              class="btn btn-sm btn-ghost mt-2"
              onClick={() => navigate("/")}
            >
              返回大厅
            </button>
          </div>
        </Match>

        <Match when={loading()}>
          <div class="card p-4 mb-4">Preparing connection...</div>
        </Match>

        <Match when={domainPrimary() && phase() === GamePhase.PREGAME}>
          <RoomWithSync
            domain={domainPrimary()!}
            gameId={params.id!}
            playerName={playerName() || "Guest"}
            playerId={playerId() ?? ""}
            autoOpen
            onStateUpdate={handlePhaseChange}
          />
        </Match>

        <Match when={domainPrimary() && phase() === GamePhase.INGAME}>
          <GameWithSync
            domain={domainPrimary()!}
            gameId={params.id!}
            playerId={playerId() ?? ""}
            onStateUpdate={handlePhaseChange}
          />
        </Match>

        <Match when={phase() === GamePhase.DISBANDED}>
          <div class="card p-4">
            <div>房间已解散</div>
            <button class="btn btn-primary mt-2" onClick={() => navigate("/")}>
              返回大厅
            </button>
          </div>
        </Match>


        <Match when={phase() === GamePhase.ENDED}>
          <div class="card p-4">
            <div>Game ended.</div>
            <button class="btn btn-primary mt-2" onClick={() => navigate("/")}>
              返回大厅
            </button>
          </div>
        </Match>
      </Switch>
    </main>);
};

export default RoomRoute;
