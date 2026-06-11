import { type Component, For, createMemo } from "solid-js";
import { A } from "@solidjs/router";
import { type SyncedGameState, type PlayerId, PlayerColor } from "@generale/types";
import Avatar from "~/components/Avatar";

// 兼容历史 bug 落库的字符串 enum 名（如 "DarkSlateGray"）
const colorHex = (c: number | string | undefined): string => {
  if (c == null) return "#cccccc";
  if (typeof c === "number") return `#${c.toString(16).padStart(6, "0")}`;
  const num = (PlayerColor as any)[c];
  if (typeof num === "number") return `#${num.toString(16).padStart(6, "0")}`;
  return "#cccccc";
};

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
  const summaries = createMemo(() => {
    const s = props.state?.();
    if (!s) return [];

    const players = s.players ?? {};
    const playerDisplay = s.playerDisplay ?? {};
    const tiles = (s.map && Array.isArray(s.map.tiles)) ? s.map.tiles : [];

    // 1. 统计地块（只遍历一次）
    const landCounts: Record<string, number> = {};
    for (let y = 0; y < tiles.length; y++) {
      const row = tiles[y] ?? [];
      for (let x = 0; x < row.length; x++) {
        const t = row[x];
        if (!t) continue;
        const owner = t.ownerId;
        if (owner) landCounts[owner] = (landCounts[owner] ?? 0) + 1;
      }
    }

    // 2. 构造 summary 数组
    const arr = Object.values(players).map((p) => {
      const id = p.id;
      const display = playerDisplay[id];
      const name = display?.name;

      const colorNum = display?.tileColor;
      const colorCss = colorHex(colorNum);

      return {
        id,
        name,
        displayName: display?.displayName,
        avatarThumbUrl: display?.avatarThumbUrl,
        army: p.army ?? 0,
        land: landCounts[id] ?? 0,
        status: p.status,
        colorCss,
      };
    });

    // 3. 可选排序 & limit
    if (props.sortByArmy ?? true) {
      arr.sort((a, b) => b.army - a.army);
    }
    if (typeof props.limit === "number" && props.limit != null) {
      return arr.slice(0, props.limit);
    }
    return arr;
  });

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
