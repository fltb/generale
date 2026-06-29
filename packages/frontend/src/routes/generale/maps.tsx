import type { MapSumaryRespBody } from "@generale/types";
import { Title, Meta } from "@solidjs/meta";
import { A, useSearchParams } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { useT } from "~/i18n/useT";
import { deleteMapApi, forkMapApi, listMapsApi, mapThumbnailUrl, myMapsApi } from "~/api/mapApi";
import CreateRoomModal from "~/components/roomlist/CreateRoomModal";
import GeneraleLayout from "~/components/game/GeneraleLayout";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { Badge, Button, Card, Input, Select, Spinner, Tabs } from "~/ui";

const SORT_OPTIONS = [
  { value: "updated", label: "Newest" },
  { value: "usage", label: "Most popular" },
  { value: "largest", label: "Largest" },
  { value: "smallest", label: "Smallest" },
];

export default function MapsPage() {
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams<{ tab?: string; search?: string; sort?: string }>();
  const [openRoomMapId, setOpenRoomMapId] = createSignal<string | undefined>();
  const [createOpen, setCreateOpen] = createSignal(false);
  const tab = () => (searchParams.tab === "my" ? "my" : "public");
  const searchText = () => searchParams.search || "";
  const sortBy = () => searchParams.sort || "updated";

  const [searchInput, setSearchInput] = createSignal(searchText());

  const query = () => {
    const q: Record<string, string> = {};
    if (searchText()) q.search = searchText();
    if (sortBy() !== "updated") q.sortBy = sortBy();
    return q;
  };

  const [maps, { refetch }] = createResource(
    () => ({ tab: tab(), query: query() }),
    async (src) => {
      if (src.tab === "my") {
        const res = await myMapsApi(src.query);
        return res.data;
      }
      const res = await listMapsApi(src.query);
      return res.data;
    },
  );

  function doSearch() {
    setSearchParams({ search: searchInput().trim() || undefined, sort: sortBy() !== "updated" ? sortBy() : undefined });
  }

  async function handleDelete(id: string) {
    if (!confirm(t("Delete this map?"))) return;
    await deleteMapApi(id);
    refetch();
  }

  async function handleFork(id: string) {
    try {
      await forkMapApi(id);
      refetch();
    } catch (e: unknown) {
      alert(`${t("Fork failed")}: ${(e as { message?: string })?.message ?? String(e)}`);
    }
  }

  return (
    <ProtectedRoute>
      <GeneraleLayout>
        <Title>
          {t("Map Workshop")} — {t("General E")}
        </Title>
        <Meta name="description" content={t("Browse, create, and share custom maps for General E.")} />
        <Meta property="og:title" content={`${t("Map Workshop")} — ${t("General E")}`} />
        <Meta property="og:description" content={t("Browse, create, and share custom maps for General E.")} />
        <Meta property="og:image" content="/og-image.svg" />
        <Meta property="og:type" content="website" />
        <main class="container mx-auto p-6 max-w-6xl">
          <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl font-bold">{t("Map Workshop")}</h1>
            <A href="/maps/editor">
              <Button variant="primary" size="sm">
                {t("Create map")}
              </Button>
            </A>
          </div>

          <Tabs bordered class="mb-4">
            <A href="/maps" class={`tab ${tab() === "public" ? "tab-active" : ""}`}>
              {t("Public maps")}
            </A>
            <A
              href={`/maps?tab=my${searchText() ? `&search=${encodeURIComponent(searchText())}` : ""}${sortBy() !== "updated" ? `&sort=${sortBy()}` : ""}`}
              class={`tab ${tab() === "my" ? "tab-active" : ""}`}
            >
              {t("My maps")}
            </A>
          </Tabs>

          <div class="flex gap-2 mb-4">
            <Input
              value={searchInput()}
              onInput={(e) => setSearchInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch();
              }}
              placeholder={t("Search by name or tag...")}
              size="sm"
              class="flex-1 max-w-xs"
            />
            <Button variant="ghost" size="sm" onClick={doSearch}>
              {t("Search")}
            </Button>
            <Show when={searchText()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setSearchParams({ search: undefined, sort: sortBy() !== "updated" ? sortBy() : undefined });
                }}
              >
                {t("Clear")}
              </Button>
            </Show>
            <Select
              bordered
              size="sm"
              value={sortBy()}
              onChange={(e) =>
                setSearchParams({
                  sort: e.currentTarget.value !== "updated" ? e.currentTarget.value : undefined,
                  search: searchText() || undefined,
                })
              }
            >
              {SORT_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>

          <Show
            when={!maps.loading}
            fallback={
              <div class="flex justify-center py-12">
                <Spinner />
              </div>
            }
          >
            <Show
              when={maps() != null && maps()!.length > 0}
              fallback={
                <div class="text-center py-12 text-base-content/50">
                  {searchText() ? t("No matching maps found.") : t("No maps yet.")}
                  <br />
                  <A href="/maps/editor" class="link link-primary">
                    {t("Create the first map")}
                  </A>
                </div>
              }
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <For each={maps()}>
                  {(m) => (
                    <MapCard
                      map={m}
                      onDelete={handleDelete}
                      onFork={handleFork}
                      isOwner={tab() === "my"}
                      onOpenRoom={() => {
                        setOpenRoomMapId(m.id);
                        setCreateOpen(true);
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </main>
        <CreateRoomModal
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            setOpenRoomMapId(undefined);
          }}
          initialMapId={openRoomMapId()}
        />
      </GeneraleLayout>
    </ProtectedRoute>
  );
}

function MapCard(props: {
  map: MapSumaryRespBody;
  onDelete: (id: string) => void;
  onFork: (id: string) => void;
  isOwner: boolean;
  onOpenRoom: () => void;
}) {
  const { t } = useT();
  const m = props.map;

  const editorLink = () => (props.isOwner ? `/maps/editor/${m.id}` : `/maps/preview/${m.id}`);

  return (
    <Card class="overflow-hidden">
      <A href={editorLink()} class="block">
        <div class="h-32 bg-base-300 flex items-center justify-center overflow-hidden">
          <img
            src={mapThumbnailUrl(m.id)}
            alt={m.name}
            class="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      </A>
      <div class="p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <A href={editorLink()} class="font-semibold text-sm hover:link truncate block">
              {m.name}
            </A>
            <div class="text-xs text-base-content/60 mt-0.5">
              {m.authorName} · {m.width}×{m.height}
            </div>
          </div>
          <div class="flex gap-1 shrink-0">
            <Show when={m.isDraft}>
              <Badge variant="warning" class="badge-xs">
                {t("Draft")}
              </Badge>
            </Show>
            <Show when={m.isPublic && !m.isDraft}>
              <Badge variant="success" class="badge-xs">
                {t("Public")}
              </Badge>
            </Show>
          </div>
        </div>
        <Show when={m.description}>
          <p class="text-xs text-base-content/50 mt-1 line-clamp-2">{m.description}</p>
        </Show>
        <div class="flex gap-1 mt-2">
          <A href={editorLink()}>
            <Button size="xs" variant="ghost">
              {props.isOwner ? t("Edit") : t("Preview")}
            </Button>
          </A>
          <Show when={!m.isDraft}>
            <Button size="xs" variant="primary" onClick={() => props.onOpenRoom()}>
              {t("Create room with this map")}
            </Button>
          </Show>
          <Show when={!props.isOwner}>
            <Button size="xs" variant="ghost" onClick={() => props.onFork(m.id)}>
              {t("Fork")}
            </Button>
          </Show>
          <Show when={props.isOwner}>
            <Button size="xs" variant="ghost" onClick={() => props.onDelete(m.id)}>
              {t("Delete")}
            </Button>
          </Show>
        </div>
      </div>
    </Card>
  );
}
