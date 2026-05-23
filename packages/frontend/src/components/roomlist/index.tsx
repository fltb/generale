
import { For, Match, Show, Switch, createSignal, createMemo } from "solid-js";
import { useNavigate } from "@solidjs/router";
import RoomFilter from "./RoomFilter";
import { listGamesApi, getGameInfoApi } from "~/api/gameApi";
import { useQuery } from "@tanstack/solid-query";
import CreateRoomModal from "./CreateRoomModal";
import { A } from "@solidjs/router";
import { useGameListQuery } from "~/hooks/useGameListQuery";
import { useLobbyRealtime } from "~/hooks/useLobbyRealtime";

export function RoomList() {
  const navigate = useNavigate();

  // filter state (partial ListGamesQuery shape)
  const [filters, setFilters] = createSignal<Record<string, any>>({});

  // default pagination / sorting (可扩展为分页控件)
  const limit = 50;
  const offset = 0;

  // useGameListQuery expects an accessor
  const gamesQuery = useGameListQuery(() => filters(), { offset, limit });

  // 订阅 lobby-games websocket 事件，按需把后端推送的 created/updated/deleted 事件
  // 直接 patch 进 useGameListQuery 的缓存里，避免轮询刷新。
  useLobbyRealtime(() => filters(), { offset, limit });

  // --- Create room modal state & mutation ---
  const [createOpen, setCreateOpen] = createSignal(false);

  // detail modal state & query
  const [openId, setOpenId] = createSignal<string | null>(null);
  const detailQuery = useQuery(() => ({
    queryKey: ["game", openId()],
    enabled: () => !!openId(),
    queryFn: async () => {
      if (!openId()) throw new Error("no id");
      const res = await getGameInfoApi(openId()!);
      return res.data;
    },
    retry: false,
  }));

  // connect demo state
  const [connecting, setConnecting] = createSignal(false);
  const [connectResult, setConnectResult] = createSignal<any>(null);
  const [connectError, setConnectError] = createSignal<string | null>(null);

  async function openDetails(id: string) {
    setOpenId(id);
  }

  function closeDetails() {
    setOpenId(null);
    setConnectResult(null);
    setConnectError(null);
  }

  async function handlePrepareConnect(gameId: string) {
    setConnecting(true);
    setConnectResult(null);
    setConnectError(null);
    try {
      navigate(`/game/${gameId}`);
    } catch (err: any) {
      console.error("prepareConnect failed", err);
      setConnectError(err?.message ?? "连接准备失败");
    } finally {
      setConnecting(false);
    }
  }

  // derived list for rendering (gamesQuery.data is array from server)
  const gamesForRender = createMemo(() => gamesQuery.data ?? []);

  return (
    <div class="container mx-auto p-4">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-2xl font-semibold">Active Rooms</h2>
        <div class="flex items-center gap-2">
          <button class="btn btn-sm btn-secondary" onClick={() => setCreateOpen(true)}>新建房间</button>
          <button class="btn btn-sm btn-primary" onClick={() => (gamesQuery.refetch ? gamesQuery.refetch() : null)}>Refresh</button>
        </div>
      </div>

      {/* Filter area */}
      <RoomFilter
        value={filters()}
        onChange={(next) => {
          // next is Partial<ListGamesQuery> where values are strings
          // we directly set filters; useGameListQuery will pick up via queryKey
          setFilters(next);
        }}
      />

      <Switch>
        <Match when={gamesQuery.isLoading}>
          <div class="flex justify-center">
            <div class="inline-block loading loading-spinner loading-md"></div>
          </div>
        </Match>

        <Match when={gamesQuery.isError}>
          <div class="alert alert-error shadow-lg">
            <div>
              <span>载入房间列表失败: {gamesQuery.error?.message ?? "Unknown"}</span>
            </div>
          </div>
        </Match>

        <Match when={gamesQuery.isSuccess}>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={gamesForRender()}>
              {(g: any) => {
                const isFull =
                  typeof g.playerCount === "number" &&
                  typeof g.maxPlayers === "number" &&
                  g.playerCount >= g.maxPlayers;
                const status = g.status ?? "lobby";
                return (
                  <div class="card bg-base-100 shadow-md">
                    <div class="card-body">
                      <div class="flex items-start justify-between">
                        <div>
                          <h3 class="card-title">
                            {g.roomName ?? g.id}
                            <span class="text-sm ml-2 text-muted">({g.id})</span>
                          </h3>

                          <p class="text-sm text-muted">
                            <span class="mr-3"><strong>Host:</strong> {g.hostName ?? g.hostId ?? "未知"}</span>
                            <span class="mr-3"><strong>Mode:</strong> {g.mode ?? "standard"}</span>
                            <span><strong>Map:</strong> {typeof g.map === "string" ? g.map : g.map?.width ? `${g.map.width}×${g.map.height}` : "—"}</span>
                          </p>
                        </div>

                        <div class="text-right">
                          <div class="badge">{status}</div>
                          <div class="mt-2">
                            <span class="inline-flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a6 6 0 100 12 6 6 0 000-12z" />
                                <path d="M2 18a8 8 0 0116 0H2z" />
                              </svg>
                              <span>{g.playerCount ?? 0}/{g.maxPlayers ?? "?"}</span>
                            </span>
                          </div>
                          <div class="mt-2">
                            <Show when={g.hasPassword}>
                              <span class="badge badge-outline">Locked</span>
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="card-actions justify-end mt-3">
                        <button class="btn btn-ghost btn-sm" onClick={() => openDetails(g.id)}>Details</button>
                        <button class={`btn btn-sm ${isFull ? "btn-disabled" : "btn-primary"}`} onClick={() => handlePrepareConnect(g.id)}>Join</button>
                        <A href={`/game/${g.id}`} class="btn btn-sm">Open</A>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Match>
      </Switch>

      {/* details modal */}
      <Show when={!!openId()}>
        <div class="modal modal-open">
          <div class="modal-box max-w-3xl">
            <div class="flex justify-between items-start">
              <h3 class="font-bold text-lg">Room Details</h3>
              <button class="btn btn-sm btn-ghost" onClick={closeDetails}>Close</button>
            </div>

            <div class="mt-4">
              <Show when={detailQuery.isLoading}>
                <div class="flex items-center gap-2"><div class="loading loading-spinner" /> Loading...</div>
              </Show>

              <Show when={detailQuery.isError}>
                <div class="alert alert-error">{detailQuery.error?.message ?? "Failed to load details"}</div>
              </Show>

              <Show when={detailQuery.data}>
                {(detail) => (
                  <>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p><strong>ID:</strong> <span class="font-mono">{detail().id}</span></p>
                        <p><strong>Host:</strong> {detail().hostId}</p>
                        <p><strong>Players:</strong> {detail().playerCount} / {detail().maxPlayers}</p>
                        <p><strong>Status:</strong> {detail().status}</p>
                        <p><strong>Has password:</strong> {detail().hasPassword ? "Yes" : "No"}</p>
                      </div>

                      <div>
                        <p class="font-semibold">Players list</p>
                        <ul class="menu rounded-box p-2 bg-base-200">
                          <For each={detail().players ?? []}>
                            {(p) => (
                              <li>
                                <div class="flex items-center justify-between">
                                  <div>
                                    <span class="font-medium">{p.name}</span>
                                    <span class="text-xs text-muted ml-2">{p.isHost ? "(host)" : ""}</span>
                                  </div>
                                  <div class="text-sm font-mono">{p.id}</div>
                                </div>
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </div>

                    <div class="mt-4 flex items-center gap-3">
                      <button class="btn btn-primary btn-sm" onClick={() => handlePrepareConnect(detail().id)} disabled={connecting()}>
                        {connecting() ? "Preparing..." : "Prepare Connect"}
                      </button>

                      <Show when={connectResult()}>
                        <div class="badge badge-success">Ready — domains: {connectResult().domains?.primary ?? "n/a"}</div>
                      </Show>

                      <Show when={connectError()}>
                        <div class="text-error">{connectError()}</div>
                      </Show>
                    </div>
                  </>
                )}
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Create Room Modal */}
      <Show when={createOpen()}>
        <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => setOpenId(id)} />
      </Show>
    </div>
  );
}

export default RoomList;