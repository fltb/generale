import { t, type Static } from 'elysia';
import { GamePhase } from '../../game';

// --- Reusable Core Schemas ---

/**
 * Schema for game settings, used when creating a game.
 */
export const gameCreationSettingsRouteSchema = t.Object({
    maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 8 })),
    mapSize: t.Optional(t.Union([t.Literal("small"), t.Literal("medium"), t.Literal("large")])),
    gameMode: t.Optional(t.Union([t.Literal("classic"), t.Literal("blitz"), t.Literal("custom")]))
});
export type GameCreationSettingsRoute = Static<typeof gameCreationSettingsRouteSchema>;

/**
 * Schema for a player within a game lobby or info object.
 */
export const gamePlayerDisplayRouteSchema = t.Object({
    id: t.String(),
    name: t.String(),
    isHost: t.Boolean()
});
export type GamePlayerDisplayRoute = Static<typeof gamePlayerDisplayRouteSchema>;

/**
 * Schema for the detailed information of a single game.
 */
export const gameInfoRouteSchema = t.Object({
    id: t.String(),
    hostId: t.String(),
    players: t.Array(gamePlayerDisplayRouteSchema),
    settings: gameCreationSettingsRouteSchema,
    status: t.Union([t.Literal("lobby"), t.Literal("in-progress"), t.Literal("finished")]),
    playerCount: t.Number(),
    maxPlayers: t.Number(),
    hasPassword: t.Boolean()
});
export type GameInfoRoute = Static<typeof gameInfoRouteSchema>;


// --- Request Schemas ---

export const createGameReqSchema = t.Object({
    playerName: t.String({ minLength: 1, maxLength: 50 }),
    gameSettings: t.Optional(gameCreationSettingsRouteSchema)
});
export type CreateGameReqBody = Static<typeof createGameReqSchema>;

export const gameParamsReqSchema = t.Object({
    gameId: t.String()
});
export type GameParamsReq = Static<typeof gameParamsReqSchema>;

export const gamePlayerParamsReqSchema = t.Object({
    gameId: t.String(),
    playerId: t.String()
});
export type GamePlayerParamsReq = Static<typeof gamePlayerParamsReqSchema>;



export const createGameSuccessRespSchema = t.Object({
    success: t.Literal(true),
    data: t.Object({
        gameId: t.String(),
        playerId: t.String(),
        message: t.String()
    })
});
export type CreateGameSuccessResp = Static<typeof createGameSuccessRespSchema>;

export const gameInfoSuccessRespSchema = t.Object({
    success: t.Literal(true),
    data: gameInfoRouteSchema
});
export type GameInfoSuccessResp = Static<typeof gameInfoSuccessRespSchema>;

export const listGamesSuccessRespSchema = t.Object({
    success: t.Literal(true),
    data: t.Array(t.Pick(gameInfoRouteSchema, ['id', 'playerCount', 'maxPlayers', 'status', 'hasPassword']))
});
export type ListGamesSuccessResp = Static<typeof listGamesSuccessRespSchema>;

export const connectWsSuccessRespSchema = t.Object({
    success: t.Literal(true),
    data: t.Object({
        gameId: t.String(),
        playerId: t.String(),
        phase: t.Enum(GamePhase),
        domains: t.Object({
            primary: t.String(),
            chat: t.String(),
        }),
        message: t.String()
    })
});
export type ConnectWsSuccessResp = Static<typeof connectWsSuccessRespSchema>;
