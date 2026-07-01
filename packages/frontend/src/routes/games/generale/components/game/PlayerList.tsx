import type { PlayerId, SyncedGameState } from "@generale/types";
import { A } from "@solidjs/router";
import { type Component, createMemo, For, Show } from "solid-js";
import Avatar from "~/components/Avatar";
import { playerSummaries } from "~/routes/games/generale/hooks/selectors";
import { useT } from "~/i18n/useT";
import { resolveDisplayNames } from "~/utils/playerDisplay";

type Props = {
  state: () => SyncedGameState;
  nameMap?: Record<PlayerId, string> | null;
  sortByArmy?: boolean;
  limit?: number | null;
  compact?: boolean;
};

export const PlayerList: Component<Props> = (props) => {
  const { t } = useT();
  const summaries = createMemo(() =>
    playerSummaries(props.state?.(), {
      sortByArmy: props.sortByArmy,
      limit: props.limit,
    }),
  );

  const names = createMemo(() => {
    const s = summaries();
    return resolveDisplayNames(s.map((p) => ({ id: p.id, name: p.name ?? p.id, displayName: p.displayName })));
  });

  return (
    <div class={props.compact ? "p-1.5" : "p-2 w-full max-w-sm"}>
      <Show when={!props.compact}>
        <div class="font-semibold mb-2">{t("Players")}</div>
      </Show>
      <div class="flex flex-col gap-1.5">
        <For each={summaries()}>
          {(p) => (
            <div
              class={`flex items-center justify-between gap-2 rounded border border-base-300/50 bg-base-100/50 ${props.compact ? "p-1" : "p-2"}`}
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <div
                  title={p.id}
                  class="shrink-0"
                  style={{
                    width: props.compact ? "10px" : "14px",
                    height: props.compact ? "10px" : "14px",
                    "background-color": p.colorCss,
                    "border-radius": "2px",
                    "box-shadow": "inset 0 0 0 1px rgba(0,0,0,0.2)",
                  }}
                />
                <Show when={!props.compact}>
                  <A
                    href={`/profile/${p.id}`}
                    target="_blank"
                    rel="noopener"
                    class="shrink-0"
                    title={p.displayName ?? p.name}
                  >
                    <Avatar
                      src={p.avatarThumbUrl ?? "/api/avatars/default/thumb.webp"}
                      size={28}
                      alt={p.displayName ?? p.name}
                    />
                  </A>
                </Show>
                <div class="min-w-0">
                  <div class={`${props.compact ? "text-xs" : "text-sm"} font-medium truncate`}>
                    {names().get(p.id) ?? p.displayName ?? p.name}
                  </div>
                  <div class={`${props.compact ? "text-[10px]" : "text-xs"} opacity-60`}>
                    {props.compact ? `${p.land}L·${p.army}A` : `land: ${p.land} · army: ${p.army}`}
                  </div>
                </div>
              </div>
              <Show when={!props.compact}>
                <div class="text-xs opacity-60">{String(p.status ?? "")}</div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default PlayerList;
