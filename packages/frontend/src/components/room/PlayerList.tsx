import { type PreGamePlayerInfo } from "@generale/types";
import { type Component, For, Show, createMemo } from "solid-js";

/**
 * PlayerListProps
 * - players: 玩家数组（来自 room().players）
 * - selfId: 当前客户端玩家 id
 * - hostId: 房主 id
 * - teamCount: 房间当前队伍数量（RoomWithSync 传入）
 * - onToggleReady: 切换准备
 * - onKick: 踢出（房主可见）
 * - onTransferHost: 转让房主（房主可见）
 * - onChangeTeam: 切换队伍（玩家自己 或 房主可以为别人切换）
 */
export interface PlayerListProps {
  players: PreGamePlayerInfo[];
  selfId: string;
  hostId: string;
  teamCount: number;

  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
  onChangeTeam?: (playerId: string, teamId: string) => void;
}

/* ---------------------- 小工具 ---------------------- */
const colorHex = (c: number | undefined) =>
  c == null ? "#cccccc" : `#${c.toString(16).padStart(6, "0")}`;

/* ---------------------- PlayerCard 子组件 ---------------------- */
const PlayerCard: Component<{
  player: PreGamePlayerInfo;
  selfId: string;
  hostId: string;
  teamCount: number;

  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
  onChangeTeam?: (playerId: string, teamId: string) => void;
}> = (props) => {
  const p = () => props.player;

  const isSelf = createMemo(() => p().id === props.selfId);
  const isRoomHost = createMemo(() => props.selfId === props.hostId);

  const canChangeTeam = createMemo(() =>
    !!props.onChangeTeam && (isSelf() || isRoomHost())
  );

  const handleTeamChange = (teamId: string) => {
    // 选中了空字符串 "" 则表示未分组
    props.onChangeTeam?.(p().id, teamId);
  };

  return (
    <div class="flex items-center justify-between p-3 bg-base-200 rounded shadow-sm w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
      {/* Left: avatar + info */}
      <div class="flex items-center gap-3 overflow-hidden">
        <div class="w-10 h-10 rounded-full bg-primary text-base-100 flex items-center justify-center shrink-0">
          {p().name?.slice(0, 1).toUpperCase() ?? "?"}
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2">
            <div class="truncate font-medium">{p().name}</div>
            <Show when={p().isHost}>
              <span class="badge text-xs ml-1">Host</span>
            </Show>
          </div>

          <div class="text-xs opacity-60 truncate">
            id: {p().id}
          </div>
        </div>

        <div
          class="w-5 h-5 rounded ml-2 border shrink-0"
          style={{ "background-color": colorHex(p().tileColor as any) }}
        />
      </div>

      {/* Right: controls */}
      <div class="flex items-center gap-2 ml-2">
        <div class="flex flex-col items-end">
          <div
            class={`text-sm font-medium ${p().ready === 1 ? "text-success" : "text-error"}`}
          >
            {p().ready === 1 ? "Ready" : "Not Ready"}
          </div>

          <Show when={isSelf()}>
            <button
              class={`btn btn-xs mt-1 ${p().ready === 1 ? "btn-success" : "btn-outline"}`}
              onClick={() => props.onToggleReady(p().id, p().ready !== 1)}
            >
              {p().ready === 1 ? "取消准备" : "准备"}
            </button>
          </Show>
        </div>

        {/* 切换队伍（动态生成 team1..teamN） */}
        <Show when={canChangeTeam()}>
          <select
            class="select select-xs select-bordered mt-1"
            value={p().teamId ?? ""}
            onChange={(e) => handleTeamChange(e.currentTarget.value)}
            aria-label="切换队伍"
            title="切换队伍"
          >
            <option value="">未分组</option>
            <For each={Array.from({ length: props.teamCount }).map((_, i) => `team${i + 1}`)}>
              {(tid) => <option value={tid}>{`队伍 ${tid}`}</option>}
            </For>
          </select>
        </Show>

        {/* 房主对其他玩家的操作按钮（转让/踢出） */}
        <Show when={isRoomHost() && !isSelf()}>
          <div class="flex flex-col gap-1 ml-2">
            <Show when={props.onTransferHost}>
              <button
                class="btn btn-xs btn-warning"
                onClick={() => props.onTransferHost?.(p().id)}
              >
                设为房主
              </button>
            </Show>

            <Show when={props.onKick}>
              <button
                class="btn btn-xs btn-error"
                onClick={() => props.onKick?.(p().id)}
              >
                踢出
              </button>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

/* ---------------------- TeamGroup（按队列分组渲染） ---------------------- */
const TeamGroup: Component<{
  teamId: string;
  members: PreGamePlayerInfo[];
  props: PlayerListProps;
}> = (gp) => {
  const teamTitle = () => (gp.teamId === "no team" ? "未分组玩家" : `队伍 ${gp.teamId}`);
  return (
    <div>
      <h3 class="font-bold mb-2 text-base">{teamTitle()}</h3>
      <div class="flex flex-wrap gap-3">
        <For each={gp.members}>
          {(player) => (
            <PlayerCard
              player={player}
              selfId={gp.props.selfId}
              hostId={gp.props.hostId}
              teamCount={gp.props.teamCount}
              onToggleReady={gp.props.onToggleReady}
              onKick={gp.props.onKick}
              onTransferHost={gp.props.onTransferHost}
              onChangeTeam={gp.props.onChangeTeam}
            />
          )}
        </For>
      </div>
    </div>
  );
};

/* ---------------------- Main PlayerList ---------------------- */
export const PlayerList: Component<PlayerListProps> = (props) => {
  /**
   * 按 teamId 分组：key = teamId | "未分组"
   */
  const grouped = createMemo(() => {
    const map = new Map<string, PreGamePlayerInfo[]>();
    for (const p of props.players) {
      const key = p.teamId ?? "no team";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  return (
    <div class="space-y-5">
      <For each={grouped()}>
        {([teamId, members]) => (
          <TeamGroup teamId={teamId} members={members} props={props} />
        )}
      </For>
    </div>
  );
};

export default PlayerList;