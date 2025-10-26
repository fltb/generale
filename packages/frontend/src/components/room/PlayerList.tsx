import { type PreGamePlayerInfo } from "@generale/types";
import { type Component, For, Show, createMemo } from "solid-js";

export interface PlayerListProps {
  players: PreGamePlayerInfo[];
  selfId: string;
  hostId: string;
  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
}

export const PlayerList: Component<PlayerListProps> = (props) => {
  const colorHex = (c: number | undefined) =>
    c == null ? "#cccccc" : `#${c.toString(16).padStart(6, "0")}`;

  // 🧠 分组
  const grouped = createMemo(() => {
    const map = new Map<string, PreGamePlayerInfo[]>();
    for (const p of props.players) {
      const key = p.teamId || "未分组";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  return (
    <div class="space-y-5">
      <For each={grouped()}>
        {([teamId, members]) => (
          <div>
            <h3 class="font-bold mb-2 text-base">
              {teamId === "未分组" ? "未分组玩家" : `队伍 ${teamId}`}
            </h3>
            <div class="flex flex-wrap gap-3">
              <For each={members}>
                {(p) => {
                  const isSelf = () => p.id === props.selfId;
                  return (
                    <div class="flex items-center justify-between p-3 bg-base-200 rounded shadow-sm w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
                      <div class="flex items-center gap-3 overflow-hidden">
                        <div class="w-10 h-10 rounded-full bg-primary text-base-100 flex items-center justify-center flex-shrink-0">
                          {p.name.slice(0, 1).toUpperCase()}
                        </div>

                        <div class="flex flex-col min-w-0">
                          <div class="flex items-center gap-2">
                            <div class="truncate font-medium min-w-0">{p.name}</div>
                            <Show when={p.isHost}>
                              <span class="badge text-xs ml-1">Host</span>
                            </Show>
                          </div>
                          <div class="text-xs opacity-60 truncate">
                            <span>id: {p.id}</span>
                          </div>
                        </div>

                        <div
                          class="w-5 h-5 rounded ml-2 border flex-shrink-0"
                          style={{ "background-color": colorHex(p.tileColor as any) }}
                        />
                      </div>

                      <div class="flex items-center gap-2 ml-2">
                        <div class="flex flex-col items-end">
                          <div
                            class={`text-sm font-medium ${
                              p.ready === 1 ? "text-success" : "text-error"
                            }`}
                          >
                            {p.ready === 1 ? "Ready" : "Not Ready"}
                          </div>
                          <Show when={isSelf()}>
                            <button
                              class={`btn btn-xs mt-1 ${
                                p.ready === 1 ? "btn-success" : "btn-outline"
                              }`}
                              onClick={() =>
                                props.onToggleReady(p.id, p.ready !== 1)
                              }
                            >
                              {p.ready === 1 ? "取消准备" : "准备"}
                            </button>
                          </Show>
                        </div>

                        <Show when={props.onKick && props.hostId === props.selfId && props.selfId !== p.id}>
                          <button
                            class="btn btn-xs btn-error"
                            onClick={() => props.onKick!(p.id)}
                          >
                            踢出
                          </button>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};
  