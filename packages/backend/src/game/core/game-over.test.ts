import { describe, it, expect } from 'bun:test';
import { tick } from './game';
import { TileType, GameState, PlayerStatus, TeamId, TeamCore, PlayerId, PlayerActionQueues } from '@generale/types';

// Helper: 创建指定队伍和玩家的 GameState，tiles[y][x] 格式
function createBasicState({
    width = 3,
    height = 3,
    players,
    teams,
    tiles,
}: {
    width?: number;
    height?: number;
    players: Record<PlayerId, { teamId: TeamId; status?: PlayerStatus; }>
    teams: Record<TeamId, { memberIds: PlayerId[]; }>
    tiles: { y: number; x: number; type?: TileType; ownerId?: PlayerId | null; army?: number }[]
}): GameState {
    // 初始化全地图
    const mapTiles = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => ({ type: TileType.Plain, ownerId: null, army: 0 }))
    );
    for (const t of tiles) {
        mapTiles[t.y][t.x] = {
            type: t.type ?? TileType.Plain,
            ownerId: t.ownerId ?? null,
            army: t.army ?? 0,
        };
    }
    // 统计每个玩家的地块和兵力
    const playerLand: Record<PlayerId, number> = {};
    const playerArmy: Record<PlayerId, number> = {};
    for (const [pid] of Object.entries(players)) {
        playerLand[pid] = 0;
        playerArmy[pid] = 0;
    }
    for (const row of mapTiles) {
        for (const tile of row) {
            if (tile.ownerId && playerLand.hasOwnProperty(tile.ownerId)) {
                playerLand[tile.ownerId] += 1;
                playerArmy[tile.ownerId] += tile.army;
            }
        }
    }
    const playerObjs: Record<PlayerId, any> = {};
    for (const [pid, info] of Object.entries(players)) {
        playerObjs[pid] = {
            id: pid,
            status: info.status ?? PlayerStatus.Playing,
            teamId: info.teamId,
            army: playerArmy[pid],
            land: playerLand[pid],
            lastActiveTick: 0,
        };
    }
    const teamObjs: Record<TeamId, TeamCore> = {};
    for (const [tid, info] of Object.entries(teams)) {
        teamObjs[tid] = { id: tid, memberIds: info.memberIds, status: PlayerStatus.Playing };
    }
    return {
        tick: 0,
        status: 'PLAYING',
        settings: {
            tileGrow: {
                [TileType.Plain]: { duration: 40, growth: 1 },
                [TileType.Throne]: { duration: 1, growth: 1 },
                [TileType.Barracks]: { duration: 1, growth: 1 },
                [TileType.Mountain]: { duration: Infinity, growth: 0 },
                [TileType.Swamp]: { duration: 1, growth: -1 },
                [TileType.Fog]: { duration: Infinity, growth: 0 },
            },
            afkThreshold: 200,
        },
        players: playerObjs,
        teams: teamObjs,
        map: { width, height, tiles: mapTiles },
    };
}

describe('game-over by tick', () => {
    it('单队伍全灭，行为触发 gameover', () => {
        const state = createBasicState({
            players: { p1: { teamId: 't1' }, p2: { teamId: 't1' } },
            teams: { t1: { memberIds: ['p1', 'p2'] } },
            tiles: [
                { y: 0, x: 0, type: TileType.Throne, ownerId: 'p1', army: 1 },
                { y: 0, x: 1, type: TileType.Throne, ownerId: 'p2', army: 1 },
            ],
        });
        // p1 被消灭
        state.players['p1'].status = PlayerStatus.Defeated;
        state.map.tiles[0][0].ownerId = null;
        // p2 也被消灭
        state.players['p2'].status = PlayerStatus.Defeated;
        state.map.tiles[0][1].ownerId = null;
        // tick 行为触发
        const { state: newState } = tick(state, {});
        expect(newState.status).toBe('ENDED');
        expect(newState.teams['t1'].status).toBe(PlayerStatus.Defeated);
    });

    it('多队伍仅剩一队，行为触发 gameover', () => {
        const state = createBasicState({
            players: {
                p1: { teamId: 't1', status: PlayerStatus.Defeated },
                p2: { teamId: 't2', status: PlayerStatus.Playing },
                p3: { teamId: 't1', status: PlayerStatus.Defeated },
            },
            teams: {
                t1: { memberIds: ['p1', 'p3'] },
                t2: { memberIds: ['p2'] },
            },
            tiles: [
                { y: 0, x: 0, type: TileType.Throne, ownerId: 'p2', army: 5 },
            ],
        });
        const { state: newState } = tick(state, {});
        expect(newState.status).toBe('ENDED');
        expect(newState.teams['t1'].status).toBe(PlayerStatus.Defeated);
        expect(newState.teams['t2'].status).toBe(PlayerStatus.Won);
    });

    it('多玩家不同队伍最后一队胜利', () => {
        const state = createBasicState({
            players: {
                p1: { teamId: 't1', status: PlayerStatus.Defeated },
                p2: { teamId: 't2', status: PlayerStatus.Playing },
                p3: { teamId: 't3', status: PlayerStatus.Defeated },
            },
            teams: {
                t1: { memberIds: ['p1'] },
                t2: { memberIds: ['p2'] },
                t3: { memberIds: ['p3'] },
            },
            tiles: [
                { y: 1, x: 1, type: TileType.Throne, ownerId: 'p2', army: 3 },
            ],
        });
        const { state: newState } = tick(state, {});
        expect(newState.status).toBe('ENDED');
        expect(newState.teams['t2'].status).toBe(PlayerStatus.Won);
        expect(newState.teams['t1'].status).toBe(PlayerStatus.Defeated);
        expect(newState.teams['t3'].status).toBe(PlayerStatus.Defeated);
    });

    it('所有玩家都被淘汰，行为触发 gameover', () => {
        const state = createBasicState({
            players: {
                p1: { teamId: 't1', status: PlayerStatus.Defeated },
                p2: { teamId: 't2', status: PlayerStatus.Defeated },
            },
            teams: {
                t1: { memberIds: ['p1'] },
                t2: { memberIds: ['p2'] },
            },
            tiles: [],
        });
        const { state: newState } = tick(state, {});
        expect(newState.status).toBe('ENDED');
        expect(newState.teams['t1'].status).toBe(PlayerStatus.Defeated);
        expect(newState.teams['t2'].status).toBe(PlayerStatus.Defeated);
    });

    it('多队伍均存活，tick 后游戏未结束', () => {
        const state = createBasicState({
            players: {
                p1: { teamId: 't1' },
                p2: { teamId: 't2' },
            },
            teams: {
                t1: { memberIds: ['p1'] },
                t2: { memberIds: ['p2'] },
            },
            tiles: [
                { y: 2, x: 2, type: TileType.Throne, ownerId: 'p1', army: 5 },
                { y: 0, x: 0, type: TileType.Throne, ownerId: 'p2', army: 5 },
            ],
        });
        const { state: newState } = tick(state, {});
        expect(newState.status).toBe('PLAYING');
        expect(newState.teams['t1'].status).toBe(PlayerStatus.Playing);
        expect(newState.teams['t2'].status).toBe(PlayerStatus.Playing);
    });

    it('A 占领 B 的王座后游戏状态为 Ended', () => {
        // 构造一个2x2地图，A占所有地块，B无地块
        const state: GameState = {
          status: 'PLAYING',
          tick: 0,
          settings: {
            afkThreshold: 5,
            tileGrow: {
              [TileType.Plain]: { duration: 1, growth: 1 },
              [TileType.Throne]: { duration: 1, growth: 1 },
              [TileType.Barracks]: { duration: 1, growth: 1 },
              [TileType.Mountain]: { duration: 100000, growth: 0 },
              [TileType.Swamp]: { duration: 1, growth: -1 },
              [TileType.Fog]: { duration: 100000, growth: 0 },
            },
          },
          players: {
            A: { id: "A", status: PlayerStatus.Playing, army: 10, land: 4, lastActiveTick: 0, teamId: "teamA" },
            B: { id: "B", status: PlayerStatus.Playing, army: 0, land: 0, lastActiveTick: 0, teamId: "teamB" },
          },
          teams: {
            teamA: { id: "teamA", memberIds: ["A"], status: PlayerStatus.Playing },
            teamB: { id: "teamB", memberIds: ["B"], status: PlayerStatus.Playing },
          },
          map: {
            width: 2,
            height: 2,
            tiles: [
              [
                { type: TileType.Plain, ownerId: "A", army: 3 },
                { type: TileType.Plain, ownerId: "A", army: 2 }
              ],
              [
                { type: TileType.Plain, ownerId: "A", army: 2 },
                { type: TileType.Plain, ownerId: "A", army: 3 }
              ]
            ]
          }
        };
        // 直接调用 tick 推进
        const { state: newState } = tick(state, {});
        expect(newState.players['A']?.status).toBe(PlayerStatus.Won);
        expect(newState.players['B']?.status).toBe(PlayerStatus.Defeated);
        expect(newState.status).toBe('ENDED');
        expect(newState.map.tiles[1][1]?.ownerId).toBe("A");
    });
});
