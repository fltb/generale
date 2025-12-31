import {
  type Component,
  createSignal,
  createEffect,
  Show,
  onCleanup,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import RoomWithSync from "~/components/room/Room";
import GameWithSync from "~/components/game/Game";
import { prepareConnectApi } from "~/api/gameApi";
import { GamePhase } from "@generale/types";

const RoomRoute: Component = () => {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [playerId, setPlayerId] = createSignal<string | null>(null);
  const [playerName, setPlayerName] = createSignal<string | null>(null);
  const [domainPrimary, setDomainPrimary] = createSignal<string | null>(null);
  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.PREGAME);

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

        const data = (resp as any).data;
        setPlayerId(data.playerId);
        setPlayerName(data.playerName ?? null);
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
  const handlePhaseChange = (next: GamePhase) => {
    setPhase(next);

    if (next === GamePhase.DISBANDED) {
      navigate("/", { replace: true });
    }
  };

  return (
    <main class="container mx-auto p-6">
      <Show when={error()}>
        <div class="alert alert-error mb-4">
          <span>{error()}</span>
          <button class="btn btn-sm btn-ghost mt-2" onClick={() => navigate("/")}>
            返回大厅
          </button>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="card p-4 mb-4">Preparing connection...</div>
      </Show>

      <Show when={domainPrimary() && phase() === GamePhase.PREGAME}>
        <RoomWithSync
          domain={domainPrimary()!}
          gameId={params.id!}
          playerName={playerName() || "Guest"}
          playerId={playerId() ?? ""}
          autoOpen
          onPhaseChange={handlePhaseChange}
        />
      </Show>

      <Show when={domainPrimary() && phase() === GamePhase.INGAME}>
        <GameWithSync
          domain={domainPrimary()!}
          gameId={params.id!}
          playerId={playerId() ?? ""}
          onPhaseChange={handlePhaseChange}
        />
      </Show>

      <Show when={phase() === GamePhase.ENDED}>
        <div class="card p-4">
          <div>Game ended.</div>
          <button class="btn btn-primary mt-2" onClick={() => navigate("/")}>
            返回大厅
          </button>
        </div>
      </Show>
    </main>
  );
};

export default RoomRoute;
