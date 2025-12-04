import { For, Match, Show, Switch, createSignal } from "solid-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
import { listGamesApi, getGameInfoApi, prepareConnectApi, createGameApi } from "~/api/gameApi";
import type { CreateGameReqBody, CreateGameSuccessResp, ErrorResp, GameInfoRoute } from "@generale/types/dist/api";
import { A } from "@solidjs/router";
import type { ApiError } from "~/api/base";

/**
 * RoomList - show active games using daisyui cards
 * + 新增：Create Room 模态框，调用 createGameApi
 */
export function RoomList() {
  const qc = useQueryClient();

  // Query to fetch rooms
  const gamesQuery = useQuery(() => ({
    queryKey: ["games"],
    queryFn: async () => {
      const res = await listGamesApi();
      return res.data ?? [];
    },
    retry: false,
    refetchOnWindowFocus: true,
  }));

  // --- Create room modal state & mutation ---
  const [createOpen, setCreateOpen] = createSignal(false);
  const [roomName, setRoomName] = createSignal("");
  const [maxPlayers, setMaxPlayers] = createSignal<number | "">("");
  const [mapSize, setMapSize] = createSignal<"small" | "medium" | "large" | "">("");
  const [gameMode, setGameMode] = createSignal<"classic" | "blitz" | "custom" | "">("");

  const createMutation = useMutation<
    CreateGameSuccessResp,
    ApiError<ErrorResp>,
    CreateGameReqBody
  >(() => ({
    mutationFn: async (payload: CreateGameReqBody) => {
      return createGameApi(payload);
    },
    onSuccess: (resp) => {
      // resp.data: { gameId, playerId, message }
      // 1) 刷新房间列表
      qc.invalidateQueries({ queryKey: ["games"] as const });
      // 2) 关闭 modal 并打开新房间详情
      setCreateOpen(false);
      setRoomName("");
      setMaxPlayers("");
      setMapSize("");
      setGameMode("");
      // 打开详情（使用 detail modal flow）
      setOpenId(resp.data.gameId);
    },
    onError: (err: any) => {
      console.error("create game failed", err);
      // 这里可以用 toast 或 alert，简单用 alert
      alert(err?.message ?? "创建房间失败");
    }
  }));

  // Modal state + detail query (fetch when opening)
  const [openId, setOpenId] = createSignal<string | null>(null);
  const detailQuery = useQuery<GameInfoRoute>(
    () => ({
      queryKey: ["game", openId()],
      enabled: () => !!openId(),
      queryFn: async () => {
        if (!openId()) throw new Error("no id");
        const res = await getGameInfoApi(openId()!);
        return res.data;
      },
      retry: false,
    })
  );

  // connect demo state
  const [connecting, setConnecting] = createSignal(false);
  const [connectResult, setConnectResult] = createSignal<any>(null);
  const [connectError, setConnectError] = createSignal<string | null>(null);

  async function openDetails(id: string) {
    setOpenId(id);
    // detailQuery will run automatically because enabled depends on openId()
  }

  function closeDetails() {
    setOpenId(null);
    setConnectResult(null);
    setConnectError(null);
  }

  async function handlePrepareConnect(gameId: string) {
    const playerId = prompt("请输入你的 playerId（示例用，生产应由 join/create 返回）") ?? "";
    if (!playerId) return;

    setConnecting(true);
    setConnectResult(null);
    setConnectError(null);
    try {
      const resp = await prepareConnectApi(gameId, playerId);
      setConnectResult(resp.data);
    } catch (err: any) {
      console.error("prepareConnect failed", err);
      setConnectError(err?.message ?? "连接准备失败");
    } finally {
      setConnecting(false);
    }
  }

  /** 提交创建房间 */
  async function submitCreateRoom() {
    const name = roomName().trim();
    if (!name) {
      alert("请输入房间名字（roomName）");
      return;
    }

    const settings: any = {};
    if (maxPlayers() !== "") settings.maxPlayers = Number(maxPlayers());
    if (mapSize()) settings.mapSize = mapSize();
    if (gameMode()) settings.gameMode = gameMode();

    createMutation.mutate({
      roomName: name,
      gameSettings: Object.keys(settings).length ? settings : undefined
    });
  }

  return (
    <div class="container mx-auto p-4">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-2xl font-semibold">Active Rooms</h2>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-sm btn-secondary"
            onClick={() => setCreateOpen(true)}
          >
            新建房间
          </button>
          <button
            class="btn btn-sm btn-primary"
            onClick={() => (gamesQuery.refetch ? gamesQuery.refetch() : null)}
          >
            Refresh
          </button>
        </div>
      </div>
      <Switch>
        <Match
          when={gamesQuery.isLoading}
        >
          <div class="flex justify-center">
            <div class="inline-block loading loading-spinner loading-md"></div>
          </div>

        </Match>
        <Match
          when={gamesQuery.isError}
        >
          <div class="flex justify-center">
            <div class="inline-block loading loading-spinner loading-md"></div>
          </div>
          <div class="alert alert-error shadow-lg">
            <div>
              <span>载入房间列表失败: {gamesQuery.error?.message ?? "Unknown"}</span>
            </div>
          </div>

        </Match>
        <Match when={gamesQuery.isSuccess}>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={gamesQuery.data}>
              {(g) => {
                const isFull = typeof g.playerCount === "number" && typeof g.maxPlayers === "number" && g.playerCount >= g.maxPlayers;
                const status = g.status ?? "lobby";
                return (
                  <div class="card bg-base-100 shadow-md">
                    <div class="card-body">
                      <div class="flex items-start justify-between">
                        <div>
                          <h3 class="card-title">
                            {g.id}
                          </h3>
                          <p class="text-sm text-muted">ID: <span class="font-mono">{g.id}</span></p>
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
                        <button
                          class={`btn btn-sm ${isFull ? "btn-disabled" : "btn-primary"}`}
                          onClick={() => handlePrepareConnect(g.id)}
                        >
                          Join
                        </button>
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
                        <div class="badge badge-success">Ready — domains: {(connectResult().domains?.primary ?? "n/a")}</div>
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
        <div class="modal modal-open">
          <div class="modal-box">
            <div class="flex justify-between items-start">
              <h3 class="font-bold text-lg">新建房间</h3>
              <button class="btn btn-sm btn-ghost" onClick={() => setCreateOpen(false)}>Close</button>
            </div>

            <div class="mt-4 space-y-3">
              <label class="block">
                <span class="label-text">你的名字（房主 / playerName）</span>
                <input
                  class="input input-bordered w-full"
                  value={roomName()}
                  onInput={(e: any) => setRoomName(e.target.value)}
                  placeholder="例如：alice"
                />
              </label>

              <label class="block">
                <span class="label-text">最大玩家数（可选）</span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  class="input input-bordered w-full"
                  value={maxPlayers()}
                  onInput={(e: any) => {
                    const v = e.target.value;
                    setMaxPlayers(v === "" ? "" : Number(v));
                  }}
                  placeholder="2 - 8"
                />
              </label>

              <div class="grid grid-cols-3 gap-2">
                <label>
                  <span class="label-text">地图（可选）</span>
                  <select class="select select-bordered w-full" value={mapSize()} onInput={(e: any) => setMapSize(e.target.value)}>
                    <option value="">默认</option>
                    <option value="small">small</option>
                    <option value="medium">medium</option>
                    <option value="large">large</option>
                  </select>
                </label>

                <label>
                  <span class="label-text">模式（可选）</span>
                  <select class="select select-bordered w-full" value={gameMode()} onInput={(e: any) => setGameMode(e.target.value)}>
                    <option value="">默认</option>
                    <option value="classic">classic</option>
                    <option value="blitz">blitz</option>
                    <option value="custom">custom</option>
                  </select>
                </label>

                <div class="flex items-end">
                  <button
                    class="btn btn-primary w-full"
                    onClick={submitCreateRoom}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "创建中..." : "创建房间"}
                  </button>
                </div>
              </div>

              <Show when={createMutation.isError}>
                <div class="alert alert-error">
                  <div>{(createMutation.error)?.message ?? "创建失败"}</div>
                </div>
              </Show>

            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default RoomList;
