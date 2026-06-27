import type { Component } from "solid-js";
import { createResource, createSignal, For, Show } from "solid-js";
import { listMapsApi, mapThumbnailUrl } from "~/api/mapApi";
import { Button, Checkbox, Collapse, CollapseContent, CollapseTitle, Input, Spinner } from "~/ui";

interface MapSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const MapSelector: Component<MapSelectorProps> = (props) => {
  const [search, setSearch] = createSignal("");

  const [maps] = createResource(
    () => search(),
    async (s) => {
      const q: Record<string, string> = {};
      if (s.trim()) q.search = s.trim();
      const res = await listMapsApi(q);
      return res.data;
    },
  );

  const selectedMap = () => (props.value ? maps()?.find((m) => m.id === props.value) : undefined);

  function select(id: string) {
    props.onChange(id);
  }

  return (
    <Collapse arrow class="border border-base-300 bg-base-100">
      <Checkbox />
      <CollapseTitle class="text-sm font-medium">
        <Show when={selectedMap()} fallback={<span class="opacity-50 ml-6">{props.placeholder || "选择地图..."}</span>}>
          <span class="text ml-5">{selectedMap()?.name}</span>
          <span class="text-xs opacity-50 ml-2">
            {selectedMap()?.width}×{selectedMap()?.height}
          </span>
        </Show>
      </CollapseTitle>
      <CollapseContent>
        <div class="flex gap-2 mb-2">
          <Input
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="搜索..."
            size="sm"
            class="flex-1"
          />
          <Button size="xs" variant="ghost" onClick={() => props.onChange("")}>
            清除
          </Button>
        </div>

        <Show
          when={!maps.loading}
          fallback={
            <div class="flex justify-center py-4">
              <Spinner />
            </div>
          }
        >
          <Show
            when={maps() && maps()?.length > 0}
            fallback={<div class="text-center py-4 opacity-50 text-sm">暂无已发布的地图</div>}
          >
            <div class="space-y-1 max-h-[180px] overflow-y-auto">
              <For each={maps()}>
                {(m) => (
                  <button
                    type="button"
                    class={`w-full flex items-center gap-2 p-1.5 rounded text-left hover:bg-base-200 ${
                      m.id === props.value ? "bg-base-200 ring-1 ring-primary" : ""
                    }`}
                    onClick={() => select(m.id)}
                  >
                    <div class="w-8 h-8 bg-base-300 rounded shrink-0 overflow-hidden">
                      <img
                        src={mapThumbnailUrl(m.id)}
                        alt=""
                        class="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-medium truncate">{m.name}</div>
                      <div class="text-[10px] opacity-50">
                        {m.authorName} · {m.width}×{m.height} · {m.minPlayers}-{m.maxPlayers}人
                      </div>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </CollapseContent>
    </Collapse>
  );
};
