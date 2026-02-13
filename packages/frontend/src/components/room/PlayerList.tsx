import { type PreGamePlayerInfo, type TeamInfo } from "@generale/types";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";

/**
 * PlayerListProps
 * - players: 玩家数组（来自 room().players）
 * - teams: 队伍数组（room().teams）
 * - selfId: 当前客户端玩家 id
 * - hostId: 房主 id
 * - teamCount: 房间当前队伍数量（RoomWithSync 传入）
 * - onToggleReady: 切换准备
 * - onKick: 踢出（房主可见）
 * - onTransferHost: 转让房主（房主可见）
 * - onChangeTeam: 切换队伍（玩家自己 或 房主可以为别人切换）
 * - onCreateTeam / onRenameTeam / onDeleteTeam: 房主管理队伍
 */
export interface PlayerListProps {
  players: PreGamePlayerInfo[];
  teams: TeamInfo[];
  selfId: string;
  hostId: string;
  teamCount: number;

  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
  onChangeTeam?: (playerId: string | undefined, teamId: string) => void;

  onCreateTeam?: (name?: string) => void;
  onRenameTeam?: (teamId: string, name: string) => void;
  onDeleteTeam?: (teamId: string) => void;
}

/* ---------------------- 小工具 ---------------------- */
const colorHex = (c: number | undefined) =>
  c == null ? "#cccccc" : `#${c.toString(16).padStart(6, "0")}`;

/* ---------------------- PlayerCard 子组件 ---------------------- */
const PlayerCard: Component<{
  player: PreGamePlayerInfo;
  selfId: string;
  hostId: string;
  teams: TeamInfo[];

  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
  onChangeTeam?: (playerId: string | undefined, teamId: string) => void;
}> = (props) => {
  const p = () => props.player;

  const isSelf = () => p().id === props.selfId;
  const isRoomHost = () => props.selfId === props.hostId;

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

        {/* 房主对其他玩家的操作按钮（转让/踢出 + 快速移队） */}
        <Show when={isRoomHost() && !isSelf()}>
          <div class="flex flex-col gap-1 ml-2 items-end">
            <div class="flex gap-1">
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

            {/* host 快速移队：下拉列出所有队伍 */}
            <Show when={props.onChangeTeam}>
              <select
                class="select select-xs select-bordered mt-1"
                value={p().teamId ?? ""}
                onChange={(e) => props.onChangeTeam?.(p().id, e.currentTarget.value)}
                aria-label="快速移队"
                title="将玩家移入指定队伍"
              >
                <option value="">未分组</option>
                <For each={props.teams ?? []}>
                  {(t) => <option value={t.id}>{t.name ?? t.id}</option>}
                </For>
              </select>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

/* ---------------------- TeamGroup（按队列分组渲染） ---------------------- */
const TeamGroup: Component<{
  team: TeamInfo | { id: string; name?: string } | null;
  members: PreGamePlayerInfo[];
  props: PlayerListProps;
}> = (gp) => {
  const [editing, setEditing] = createSignal(false);
  const [editName, setEditName] = createSignal(gp.team?.name ?? "");
  const isNoTeam = () => gp.team === null || gp.team.id === "no team";

  const clickHeader = () => {
    // 逻辑调整：
    // - 普通玩家点击 header -> 加入该队（onChangeTeam(undefined, id)）
    // - 房主点击 header -> 也把自己加入该队（快速切换）。房主管理（重命名/删除）请使用右侧按钮。
    const isHost = gp.props.selfId === gp.props.hostId;

    if (gp.team) {
      if (gp.props.onChangeTeam) {
        // 将自己加入该队（如果 host 也会用同一行为）
        gp.props.onChangeTeam(undefined, gp.team.id);
      }
      // 不自动进入编辑模式（编辑通过右侧按钮）
      return;
    } else {
      // 点击 "未分组玩家" -> 将自己设为未分组（teamId = ""）
      if (gp.props.onChangeTeam) {
        gp.props.onChangeTeam(undefined, "");
      }
      return;
    }
  };

  const submitRename = () => {
    const name = (editName() ?? "").trim();
    if (!gp.team || !gp.props.onRenameTeam) return;
    if (!name) return;
    gp.props.onRenameTeam(gp.team.id, name);
    setEditing(false);
  };

  const tryDelete = () => {
    if (!gp.team || !gp.props.onDeleteTeam) return;
    // local safety: only allow delete if no members (client-side)
    if ((gp.members?.length ?? 0) > 0) {
      // UI-level guard; server is authoritative.
      alert("队伍非空，无法删除（请先移除队员或将其分配到其他队）");
      return;
    }
    if (confirm(`确定删除队伍 "${gp.team.name ?? gp.team.id}" 吗？`)) {
      gp.props.onDeleteTeam(gp.team.id);
    }
  };

  const headerText = () => {
    if (isNoTeam()) return "未分组玩家";
    return gp.team?.name ? `${gp.team.name}` : `队伍 ${gp.team?.id}`;
  };

  return (
    <div class="border p-3 rounded">
      <div class="flex items-center justify-between mb-2">
        <h3
          class="font-bold text-base cursor-pointer select-none"
          onClick={clickHeader}
          title={gp.team ? "点击加入该队（房主/玩家均可）。房主管理请使用右侧按钮进行重命名/删除。" : "点击将自己设为未分组玩家"}
        >
          {headerText()}
        </h3>

        <div class="flex items-center gap-2">
          <Show when={editing()}>
            <input
              class="input input-sm input-bordered"
              value={editName()}
              onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
            />
            <button class="btn btn-xs" onClick={submitRename}>保存</button>
            <button class="btn btn-xs btn-ghost" onClick={() => setEditing(false)}>取消</button>
          </Show>

          <Show when={!editing() && (gp.props.selfId === gp.props.hostId)}>
            <button class="btn btn-xs" onClick={() => setEditing(true)}>重命名</button>
            <button class="btn btn-xs btn-error" onClick={tryDelete}>删除</button>
          </Show>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        <For each={gp.members}>
          {(player) => (
            <PlayerCard
              player={player}
              selfId={gp.props.selfId}
              hostId={gp.props.hostId}
              teams={gp.props.teams}
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
   * 按 teamId 分组：key = teamId | "no team"
   * 使用 props.teams 保持 server 顺序和名字
   */
  const grouped = createMemo(() => {
    const map = new Map<string, PreGamePlayerInfo[]>();
    for (const p of props.players) {
      const key = p.teamId ?? "no team";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    // Build groups following props.teams order, plus no-team at end if present
    const groups: Array<[string, PreGamePlayerInfo[]]> = [];
    const known = new Set<string>();
    for (const t of (props.teams ?? [])) {
      groups.push([t.id, map.get(t.id) ?? []]);
      known.add(t.id);
    }
    // any teamIds in players but not in props.teams -> append
    for (const [k, members] of map.entries()) {
      if (k === "no team") continue;
      if (!known.has(k)) {
        groups.push([k, members]);
        known.add(k);
      }
    }
    // finally add no-team group
    if (map.has("no team")) {
      groups.push(["no team", map.get("no team") ?? []]);
    }
    return groups;
  });

  // create team UI (only for host)
  const [newTeamName, setNewTeamName] = createSignal("");
  const createTeam = () => {
    const name = (newTeamName() ?? "").trim();
    if (!name) {
      alert("请输入队伍名");
      return;
    }
    props.onCreateTeam?.(name);
    setNewTeamName("");
  };

  return (
    <div class="space-y-5">
      <Show when={props.selfId === props.hostId}>
        <div class="flex gap-2 items-center mb-2">
          <input
            class="input input-sm input-bordered"
            placeholder="新队伍名称（仅房主）"
            value={newTeamName()}
            onInput={(e) => setNewTeamName((e.target as HTMLInputElement).value)}
          />
          <button class="btn btn-sm" onClick={createTeam}>新建队伍并加入</button>
        </div>
      </Show>

      <For each={grouped()}>
        {([teamId, members]) => {
          const team = props.teams?.find(t => t.id === teamId) ?? (teamId === "no team" ? null : { id: teamId, name: teamId });
          return <TeamGroup team={team} members={members} props={props} />;
        }}
      </For>
    </div>
  );
};

export default PlayerList;
