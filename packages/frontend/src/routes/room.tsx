import {
  type Component,
  createSignal,
  createEffect,
  Show,
  onCleanup,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import RoomWithSync from "~/components/room/Room";
import { prepareConnectApi } from "~/api/gameApi"; // 使用你提供的 service
// 如果你有 useAuth，可以在这里使用以显示用户名等
// import { useAuth } from "~/hooks/useAuth";

const RoomRoute: Component = () => {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [playerId, setPlayerId] = createSignal<string | null>(null); // 前端不再负责提供 playerId，但 接受后端返回（可选）
  const [playerName, setPlayerName] = createSignal<string | null>(null);
  const [domainPrimary, setDomainPrimary] = createSignal<string | null>(null);

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // When we have a gameId, call prepareConnectApi once to get domains/phase (server uses session to find player)
  createEffect(() => {
    if (!params.id) return;
    const id = params.id;
    console.log('id', id)
    // reset previous state
    setError(null);
    setDomainPrimary(null);
    setPlayerId(null);
    setPlayerName(null);

    // cancellation flag for this run
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    // use an async function so we can use try/finally cleanly
    (async () => {
      setLoading(true);
      try {
        const resp = await prepareConnectApi(id);

        // if this effect run was cancelled while waiting, bail out early
        if (cancelled) return;

        // resp shape expected: { success: boolean, data?, error? }
        if (!resp?.success) {
          // prefer resp.error (server-provided), fallback to generic text
          const serverMsg =
            (resp as any)?.error ?? "Connect API returned failure";
          setError(String(serverMsg));
          return;
        }

        const data = (resp as any).data ?? {};
        const primary = data?.domains?.primary ?? null;
        if (!primary) {
          setError(
            "Connect API did not return a primary domain to connect to."
          );
          return;
        }

        // optional: server may return playerId / playerName
        if (data.playerId) setPlayerId(String(data.playerId));
        if (data.playerName) setPlayerName(String(data.playerName));

        setDomainPrimary(String(primary));
      } catch (err: any) {
        // network / unexpected error
        console.error("prepareConnect error", err);
        if (!cancelled) {
          // prefer ApiError-like message if present
          const msg =
            err?.message ?? String(err) ?? "Failed to prepare connection";
          setError(msg);
        }
      } finally {
        // only update loading if this run wasn't cancelled
        if (!cancelled) setLoading(false);
      }
    })();
  });

  onCleanup(() => {
    // RoomWithSync 自己负责断开/清理 websocket 等
  });

  return (
    <main class="container mx-auto p-6">
      <h2 class="text-2xl font-semibold mb-4">Game Room</h2>

      <Show when={error()} fallback={null}>
        <div class="alert alert-error mb-4">
          <div>
            <span>{error()}</span>
            <div class="mt-2">
              <button
                class="btn btn-sm btn-ghost"
                onClick={() => {
                  // 回到房间列表
                  navigate("/", { replace: true });
                }}
              >
                返回房间列表
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="card p-4 mb-4">
          <div>
            Preparing connection... <span class="opacity-70">Please wait</span>
          </div>
        </div>
      </Show>

      <Show when={domainPrimary()}>
        {/* RoomWithSync 仍接收 playerId if backend returned it; if not returned, pass null/guest name */}
        <RoomWithSync
          domain={domainPrimary()!}
          playerId={playerId() ?? ""}
          gameId={params.id!}
          playerName={playerName() ?? "Guest"}
          autoOpen={true}
        />
      </Show>

      <Show when={!loading() && !domainPrimary() && !error()}>
        <div class="card p-4">
          <div>Waiting for server response...</div>
        </div>
      </Show>
    </main>
  );
};

export default RoomRoute;
