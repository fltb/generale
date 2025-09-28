import { type SyncedGameState, TileType, PlayerOperationType, PlayerStatus, GameStatus } from "@generale/types";
import { MapRender } from "../MapRender";

// Test data for MapRender
const testGameState: SyncedGameState = {
    status: GameStatus.Playing,
    tick: 0,
    settings: {
        tileGrow: {
            [TileType.Plain]: { duration: 5, growth: 1 },
            [TileType.Throne]: { duration: 3, growth: 2 },
            [TileType.Barracks]: { duration: 2, growth: 3 },
            [TileType.Mountain]: { duration: 0, growth: 0 },
            [TileType.Swamp]: { duration: 0, growth: 0 },
            [TileType.Fog]: { duration: 0, growth: 0 },
        },
        afkThreshold: 100
    },
    players: {
        'player1': {
            id: 'player1',
            status: PlayerStatus.Playing,
            army: 100,
            land: 5,
            lastActiveTick: 0,
            teamId: 'team1'
        },
        'player2': {
            id: 'player2',
            status: PlayerStatus.Playing,
            army: 80,
            land: 3,
            lastActiveTick: 0,
            teamId: 'team2'
        }
    },
    teams: {
        'team1': { id: 'team1', memberIds: ['player1'], status: PlayerStatus.Playing },
        'team2': { id: 'team2', memberIds: ['player2'], status: PlayerStatus.Playing }
    },
    map: {
        width: 8,
        height: 6,
        tiles: Array(6).fill(null).map((_, y) =>
            Array(8).fill(null).map((_, x) => ({
                type: Math.random() > 0.7 ? TileType.Mountain :
                    Math.random() > 0.6 ? TileType.Barracks :
                        Math.random() > 0.5 ? TileType.Throne : TileType.Plain,
                ownerId: Math.random() > 0.5 ? (Math.random() > 0.5 ? 'player1' : 'player2') : null,
                army: Math.floor(Math.random() * 20),
                _internalCounter: 0
            }))
        )
    },
    playerDisplay: {
        'player1': { tileColor: 0xff0000 },
        'player2': { tileColor: 0x0000ff }
    },
    playerOperationQueue: [
        {
            type: PlayerOperationType.Move,
            payload: {
                from: { x: 1, y: 1 },
                to: { x: 2, y: 1 },
                percentage: 50
            }
        },
        {
            type: PlayerOperationType.Move,
            payload: {
                from: { x: 3, y: 3 },
                to: { x: 4, y: 3 },
                percentage: 75
            }
        }
    ]
};

export default function MapRenderTest() {
    return (
        <MapRender state={testGameState} />
    );
}