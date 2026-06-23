// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import {
    areAdjacent,
    validateMove,
    handleMove,
    updateGameState,
    isAdjacentToPlayer,
} from './game-utils';

import { GameStatus,
    TileType,
    GameState,
    PlayerStatus,
    Coordinates,
    MoveOperationPayload,
    PlayerOperationType,
    TeamId,
    TeamCore,
    PlayerId,
    PlayerActionQueues,
} from '@generale/types';

import { mask, tick } from './game';

// Helper to create a simple state with given dimensions
function createState(width = 5, height = 5): GameState {
    const tiles = Array.from({ length: width }, () =>
        Array.from({ length: height }, () => ({ type: TileType.Plain, ownerId: null, army: 0 }))
    );

    const settings = {
        tileGrow: {
            [TileType.Plain]: { duration: 40, growth: 1 },
            [TileType.Throne]: { duration: 1, growth: 1 },
            [TileType.Barracks]: { duration: 1, growth: 1 },
            [TileType.Mountain]: { duration: Infinity, growth: 0 },
            [TileType.Swamp]: { duration: 1, growth: -1 },
            [TileType.Fog]: { duration: Infinity, growth: 0 }
        },
        afkThreshold: 200,
    };
    return {
        tick: 0,
        settings,
        players: {},
        teams: {},
        map: { width, height, tiles },
    };
}

/**
 * Helper to create a complex, randomized game state for robust testing.
 */
function createRandomizedState(
    width = 10,
    height = 10,
    playerConfigs: { id: PlayerId; teamId: TeamId }[]
): GameState {
    let state = createState(width, height);

    // Create players and teams from config
    const teams: Record<TeamId, TeamCore> = {};
    playerConfigs.forEach(pConfig => {
        state.players[pConfig.id] = {
            id: pConfig.id,
            status: PlayerStatus.Playing,
            teamId: pConfig.teamId,
            lastActiveTick: 0,
            army: 0,
            land: 0,
        };
        if (pConfig.teamId) {
            if (!teams[pConfig.teamId]) {
                teams[pConfig.teamId] = { id: pConfig.teamId, memberIds: [], status: PlayerStatus.Playing };
            }
            teams[pConfig.teamId]!.memberIds.push(pConfig.id);
        }
    });
    state = {
        ...state,
        teams
    };

    const tiles = state.map.tiles;
    const playerIds = Object.keys(state.players);

    // Assign thrones randomly, ensuring no two players start on the same tile
    const assignedCoords = new Set<string>();
    playerIds.forEach(pid => {
        let x, y;
        do {
            x = Math.floor(Math.random() * width);
            y = Math.floor(Math.random() * height);
        } while (assignedCoords.has(`${x},${y}`));

        tiles[y][x] = {
            type: TileType.Throne,
            ownerId: pid,
            army: 10,
            _internalCounter: 0,
        };
        assignedCoords.add(`${x},${y}`);
    });

    // Populate the rest of the map
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (assignedCoords.has(`${x},${y}`)) continue;

            const rand = Math.random();
            if (rand < 0.2) { // 20% Mountain
                tiles[y][x].type = TileType.Mountain;
            } else if (rand < 0.3) { // 10% Swamp
                tiles[y][x].type = TileType.Swamp;
            } else if (rand < 0.5) { // 20% neutral Barracks
                tiles[y][x].type = TileType.Barracks;
                tiles[y][x].army = Math.floor(Math.random() * 10) + 5;
            } else { // 50% Plain
                tiles[y][x].type = TileType.Plain;
                tiles[y][x].army = Math.floor(Math.random() * 5);
            }
        }
    }

    // Run an initial update to populate army/land counts correctly
    updateGameState(state);
    state.tick = 0; // Reset tick after setup
    for (const player of Object.values(state.players)) {
        player.lastActiveTick = 0; // Reset active tick
    }
    return state;
}


describe('areAdjacent', () => {
    const tests: [Coordinates, Coordinates, boolean][] = [
        [{ x: 0, y: 0 }, { x: 1, y: 0 }, true],
        [{ x: 0, y: 0 }, { x: 0, y: 1 }, true],
        [{ x: 2, y: 2 }, { x: 3, y: 2 }, true],
        [{ x: 0, y: 0 }, { x: 1, y: 1 }, false],
        [{ x: 1, y: 1 }, { x: 3, y: 1 }, false],
    ];

    tests.forEach(([a, b, expected], i) =>
        it(`case ${i}: ${JSON.stringify(a)} <-> ${JSON.stringify(b)}`, () => {
            expect(areAdjacent(a, b)).toBe(expected);
        })
    );
});

describe('validateMove', () => {
    let state: GameState;

    beforeEach(() => {
        state = createState(3, 3);
        state.players['p'] = { id: 'p', status: PlayerStatus.Playing, teamId: undefined };
        // center tile owned with enough army
        state.map.tiles[1][1].ownerId = 'p';
        state.map.tiles[1][1].army = 5;
    });

    it('valid near move', () => {
        const p: MoveOperationPayload = { from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, percentage: 50 };
        expect(validateMove(state, 'p', p)).toBe(true);
    });

    it('invalid out-of-bounds', () => {
        const p: MoveOperationPayload = { from: { x: -1, y: 0 }, to: { x: 0, y: 0 }, percentage: 50 };
        expect(validateMove(state, 'p', p)).toBe(false);
    });

    it('invalid mountain target', () => {
        state.map.tiles[1][2].type = TileType.Mountain;
        const p = { from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, percentage: 20 };
        expect(validateMove(state, 'p', p)).toBe(false);
    });

    it('invalid too low army', () => {
        state.map.tiles[1][1].army = 1;
        const p = { from: { x: 1, y: 1 }, to: { x: 1, y: 2 }, percentage: 50 };
        expect(validateMove(state, 'p', p)).toBe(false);
    });

    // randomized fuzz
    it('random fuzz does not throw', () => {
        for (let i = 0; i < 20; i++) {
            const w = 3, h = 3;
            const s = createState(w, h);
            s.players['x'] = { id: 'x', status: PlayerStatus.Playing, teamId: undefined };
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                s.map.tiles[y][x].ownerId = Math.random() < 0.5 ? 'x' : null;
                s.map.tiles[y][x].army = Math.floor(Math.random() * 5);
                s.map.tiles[y][x].type = Math.random() < 0.2 ? TileType.Mountain : TileType.Plain;
            }
            const p: MoveOperationPayload = {
                from: { x: Math.floor(Math.random() * w), y: Math.floor(Math.random() * h) },
                to: { x: Math.floor(Math.random() * w), y: Math.floor(Math.random() * h) },
                percentage: Math.floor(Math.random() * 200) - 50,
            };
            expect(() => validateMove(s, 'x', p)).not.toThrow();
        }
    });
});

describe('handleMove', () => {
    let state: GameState;
    beforeEach(() => {
        state = createState(3, 3);
        state.players['p'] = { id: 'p', status: PlayerStatus.Playing, teamId: 'team1' as TeamId };
        state.teams['team1' as TeamId] = { id: 'team1' as TeamId, memberIds: ['p'], status: PlayerStatus.Playing };
    });

    it('merge into own tile', () => {
        state.map.tiles[0][0] = { type: TileType.Plain, ownerId: 'p', army: 10 };
        state.map.tiles[1][0] = { type: TileType.Plain, ownerId: 'p', army: 2 };
        const ok = handleMove(state, 'p', { from: { y: 0, x: 0 }, to: { y: 1, x: 0 }, percentage: 100 });
        expect(ok).toBe(true);
        expect(state.map.tiles[0][0].army).toBe(1);
        expect(state.map.tiles[1][0].army).toBe(11);
    });

    it('attack neutral tile', () => {
        state.map.tiles[1][1] = { type: TileType.Plain, ownerId: 'p', army: 10 };
        state.map.tiles[1][2] = { type: TileType.Plain, ownerId: null, army: 3 };
        const ok = handleMove(state, 'p', { from: { y: 1, x: 1 }, to: { y: 1, x: 2 }, percentage: 50 });
        expect(ok).toBe(true);
        const dst = state.map.tiles[1][2];
        expect(dst.ownerId).toBe('p');
        expect(dst.army).toBe(2);
    });

    it('defeat enemy and trigger playerDefeatedBy on throne', () => {
        state.players['e'] = { id: 'e', status: PlayerStatus.Playing, teamId: 'team2' as TeamId };
        state.teams['team2' as TeamId] = { id: 'team2' as TeamId, memberIds: ['e'], status: PlayerStatus.Playing };
        state.map.tiles[2][2] = { type: TileType.Throne, ownerId: 'e', army: 1 };
        state.map.tiles[1][2] = { type: TileType.Plain, ownerId: 'p', army: 5 };
        // move enough to kill
        const ok = handleMove(state, 'p', { from: { y: 1, x: 2 }, to: { y: 2, x: 2 }, percentage: 100 });
        expect(ok).toBe(true);
        expect(state.players['e'].status).toBe(PlayerStatus.Defeated);
        // throne downgraded to Barracks
        expect(state.map.tiles[2][2].type).toBe(TileType.Barracks);
    });

    it('returns false when validateMove fails', () => {
        // invalid coords
        const ok = handleMove(state, 'p', { from: { x: -1, y: -1 }, to: { x: 0, y: 0 }, percentage: 50 });
        expect(ok).toBe(false);
    });
});

describe('updateGameState', () => {
    it('grows army and counts', () => {
        const s = createState(2, 2);
        s.players['p'] = { id: 'p', status: PlayerStatus.Playing, teamId: undefined };
        s.map.tiles[0][0] = { type: TileType.Barracks, ownerId: 'p', army: 2 };
        updateGameState(s);
        // growth of 1
        expect(s.map.tiles[0][0].army).toBe(3);
        // summary fields
        expect(s.players['p'].army).toBe(3);
        expect(s.players['p'].land).toBe(1);
        expect(s.tick).toBe(1);
    });

    it('afk threshold triggers defeat', () => {
        const _s = createState(1, 1);
        const s = {
            ..._s,
            tick: 199,
            settings: {
                ..._s.settings,
                afkThreshold: 0
            }
        };

        s.players['p'] = { id: 'p', status: PlayerStatus.Playing, lastActiveTick: 0, teamId: undefined };
        s.map.tiles[0][0] = { type: TileType.Plain, ownerId: 'p', army: 1 };
        updateGameState(s);
        expect(s.players['p'].status).toBe(PlayerStatus.Defeated);
        expect(s.map.tiles[0][0].ownerId).toBe(null);
    });
});

describe('tick', () => {
    it('applies successful move and advances tick', () => {
        const state = createState(3, 3);
        state.players['p'] = { id: 'p', status: PlayerStatus.Playing, teamId: undefined };
        state.map.tiles[1][1] = { type: TileType.Plain, ownerId: 'p', army: 4 };
        const queues = { p: [{ type: PlayerOperationType.Move, payload: { from: { x: 1, y: 1 }, to: { x: 1, y: 2 }, percentage: 50 } }] };
        const { state: newState, queue: newQ } = tick(state, queues);
        expect(newState.tick).toBe(1);
        expect(newQ.p.length).toBe(0);
        expect(newState.players['p'].lastActiveTick).toBe(0);
    });

    it('skips invalid op without consuming', () => {
        const state = createState(2, 2);
        state.players['p'] = { id: 'p', status: PlayerStatus.Playing, teamId: undefined };
        const queues = { p: [{ type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, percentage: 10 } }] };
        const { state: newState, queue: newQ } = tick(state, queues);
        expect(newQ.p.length).toBe(0);
        expect(newState.tick).toBe(1);
    });
});

describe('isAdjacentToPlayer', () => {
    it('detects adjacency in 8 directions', () => {
        const s = createState(3, 3);
        s.map.tiles[1][1].ownerId = 'p';
        // all around should be true
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            expect(isAdjacentToPlayer(s, 'p', { x: 1 + dx, y: 1 + dy })).toBe(true);
        }
    });

    it('returns false when no neighbor', () => {
        const s = createState(3, 3);
        expect(isAdjacentToPlayer(s, 'p', { x: 0, y: 0 })).toBe(false);
    });
});

describe('mask', () => {
    it('hides non-adjacent and non-owned cells', () => {
        const s = createState(3, 3);
        s.players['p'] = { id: 'p', status: PlayerStatus.Playing, teamId: undefined };
        // own a corner
        s.map.tiles[0][0].ownerId = 'p';
        // other owned far
        s.map.tiles[2][2].ownerId = 'q';
        const m = mask(s, 'p');
        // (2,2) should be fog
        expect(m.map.tiles[2][2].type).toBe(TileType.Fog);
        // (0,1) adjacent->visible
        expect(m.map.tiles[0][1].type).not.toBe(TileType.Fog);
    });

    it('reveals teammate-owned', () => {
        const s = createState(3, 3);
        s.players['p'] = { id: 'p', status: PlayerStatus.Playing, teamId: 't' };
        s.players['q'] = { id: 'q', status: PlayerStatus.Playing, teamId: 't' };
        s.teams['t'] = { id: 't', memberIds: ['p', 'q'], status: PlayerStatus.Playing };
        s.map.tiles[2][2].ownerId = 'q';
        const m = mask(s, 'p');
        expect(m.map.tiles[2][2].type).not.toBe(TileType.Fog);
    });
});

describe('Enhanced Multi-Step and Randomized Tests', () => {

    describe('Fixed Multi-Step Scenarios', () => {

        it('1. 一个玩家应占领相邻的无人地块', () => {
            const state = createState(5, 5);
            state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing };
            // 起始地块 (x=1, y=1), 对应 tiles[1][1]
            state.map.tiles[1][1] = { ownerId: 'p1', army: 10, type: TileType.Plain };
            // 目标地块 (x=2, y=1), 对应 tiles[1][2]
            state.map.tiles[1][2] = { ownerId: null, army: 3, type: TileType.Plain };

            // 移动指令: 从 (x=1, y=1) 到 (x=2, y=1)
            let queues: PlayerActionQueues = { 'p1': [{ type: PlayerOperationType.Move, payload: { from: { y: 1, x: 1 }, to: { y: 1, x: 2 }, percentage: 50 } }] };

            let { state: newState } = tick(state, queues);

            // 验证起始地块
            expect(newState.map.tiles[1][1].army).toBe(5); // 10 - 5
            // 验证目标地块 tiles[1][2]
            expect(newState.map.tiles[1][2].ownerId).toBe('p1');
            expect(newState.map.tiles[1][2].army).toBe(2); // 5 - 3
        });

        it('2. 占领王座会导致玩家战败，其地块被转移', () => {
            const state = createState(5, 5);
            state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing };
            state.players['p2'] = { id: 'p2', status: PlayerStatus.Playing };
            // p1 的兵营 (x=0, y=1), 对应 tiles[1][0]
            state.map.tiles[1][0] = { ownerId: 'p1', army: 20, type: TileType.Plain };
            // p2 的王座 (x=1, y=1), 对应 tiles[1][1]
            state.map.tiles[1][1] = { ownerId: 'p2', army: 5, type: TileType.Throne };
            // p2 的另一块地 (x=4, y=4), 对应 tiles[4][4]
            state.map.tiles[4][4] = { ownerId: 'p2', army: 100, type: TileType.Plain };

            // 移动指令: p1 从 (x=0, y=1) 攻击 (x=1, y=1)
            const queues: PlayerActionQueues = { 'p1': [{ type: PlayerOperationType.Move, payload: { from: { y: 1, x: 0 }, to: { y: 1, x: 1 }, percentage: 100 } }] };
            const { state: newState } = tick(state, queues);

            expect(newState.players['p2'].status).toBe(PlayerStatus.Defeated);
            // 王座被占领，变为兵营，位置在 tiles[1][1]
            expect(newState.map.tiles[1][1].ownerId).toBe('p1');
            expect(newState.map.tiles[1][1].type).toBe(TileType.Barracks);
            expect(newState.map.tiles[1][1].army).toBe(15); // 19 - 5 + 1 因为一个 tick 兵营 +1
            // p2 的另一块地 tiles[4][4] 也被 p1 占领
            expect(newState.map.tiles[4][4].ownerId).toBe('p1');
        });

        it('3a. 队友之间可以增援兵力', () => {
            const state = createState(5, 5);
            state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing, teamId: 'team1' as TeamId };
            state.players['p2'] = { id: 'p2', status: PlayerStatus.Playing, teamId: 'team1' as TeamId };
            state.teams['team1' as TeamId] = { id: 'team1' as TeamId, memberIds: ['p1', 'p2'], status: PlayerStatus.Playing };
            // p1 地块 (x=1, y=1), 对应 tiles[1][1]
            state.map.tiles[1][1] = { ownerId: 'p1', army: 15, type: TileType.Plain };
            // p2 地块 (x=1, y=2), 对应 tiles[2][1]
            state.map.tiles[2][1] = { ownerId: 'p2', army: 5, type: TileType.Plain };

            // 移动指令: p1 从 (x=1, y=1) 增援 (x=1, y=2)
            const queues: PlayerActionQueues = { 'p1': [{ type: PlayerOperationType.Move, payload: { from: { y: 1, x: 1 }, to: { y: 2, x: 1 }, percentage: 50 } }] };
            const { state: newState } = tick(state, queues);

            const movingArmy = 7; // floor(15 * 0.5)
            // 验证 p1 地块 tiles[1][1]
            expect(newState.map.tiles[1][1].army).toBe(15 - movingArmy);
            // 验证 p2 地块 tiles[2][1]
            expect(newState.map.tiles[2][1].ownerId).toBe('p1'); // 归属权变化
            expect(newState.map.tiles[2][1].army).toBe(5 + movingArmy);
        });

        it('3b. 队友之间可以增援王座(Throne)，且王座归属权不变', () => {
            const state = createState(5, 5);
            state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing, teamId: 'team1' as TeamId };
            state.players['p2'] = { id: 'p2', status: PlayerStatus.Playing, teamId: 'team1' as TeamId };
            state.teams['team1' as TeamId] = { id: 'team1' as TeamId, memberIds: ['p1', 'p2'], status: PlayerStatus.Playing };
            
            // p1 的兵营 (x=1, y=1), 对应 tiles[1][1]
            state.map.tiles[1][1] = { ownerId: 'p1', army: 15, type: TileType.Barracks };
            // p2 的王座 (x=1, y=2), 对应 tiles[2][1]
            state.map.tiles[2][1] = { ownerId: 'p2', army: 5, type: TileType.Throne };

            // 移动指令: p1 从 (x=1, y=1) 增援 p2 的王座 (x=1, y=2)
            const queues: PlayerActionQueues = { 'p1': [{ type: PlayerOperationType.Move, payload: { from: { y: 1, x: 1 }, to: { y: 2, x: 1 }, percentage: 50 } }] };
            const { state: newState } = tick(state, queues);

            const movingArmy = 7; // floor(15 * 0.5)

            // 验证 p1 的地块 tiles[1][1] 兵力减少
            expect(newState.map.tiles[1][1].army).toBe(15 - movingArmy + 1);
            
            // 验证 p2 的王座 tiles[2][1]
            // **关键断言**: 王座的归属权应保持为 p2
            expect(newState.map.tiles[2][1].ownerId).toBe('p2'); 
            // 兵力应合并
            expect(newState.map.tiles[2][1].army).toBe(5 + movingArmy + 1);
        });

        it.skip('4. 连续的移动指令队列会被逐个 tick 顺序执行', () => {
            let state = createState(10, 10);
state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing, teamId: 'team1' as TeamId, army: 100, land: 1, lastActiveTick: 0 };
state.players['p2'] = { id: 'p2', status: PlayerStatus.Playing, teamId: 'team2' as TeamId, army: 50, land: 1, lastActiveTick: 0 };
state.teams['team1' as TeamId] = { id: 'team1' as TeamId, memberIds: ['p1'], status: PlayerStatus.Playing };
state.teams['team2' as TeamId] = { id: 'team2' as TeamId, memberIds: ['p2'], status: PlayerStatus.Playing };
// 让p2占据远离p1的角落地块，避免被影响
state.map.tiles[9][9] = { ownerId: 'p2', army: 50, type: TileType.Plain };
// 起点 (x=0, y=0), 对应 tiles[0][0]
state.map.tiles[0][0] = { ownerId: 'p1', army: 100, type: TileType.Plain };


            let queues: PlayerActionQueues = {
                'p1': [
                    // (0,0)=>[0,1]
                    { type: PlayerOperationType.Move, payload: { from: { y: 0, x: 0 }, to: { y: 0, x: 1 }, percentage: 20 } },
                    // (0,1)=>[0,2]
                    { type: PlayerOperationType.Move, payload: { from: { y: 0, x: 1 }, to: { y: 0, x: 2 }, percentage: 20 } },
                    // (0,2)=>[0,3]
                    { type: PlayerOperationType.Move, payload: { from: { y: 0, x: 2 }, to: { y: 0, x: 3 }, percentage: 100 } },
                    { type: PlayerOperationType.Move, payload: { from: { y: 0, x: 3 }, to: { y: 1, x: 3 }, percentage: 1 } },
                    { type: PlayerOperationType.Move, payload: { from: { y: 0, x: 3 }, to: { y: 1, x: 3 }, percentage: 1 } },
                    { type: PlayerOperationType.Move, payload: { from: { y: 0, x: 3 }, to: { y: 1, x: 3 }, percentage: 1 } },
                ]
            };

            // Tick 1
            let res = tick(state, queues);
            state = res.state;
            queues = res.queue;
            expect(state.status).toBe(GameStatus.Playing);
            expect(state.map.tiles[0][1].ownerId).toBe('p1'); // 验证 tiles[y=0][x=1]
            expect(queues.p1.length).toBe(5);

            // Tick 2
            res = tick(state, queues);
            state = res.state;
            queues = res.queue;
            expect(state.status).toBe(GameStatus.Playing);
            expect(state.map.tiles[0][2].ownerId).toBe('p1'); // 验证 tiles[y=0][x=2]
            expect(queues.p1.length).toBe(4);

            // Tick 3
            res = tick(state, queues);
            state = res.state;
            queues = res.queue;
            expect(res.state.status).toBe(GameStatus.Playing);
            expect(res.state.map.tiles[0][3].ownerId).toBe('p1'); // 验证 tiles[y=0][x=3]
            expect(res.queue.p1.length).toBe(3);

            res = tick(state, queues);
            expect(res.state.status).toBe(GameStatus.Playing);
            expect(res.state.map.tiles[1][3].ownerId).toBe(null); // 验证 tiles[y=1][x=3] 因为兵力不够所以失败
            expect(res.queue.p1.length).toBe(0); // 后续操作都被放弃
        });

        it('5. 战争迷雾(mask)会因占领新地块而扩大视野', () => {
            let state = createState(5, 5);
            state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing };
            // 玩家地块 (x=1, y=1), 对应 tiles[1][1]
            state.map.tiles[1][1] = { ownerId: 'p1', army: 10, type: TileType.Plain };

            // 移动前，(x=1, y=3) -> tiles[3][1] 处应为迷雾
            let maskedState = mask(state, 'p1');
            expect(maskedState.map.tiles[3][1].type).toBe(TileType.Fog);

            // 移动到 (x=1, y=2) -> tiles[2][1]
            const queues: PlayerActionQueues = { 'p1': [{ type: PlayerOperationType.Move, payload: { from: { y: 1, x: 1 }, to: { y: 2, x: 1 }, percentage: 50 } }] };
            state = tick(state, queues).state;

            // 移动后, (x=1, y=3) -> tiles[3][1] 与新地块 tiles[2][1] 相邻, 应该可见
            maskedState = mask(state, 'p1');
            expect(maskedState.map.tiles[3][1].type).not.toBe(TileType.Fog);
        });

        it('6. 攻击沼泽地块(Swamp)会在占领后损失兵力', () => {
            const state = createState(5, 5);
            state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing, teamId: 'team1' as TeamId, army: 20, land: 1, lastActiveTick: 0 };
            state.players['p2'] = { id: 'p2', status: PlayerStatus.Playing, teamId: 'team2' as TeamId, army: 50, land: 1, lastActiveTick: 0 };
            state.teams['team1' as TeamId] = { id: 'team1' as TeamId, memberIds: ['p1'], status: PlayerStatus.Playing };
            state.teams['team2' as TeamId] = { id: 'team2' as TeamId, memberIds: ['p2'], status: PlayerStatus.Playing };
            // 让p2占据远离p1的角落地块，避免被影响
            state.map.tiles[4][4] = { ownerId: 'p2', army: 50, type: TileType.Plain };
            // 起始地块 (x=0, y=0), 对应 tiles[0][0]
            state.map.tiles[0][0] = { ownerId: 'p1', army: 20, type: TileType.Plain };
            // 目标沼泽 (x=0, y=1), 对应 tiles[1][0]
            state.map.tiles[1][0] = { ownerId: null, army: 5, type: TileType.Swamp };

            // 移动指令: 从 (x=0, y=0) 攻击 (x=0, y=1)
            const queues: PlayerActionQueues = { 'p1': [{ type: PlayerOperationType.Move, payload: { from: { y: 0, x: 0 }, to: { y: 1, x: 0 }, percentage: 100 } }] };
            let { state: newState } = tick(state, queues);

            // p1 移动 19 兵力, 占领后兵力为 19-5=14。然后负增长会生效所以是 13 验证 tiles[1][0]
            expect(newState.map.tiles[1][0].army).toBe(13);
            expect(newState.status).toBe(GameStatus.Playing);
            expect(newState.map.tiles[1][0].ownerId).toBe('p1');

            // 在下一个 tick，沼泽地块的负增长也会生效
            ({ state: newState } = tick(newState, {}));
            // 兵力从 14 变为 13。验证 tiles[1][0]
            expect(newState.status).toBe(GameStatus.Playing);
            expect(newState.map.tiles[1][0].army).toBe(12);
        });

    });

    it('7. Vision (mask) should expand after capturing new territory', () => {
        let state = createState(5, 5);
        state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing };
        state.map.tiles[1][1] = { ownerId: 'p1', army: 10, type: TileType.Plain };

        // Before move, (1,3) is not visible
        let maskedState = mask(state, 'p1');
        expect(maskedState.map.tiles[1][3].type).toBe(TileType.Fog);

        // Move to (1,2), which makes (1,3) adjacent
        const queues: PlayerActionQueues = { 'p1': [{ type: PlayerOperationType.Move, payload: { from: { x: 1, y: 1 }, to: { x: 1, y: 2 }, percentage: 100 } }] };
        state = tick(state, queues).state;

        // After move, (1,3) should now be visible (not fog)
        maskedState = mask(state, 'p1');
        expect(maskedState.map.tiles[3][1].type).not.toBe(TileType.Fog);
    });

    it('8. Team vision (mask) reveals teammate`s actions and territory', () => {
        let state = createState(5, 5);
        state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing, teamId: 'team1' as TeamId };
        state.players['p2'] = { id: 'p2', status: PlayerStatus.Playing, teamId: 'team1' as TeamId };
        state.teams['team1' as TeamId] = { id: 'team1' as TeamId, memberIds: ['p1', 'p2'], status: PlayerStatus.Playing };
        state.map.tiles[0][0] = { ownerId: 'p1', army: 1, type: TileType.Plain };
        state.map.tiles[4][4] = { ownerId: 'p2', army: 1, type: TileType.Plain }; // Far away

        // p1 should be able to see p2's tile
        let maskedState = mask(state, 'p1');
        expect(maskedState.map.tiles[4][4].type).not.toBe(TileType.Fog);
        expect(maskedState.map.tiles[4][4].ownerId).toBe('p2');
    });

    it('9. An invalid move in a queue should be rejected, not halting the game', () => {
        const state = createState(5, 5);
        state.players['p1'] = { id: 'p1', status: PlayerStatus.Playing };
        state.map.tiles[0][0] = { ownerId: 'p1', army: 20, type: TileType.Plain };

        // An invalid move (to mountain) followed by a valid one
        const queues: PlayerActionQueues = {
            'p1': [
                { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, percentage: 50 } }
            ]
        };

        const { state: newState, queue: newQueue } = tick(state, queues);

        // The invalid move is discarded, queue is now empty
        expect(newQueue['p1'].length).toBe(0);
        // Tick still advances
        expect(newState.tick).toBe(1);
        // Player's army is unchanged
        expect(newState.map.tiles[0][0].army).toBe(20);
    });

});

describe.skip('Randomized Multi-Step Fuzz Tests', () => {

    for (let i = 0; i < 50; i++) {
        it(`Randomized Test Case #${i + 1}`, () => {
            let state = createRandomizedState(10, 10, [
                { id: 'p1', teamId: 'team1' as TeamId },
                { id: 'p2', teamId: 'team1' as TeamId },
                { id: 'p3', teamId: 'team2' as TeamId },
                { id: 'p4', teamId: 'team2' as TeamId },
            ]);

            const simulationTicks = Math.floor(Math.random() * 25) + 5; // 5 to 30 ticks

            for (let t = 0; t < simulationTicks; t++) {
                let queues: PlayerActionQueues = {};
                // Each player has a 50% chance of making a move this tick
                for (const player of Object.values(state.players)) {
                    if (player.status === PlayerStatus.Playing && Math.random() < 0.5) {
                        // Find a valid source tile to move from
                        const ownedTiles: Coordinates[] = [];
                        for (let y = 0; y < state.map.height; y++) {
                            for (let x = 0; x < state.map.width; x++) {
                                if (state.map.tiles[y][x].ownerId === player.id && state.map.tiles[y][x].army > 1) {
                                    ownedTiles.push({ x, y });
                                }
                            }
                        }

                        if (ownedTiles.length > 0) {
                            const from = ownedTiles[Math.floor(Math.random() * ownedTiles.length)];
                            // Find a valid adjacent destination
                            const destinations: Coordinates[] = [];
                            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                                if (Math.abs(dx) + Math.abs(dy) !== 1) continue; // 4-way adjacent only
                                const to = { x: from.x + dx, y: from.y + dy };
                                if (to.x >= 0 && to.x < state.map.width && to.y >= 0 && to.y < state.map.height && state.map.tiles[to.y][to.x].type !== TileType.Mountain) {
                                    destinations.push(to);
                                }
                            }

                            if (destinations.length > 0) {
                                const to = destinations[Math.floor(Math.random() * destinations.length)];
                                queues[player.id] = [{ type: PlayerOperationType.Move, payload: { from, to, percentage: 50 } }];
                            }
                        }
                    }
                }
                state = tick(state, queues).state;
            }

            // --- ASSERTIONS ---
            expect(state.tick).toBe(simulationTicks);

            let totalLand = 0;
            for (const player of Object.values(state.players)) {
                // Invariant: Defeated players should have 0 land and army
                if (player.status === PlayerStatus.Defeated) {
                    expect(player.army).toBe(0);
                    expect(player.land).toBe(0);
                }
                // Invariant: Player stats should be non-negative
                expect(player.army).toBeGreaterThanOrEqual(0);
                expect(player.land).toBeGreaterThanOrEqual(0);
                totalLand += player.land!;
            }

            // Invariant: Check mask correctness for a random living player
            const livingPlayers = Object.values(state.players).filter(p => p.status === PlayerStatus.Playing);
            if (livingPlayers.length > 0) {
                const testPlayer = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
                const maskedState = mask(state, testPlayer.id);

                for (let y = 0; y < state.map.height; y++) {
                    for (let x = 0; x < state.map.width; x++) {
                        const originalTile = state.map.tiles[y][x];
                        const maskedTile = maskedState.map.tiles[y][x];
                        const isVisible = originalTile.ownerId === testPlayer.id ||
                            (testPlayer.teamId && state.players[originalTile.ownerId!]?.teamId === testPlayer.teamId) ||
                            isAdjacentToPlayer(state, testPlayer.id, { x, y });

                        if (isVisible) {
                            expect(maskedTile.type).not.toBe(TileType.Fog);
                            expect(maskedTile.ownerId).toBe(originalTile.ownerId);
                        } else {
                            expect(maskedTile.type).toBe(TileType.Fog);
                            expect(maskedTile.ownerId).toBe(null);
                            expect(maskedTile.army).toBe(0);
                        }
                    }
                }
            }

        });
    }
});
