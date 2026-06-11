import {
  type SyncedGameState,
  type PlayerId,
  type PreGamePlayerInfo,
  PlayerStatus,
  PreGamePlayerStatus,
} from "@generale/types";
import { playerColorCss } from "~/utils/playerColor";

/**
 * 从对局 state 推导的纯函数选择器。无 UI / 连接依赖，便于单测与复用。
 */

export interface PlayerSummary {
  id: PlayerId;
  name: string | undefined;
  displayName: string | undefined;
  avatarThumbUrl: string | undefined;
  army: number;
  land: number;
  status: PlayerStatus | undefined;
  colorCss: string;
}

export interface PlayerSummaryOptions {
  /** 是否按兵力排序（默认 true） */
  sortByArmy?: boolean;
  /** 限制显示条数（默认全部） */
  limit?: number | null;
}

/**
 * 把对局 state 汇总成玩家信息列表（含地块统计、颜色、排序、limit）。
 * 原先内联在 game/PlayerList.tsx。
 */
export function playerSummaries(
  s: SyncedGameState | undefined,
  opts: PlayerSummaryOptions = {},
): PlayerSummary[] {
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
  const arr: PlayerSummary[] = Object.values(players).map((p) => {
    const id = p.id;
    const display = playerDisplay[id];
    return {
      id,
      name: display?.name,
      displayName: display?.displayName,
      avatarThumbUrl: display?.avatarThumbUrl,
      army: p.army ?? 0,
      land: landCounts[id] ?? 0,
      status: p.status,
      colorCss: playerColorCss(display?.tileColor),
    };
  });

  // 3. 可选排序 & limit
  if (opts.sortByArmy ?? true) {
    arr.sort((a, b) => b.army - a.army);
  }
  if (typeof opts.limit === "number" && opts.limit != null) {
    return arr.slice(0, opts.limit);
  }
  return arr;
}

export interface EndgameResult {
  selfOutcome: "won" | "lost" | null;
  winnerLabel: string | null;
  loserLabels: string[];
}

/**
 * 从最终（未 mask）的对局 state 计算结算信息：
 *  - 自己赢/输（spectator 没有自己，返回 null）
 *  - 获胜队伍名 + 队员名字
 *  - 失败队伍列表（队员名字，按队伍分组）
 * 原先内联在 game/Game.tsx 的 endgameResult memo。
 */
export function computeEndgameResult(
  s: SyncedGameState | undefined,
  selfPlayerId: PlayerId,
): EndgameResult {
  const players = s?.players ?? {};
  const teams = s?.teams ?? {};
  const display = s?.playerDisplay ?? {};

  const selfPlayer = players[selfPlayerId];
  const selfOutcome: "won" | "lost" | null = !selfPlayer
    ? null
    : selfPlayer.status === PlayerStatus.Won
      ? "won"
      : selfPlayer.status === PlayerStatus.Defeated
        ? "lost"
        : null;

  const teamLabel = (memberIds: PlayerId[]) =>
    memberIds
      .map(id => display[id]?.name ?? id)
      .filter(Boolean)
      .join("、");

  const winnerTeam = Object.values(teams).find(
    t => (t as any).status === PlayerStatus.Won
  ) as { id: string; memberIds: PlayerId[] } | undefined;
  const loserTeams = Object.values(teams).filter(
    t => (t as any).status === PlayerStatus.Defeated
  ) as Array<{ id: string; memberIds: PlayerId[] }>;

  return {
    selfOutcome,
    winnerLabel: winnerTeam ? teamLabel(winnerTeam.memberIds) : null,
    loserLabels: loserTeams.map(t => teamLabel(t.memberIds)).filter(s => s.length > 0),
  };
}

/**
 * 房间里是否有人正在游戏中（用于决定房间页是否显示"游戏进行中"横幅 + 观战入口）。
 * 原先内联在 room/Room.tsx 的 gameInProgress。
 */
export function isGameInProgress(players: PreGamePlayerInfo[] | undefined): boolean {
  return (players ?? []).some(p => p.status === PreGamePlayerStatus.Playing);
}
