import { type PreGamePlayerInfo, type TeamInfo, type PreGameTeamMode, PreGamePlayerStatus, PlayerColor } from "@generale/types";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import Avatar from "~/components/Avatar";
import { playerColorCss } from "~/utils/playerColor";
import { resolveDisplayNames } from "~/utils/playerDisplay";
import { Button, Badge, confirmDialog, alertDialog } from "~/ui";

/**
 * PlayerListProps
 * - players: 玩家数组（来自 room().players）
 * - teams: 队伍数组（room().teams）
 * - selfId: 当前客户端玩家 id
 * - hostId: 房主 id
 * - teamCount: 房间当前队伍数量（RoomWithSync 传入）
 * - teamMode: 队伍模式；ffa 时前端只渲染扁平玩家列表，不暴露队伍管理 UI
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
  teamMode?: PreGameTeamMode;

  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
  onChangeTeam?: (playerId: string | undefined, teamId: string) => void;

  onCreateTeam?: (name?: string) => void;
  onRenameTeam?: (teamId: string, name: string) => void;
  onDeleteTeam?: (teamId: string) => void;
  onChangeColor?: (tileColor: PlayerColor) => void;
}

/* ---------------------- PlayerCard 子组件 ---------------------- */
const PlayerCard: Component<{
  player: PreGamePlayerInfo;
  selfId: string;
  hostId: string;
  teams: TeamInfo[];
  hideTeamPicker?: boolean;
  /** 去重后的展示名（由外部 PlayList 传入，避免同名 displayName 混淆） */
  resolvedDisplayName?: string;
  /** 已被其他玩家占用的颜色（本组件只负责自己，不查其他玩家） */
  usedColors?: PlayerColor[];

  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
  onChangeTeam?: (playerId: string | undefined, teamId: string) => void;
  onChangeColor?: (tileColor: PlayerColor) => void;
}> = (props) => {
  const p = () => props.player;
  const display = () => props.resolvedDisplayName ?? p().displayName ?? p().name;

  const isSelf = () => p().id === props.selfId;
  const isRoomHost = () => props.selfId === props.hostId;
  const [colorPickerOpen, setColorPickerOpen] = createSignal(false);

  const allColors = () =>
    Object.values(PlayerColor).filter((v) => typeof v === "number") as PlayerColor[];

  return (
    <div class="flex items-center justify-between p-3 bg-base-200 rounded shadow-sm w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
      {/* Left: avatar + info */}
      <div class="flex items-center gap-3 overflow-hidden">
        <A
          href={`/profile/${p().id}`}
          title={`查看 ${display()} 的资料`}
          target="_blank" rel="noopener"
          class="shrink-0"
        >
          <Avatar
            src={p().avatarThumbUrl ?? "/api/avatars/default/thumb.webp"}
            size={40}
            alt={display()}
          />
        </A>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <A href={`/profile/${p().id}`} class="truncate font-medium hover:underline" target="_blank" rel="noopener">
              {display()}
            </A>
            <Show when={p().isHost}>
              <Badge class="text-xs ml-1">Host</Badge>
            </Show>
            <Show when={p().status === PreGamePlayerStatus.Playing}>
              <Badge variant="info" class="text-xs">游戏中</Badge>
            </Show>
            <Show when={p().status === PreGamePlayerStatus.Disconnected}>
              <Badge variant="warning" class="text-xs">离线</Badge>
            </Show>
          </div>

          <div class="text-xs opacity-60 truncate">
            <Show when={p().displayName} fallback={<>id: {p().id}</>}>
              @{p().name}
            </Show>
          </div>
        </div>
      </div>

      {/* Middle: color swatch + picker（放在 overflow-hidden 之外防止弹出框被裁） */}
      <div class="relative shrink-0">
        <div
          class={`w-5 h-5 rounded border shrink-0 ${isSelf() && props.onChangeColor ? "cursor-pointer hover:ring-1 hover:ring-primary" : ""}`}
          style={{ "background-color": playerColorCss(p().tileColor as any), "border-color": "rgba(0,0,0,0.2)" }}
          title={isSelf() ? "点击选择颜色" : undefined}
          onClick={() => {
            if (isSelf() && props.onChangeColor) {
              setColorPickerOpen((v) => !v);
            }
          }}
        />
        <Show when={colorPickerOpen()}>
          <div
            class="absolute right-0 top-6 z-50 p-1.5 bg-base-200 pixel-border rounded shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="text-xs font-medium mb-1 opacity-70">选择颜色</div>
            <div
              class="grid gap-1"
              style={{ "grid-template-columns": "repeat(4, 1.25rem)" }}
            >
              <For each={allColors()}>
                {(c) => {
                  const isUsed = (props.usedColors ?? []).includes(c);
                  const isCurrent = c === p().tileColor;
                  return (
                    <div
                      class="w-5 h-5 rounded border transition-all"
                      classList={{
                        "cursor-pointer hover:ring-1 hover:ring-primary": !isUsed || isCurrent,
                        "cursor-not-allowed opacity-20": isUsed && !isCurrent,
                        "ring-1 ring-white": isCurrent,
                      }}
                      style={{
                        "background-color": playerColorCss(c as any),
                        "border-color": isCurrent ? "white" : "rgba(0,0,0,0.2)",
                      }}
                      title={isCurrent ? "当前颜色" : isUsed ? "已被占用" : "选择此颜色"}
                      onClick={() => {
                        if (isUsed && !isCurrent) return;
                        props.onChangeColor?.(c);
                        setColorPickerOpen(false);
                      }}
                    />
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>

      {/* Right: controls */}
      <div class="flex items-center gap-2 ml-2">
        <div class="flex flex-col items-end">
          <Show when={!p().isHost}>
            <div
              class={`text-sm font-medium ${p().ready === 1 ? "text-success" : "text-error"}`}
            >
              {p().ready === 1 ? "Ready" : "Not Ready"}
            </div>
          </Show>

          <Show when={isSelf() && !p().isHost}>
            <Button
              size="xs"
              class="mt-1"
              variant={p().ready === 1 ? "success" : "neutral"}
              outline={p().ready !== 1}
              onClick={() => props.onToggleReady(p().id, p().ready !== 1)}
            >
              {p().ready === 1 ? "取消准备" : "准备"}
            </Button>
          </Show>
        </div>

        {/* 房主对其他玩家的操作按钮（转让/踢出 + 快速移队） */}
        <Show when={isRoomHost() && !isSelf()}>
          <div class="flex flex-col gap-1 ml-2 items-end">
            <div class="flex gap-1">
              <Show when={props.onTransferHost}>
                <Button
                  size="xs"
                  variant="warning"
                  onClick={() => props.onTransferHost?.(p().id)}
                >
                  设为房主
                </Button>
              </Show>

              <Show when={props.onKick}>
                <Button
                  size="xs"
                  variant="error"
                  disabled={p().status !== PreGamePlayerStatus.Lobby}
                  title={p().status !== PreGamePlayerStatus.Lobby ? "游戏中无法踢出该玩家" : "踢出该玩家"}
                  onClick={() => props.onKick?.(p().id)}
                >
                  踢出
                </Button>
              </Show>
            </div>

            {/* host 快速移队：下拉列出所有队伍。ffa 时不渲染 */}
            <Show when={props.onChangeTeam && !props.hideTeamPicker}>
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
  resolvedNames: Map<string, string>;
  usedColors: PlayerColor[];
}> = (gp) => {
  const [editing, setEditing] = createSignal(false);
  const [editName, setEditName] = createSignal(gp.team?.name ?? "");
  const isNoTeam = () => gp.team === null || gp.team.id === "no team";

  const clickHeader = () => {
    // 逻辑调整：
    // - 普通玩家点击 header -> 加入该队（onChangeTeam(undefined, id)）
    // - 房主点击 header -> 也把自己加入该队（快速切换）。房主管理（重命名/删除）请使用右侧按钮。
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
      alertDialog("队伍非空，无法删除（请先移除队员或将其分配到其他队）");
      return;
    }
    if (confirmDialog(`确定删除队伍 "${gp.team.name ?? gp.team.id}" 吗？`)) {
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
            <Button size="xs" onClick={submitRename}>保存</Button>
            <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
          </Show>

          <Show when={!editing() && (gp.props.selfId === gp.props.hostId)}>
            <Button size="xs" onClick={() => setEditing(true)}>重命名</Button>
            <Button size="xs" variant="error" onClick={tryDelete}>删除</Button>
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
              resolvedDisplayName={gp.resolvedNames.get(player.id)}
              usedColors={gp.usedColors}
              onChangeColor={gp.props.onChangeColor}
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
  const resolvedNames = createMemo(() =>
    resolveDisplayNames(
      props.players.map((p) => ({ id: p.id, name: p.name, displayName: p.displayName })),
    ),
  );

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
      alertDialog("请输入队伍名");
      return;
    }
    props.onCreateTeam?.(name);
    setNewTeamName("");
  };

  const isFfa = () => (props.teamMode ?? "ffa") === "ffa";

  const usedColors = createMemo(() =>
    props.players.map((x) => x.tileColor),
  );

  return (
    <div class="space-y-5">
      <Show when={!isFfa() && props.selfId === props.hostId}>
        <div class="flex gap-2 items-center mb-2">
          <input
            class="input input-sm input-bordered"
            placeholder="新队伍名称（仅房主）"
            value={newTeamName()}
            onInput={(e) => setNewTeamName((e.target as HTMLInputElement).value)}
          />
          <Button size="sm" onClick={createTeam}>新建队伍并加入</Button>
        </div>
      </Show>

      {/* ffa：扁平列表，不渲染 TeamGroup / 队伍管理；组队模式：按 team 分组 */}
      <Show
        when={!isFfa()}
        fallback={
          <div class="flex flex-wrap gap-3">
            <For each={props.players}>
              {(player) => (
                <PlayerCard
                  player={player}
                  selfId={props.selfId}
                  hostId={props.hostId}
                  teams={props.teams}
                  hideTeamPicker
                  resolvedDisplayName={resolvedNames().get(player.id)}
                  usedColors={usedColors()}
                  onChangeColor={props.onChangeColor}
                  onToggleReady={props.onToggleReady}
                  onKick={props.onKick}
                  onTransferHost={props.onTransferHost}
                  onChangeTeam={undefined}
                />
              )}
            </For>
          </div>
        }
      >
        <For each={grouped()}>
          {([teamId, members]) => {
            const team = props.teams?.find(t => t.id === teamId) ?? (teamId === "no team" ? null : { id: teamId, name: teamId });
            return <TeamGroup team={team} members={members} props={props} resolvedNames={resolvedNames()} usedColors={usedColors()} />;
          }}
        </For>
      </Show>
    </div>
  );
};

export default PlayerList;
