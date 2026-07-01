import type { ListGamesQuery } from "@generale/types/dist/api";
import { useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { getGameInfoApi } from "~/routes/games/generale/api/gameApi";
import { useGameListQuery } from "~/hooks/useGameListQuery";
import { useLobbyRealtime } from "~/hooks/useLobbyRealtime";
import { useT } from "~/i18n/useT";
import { Alert, Badge, Button, Card, Modal, Spinner } from "~/ui";
import CreateRoomModal from "./CreateRoomModal";
import RoomFilter from "./RoomFilter";

export function RoomList() {
  const { t } = useT();
  const navigate = useNavigate();

  const [filters, setFilters] = createSignal<Partial<ListGamesQuery>>({});

  const limit = 50;
  const offset = 0;

  const gamesQuery = useGameListQuery(() => filters(), { offset, limit });

  useLobbyRealtime(() => filters(), { offset, limit });

  const [createOpen, setCreateOpen] = createSignal(false);

  const [openId, setOpenId] = createSignal<string | null>(null);
  const detailQuery = useQuery(() => ({
    queryKey: ["game", openId()],
    enabled: () => !!openId(),
    queryFn: async () => {
      const id = openId();
      if (!id) throw new Error("no id");
      const res = await getGameInfoApi(id);
      return res.data;
    },
    retry: false,
  }));

  const [connecting, setConnecting] = createSignal(false);
  const [connectResult, setConnectResult] = createSignal<unknown>(null);
  const [connectError, setConnectError] = createSignal<string | null>(null);

  function openDetails(id: string) {
    setOpenId(id);
  }

  function closeDetails() {
    setOpenId(null);
    setConnectResult(null);
    setConnectError(null);
  }

  function handlePrepareConnect(gameId: string) {
    setConnecting(true);
    setConnectResult(null);
    setConnectError(null);
    try {
      navigate(`/game/${gameId}`);
    } catch (err: unknown) {
      console.error("prepareConnect failed", err);
      setConnectError((err as Error)?.message ?? t("Failed to prepare connection"));
    } finally {
      setConnecting(false);
    }
  }

  const gamesForRender = createMemo(() => gamesQuery.data ?? []);

  return (
    <div class="container mx-auto p-4">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-2xl font-semibold">{t("Active Rooms")}</h2>
        <div class="flex items-center gap-2">
          <Button data-testid="create-room" size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            {t("New Room")}
          </Button>
          <Button size="sm" variant="primary" onClick={() => (gamesQuery.refetch ? gamesQuery.refetch() : null)}>
            {t("Refresh")}
          </Button>
        </div>
      </div>

      <RoomFilter
        value={filters()}
        onChange={(next) => {
          setFilters(next);
        }}
      />

      <Switch>
        <Match when={gamesQuery.isLoading}>
          <div class="flex justify-center">
            <Spinner size="md" class="inline-block" />
          </div>
        </Match>

        <Match when={gamesQuery.isError}>
          <Alert variant="error" class="shadow-lg">
            <div>
              <span>
                {t("Failed to load room list")}: {gamesQuery.error?.message ?? t("Unknown")}
              </span>
            </div>
          </Alert>
        </Match>

        <Match when={gamesQuery.isSuccess}>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={gamesForRender()}>
              {(g) => {
                const isFull =
                  typeof g.playerCount === "number" &&
                  typeof g.maxPlayers === "number" &&
                  g.playerCount >= g.maxPlayers;
                const status = g.status ?? "lobby";
                return (
                  <Card class="bg-base-100 shadow-md">
                    <div class="card-body">
                      <div class="flex items-start justify-between">
                        <div>
                          <h3 class="card-title">
                            {g.roomName ?? g.id}
                            <span class="text-sm ml-2 text-muted">({g.id})</span>
                          </h3>

                          <p class="text-sm text-muted">
                            <span class="mr-3">
                              <strong>{t("Host:")}</strong> {g.hostName ?? g.hostId ?? t("Unknown")}
                            </span>
                            <span class="mr-3">
                              <strong>{t("Mode:")}</strong> {g.type ?? "standard"}
                            </span>
                            <span>
                              <strong>{t("Map:")}</strong>{" "}
                              {g.customMapName
                                ? g.customMapName
                                : typeof g.map === "string"
                                  ? g.map
                                  : g.map?.width
                                    ? `${g.map.width}×${g.map.height}`
                                    : t("\u2014")}
                            </span>
                          </p>
                        </div>

                        <div class="text-right">
                          <Badge>{status}</Badge>
                          <div class="mt-2">
                            <span class="inline-flex items-center gap-1">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <title>{t("players")}</title>
                                <path d="M10 2a6 6 0 100 12 6 6 0 000-12z" />
                                <path d="M2 18a8 8 0 0116 0H2z" />
                              </svg>
                              <span>
                                {g.playerCount ?? 0}/{g.maxPlayers ?? "?"}
                              </span>
                            </span>
                          </div>
                          <div class="mt-2">
                            <Show when={g.hasPassword}>
                              <Badge variant="outline">{t("Locked")}</Badge>
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="card-actions justify-end mt-3">
                        <Button variant="ghost" size="sm" onClick={() => openDetails(g.id)}>
                          {t("Details")}
                        </Button>
                        <Button
                          data-testid="join-room"
                          size="sm"
                          variant={isFull ? "neutral" : "primary"}
                          class={isFull ? "btn-disabled" : ""}
                          onClick={() => handlePrepareConnect(g.id)}
                        >
                          {t("Join")}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              }}
            </For>
          </div>
        </Match>
      </Switch>

      <Show when={!!openId()}>
        <Modal boxClass="max-w-3xl">
          <div class="flex justify-between items-start">
            <h3 class="font-bold text-lg">{t("Room Details")}</h3>
            <Button size="sm" variant="ghost" onClick={closeDetails}>
              {t("Close")}
            </Button>
          </div>

          <div class="mt-4">
            <Show when={detailQuery.isLoading}>
              <div class="flex items-center gap-2">
                <Spinner /> {t("Loading...")}
              </div>
            </Show>

            <Show when={detailQuery.isError}>
              <Alert variant="error">{detailQuery.error?.message ?? t("Failed to load details")}</Alert>
            </Show>

            <Show when={detailQuery.data}>
              {(detail) => (
                <>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <p>
                        <strong>{t("ID:")}</strong> <span class="text-xs">{detail().id}</span>
                      </p>
                      <p>
                        <strong>{t("Host:")}</strong> {detail().hostName || detail().hostId || t("\u2014")}
                      </p>
                      <p>
                        <strong>{t("Players:")}</strong> {detail().playerCount} / {detail().maxPlayers}
                      </p>
                      <p>
                        <strong>{t("Status:")}</strong>
                        <span
                          classList={{
                            "text-success": detail().status === "lobby",
                            "text-warning": detail().status === "in-progress",
                          }}
                        >
                          {detail().status === "lobby"
                            ? t("Waiting")
                            : detail().status === "in-progress"
                              ? t("In Progress")
                              : detail().status}
                        </span>
                      </p>
                      <p>
                        <strong>{t("Password:")}</strong> {detail().hasPassword ? t("Yes") : t("Public")}
                      </p>
                    </div>

                    <div>
                      <p class="font-semibold mb-1">{t("Player List")}</p>
                      <ul class="space-y-1">
                        <For each={detail().players ?? []}>
                          {(p) => (
                            <li class="text-sm flex items-center gap-2">
                              <span class="font-medium">{p.name}</span>
                              <Show when={p.isHost}>
                                <Badge variant="neutral" class="badge-xs">
                                  {t("Host")}
                                </Badge>
                              </Show>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </div>

                  <div class="mt-4 flex items-center gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handlePrepareConnect(detail().id)}
                      disabled={connecting()}
                    >
                      {connecting() ? t("Preparing...") : t("Prepare Connect")}
                    </Button>

                    <Show when={connectResult()}>
                      <Badge variant="success">
                        {t("Ready")} &mdash; domains:{" "}
                        {(connectResult() as { domains?: { primary?: string } })?.domains?.primary ?? "n/a"}
                      </Badge>
                    </Show>

                    <Show when={connectError()}>
                      <div class="text-error">{connectError()}</div>
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
        </Modal>
      </Show>

      <Show when={createOpen()}>
        <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => setOpenId(id)} />
      </Show>
    </div>
  );
}

export default RoomList;
