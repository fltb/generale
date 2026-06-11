import { type Component, For, createMemo } from "solid-js";
import { A } from "@solidjs/router";
import { type SyncedGameState, type PlayerId } from "@generale/types";
import Avatar from "~/components/Avatar";
import { playerSummaries } from "~/game/selectors";

type Props = {
  state: () => SyncedGameState;
  /** 可选：如果外面有 pregame 的 name map，可以传进来（id -> name） */
  nameMap?: Record<PlayerId, string> | null;
  /** 是否按兵力排序（默认 true） */
  sortByArmy?: boolean;
  /** 限制显示条数（默认全部） */
  limit?: number | null;
};

/** 主组件 */
export const PlayerList: Component<Props> = (props) => {
  const summaries = createMemo(() =>
    playerSummaries(props.state?.(), {
      sortByArmy: props.sortByArmy,
      limit: props.limit,
    })
  );

  return (
    <div class="p-2 w-full max-w-sm">
      <div class="font-semibold mb-2">玩家信息</div>
      <div class="flex flex-col gap-2">
        <For each={summaries()}>
          {(p) => (
            <div class="flex items-center justify-between gap-3 p-2 rounded border border-base-300 bg-base-100">
              <div class="flex items-center gap-3">
                {/* 颜色色块（地图上的玩家颜色） */}
                <div
                  title={p.id}
                  class="shrink-0"
                  style={{
                    width: "14px",
                    height: "14px",
                    "background-color": p.colorCss,
                    "border-radius": "3px",
                    "box-shadow": "inset 0 0 0 1px rgba(0,0,0,0.2)",
                  }}
                />
                {/* 头像，点击查看 profile */}
                <A
                  href={`/profile/${p.id}`}
                  class="shrink-0"
                  title={p.displayName ?? p.name}
                >
                  <Avatar
                    src={p.avatarThumbUrl ?? "/api/avatars/default/thumb.webp"}
                    size={28}
                    alt={p.displayName ?? p.name}
                  />
                </A>
                <div>
                  <div class="text-sm font-medium">{p.displayName ?? p.name}</div>
                  <div class="text-xs opacity-60">
                    land: {p.land} · army: {p.army}
                  </div>
                </div>
              </div>
              <div class="text-xs opacity-60">{String(p.status ?? "")}</div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default PlayerList;
