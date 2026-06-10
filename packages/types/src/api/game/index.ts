import { t, type Static } from 'elysia';
import { GamePhase } from '../../game';

// --- reusable primitives ---
export const gameStatusSchema = t.Union([
    t.Literal("lobby"),
    t.Literal("in-progress"),
    t.Literal("finished"),
]);
export type GameStatus = Static<typeof gameStatusSchema>;

export const standardMapSizeSchema = t.Union([
  t.Literal("small"),
  t.Literal("medium"),
  t.Literal("large")
])

export const customMapSizeSchema = t.Object({
  width: t.Number({ minimum: 10, maximum: 500 }),
  height: t.Number({ minimum: 10, maximum: 500 })
})

export const mapSizeSchema = t.Union([
  standardMapSizeSchema,
  customMapSizeSchema
])

/**
 * Schema for game settings, used when creating a game.
 */
export const gameCreationSettingsRouteSchema = t.Union([
    // standard variant
    t.Object({
        maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 8 })),
        // small/medium/large allowed for standard
        mapSize: t.Optional(standardMapSizeSchema),
        // 队伍模式：ffa = 单人 free-for-all，team = 经典组队。缺省 ffa
        teamMode: t.Optional(t.Union([t.Literal("ffa"), t.Literal("team")])),
        // discriminant for variant
        type: t.Literal("standard")
    }),

    // custom variant
    t.Object({
        maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 8 })),
        // numeric width/height required for custom
        mapSize: customMapSizeSchema,
        teamMode: t.Optional(t.Union([t.Literal("ffa"), t.Literal("team")])),
        type: t.Literal("custom")
    })
]);
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

// ========== unified summary schema ==========

/**
 * Summary schema for a game / room used in lists.
 * This is the shared base that listGamesSuccessRespSchema uses,
 * and that gameInfoRouteSchema extends with more detailed fields.
 */
export const gameSummaryRouteSchema = t.Object({
    id: t.String(),
    roomName: t.String(),
    hostId: t.Optional(t.String()),
    hostName: t.Optional(t.String()),
    playerCount: t.Number(),
    maxPlayers: t.Number(),
    status: gameStatusSchema,
    hasPassword: t.Boolean(),
    type: t.Union([t.Literal("standard"), t.Literal("custom")]),    // 游戏模式 / 类型
    map: t.Optional(mapSizeSchema),        // 可改为更精确的 map schema / 字符串 / 对象
});
export type GameSummaryRoute = Static<typeof gameSummaryRouteSchema>;

// ========== detailed info schema (extends summary) ==========

/**
 * Detailed game info schema: extend the summary with players & settings.
 * 用 t.Composite 平铺成单一 t.Object，避免 t.Intersect 在校验 / KeyOf 上的坑。
 */
export const gameInfoRouteSchema = t.Composite([
    gameSummaryRouteSchema,
    t.Object({
        // players: full players list (detailed)
        players: t.Array(gamePlayerDisplayRouteSchema),
        // settings: same shape as creation settings (or more detailed if needed)
        settings: gameCreationSettingsRouteSchema,
    })
]);
export type GameInfoRoute = Static<typeof gameInfoRouteSchema>;

// ========== query / request / response schemas ==========

const gameListFilterSchema = t.Object({
    roomName: t.Optional(t.String()), // 按房间名模糊匹配
    type: t.Optional(t.Union([t.Literal("standard"), t.Literal("custom")])),
    // 接收字符串形式的 map filter： "small" | "medium" | "large" | "200x150"
    map: t.Optional(t.String()),
    status: t.Optional(gameStatusSchema),
    hostName: t.Optional(t.String()),
    minPlayers: t.Optional(t.String()),
    maxPlayers: t.Optional(t.String()),
    hasPassword: t.Optional(t.String()),
})
export type GameListFilterType = Static<typeof gameListFilterSchema>;

const gameListSortSchema = t.Object({
    sortBy: t.Optional(t.KeyOf(gameInfoRouteSchema)),
    sortOrder: t.Optional(t.String()),
})
export type GameListSortType = Static<typeof gameListSortSchema>;

const gameListPaginationSchema = t.Object({
    offset: t.Optional(t.String()),  // 偏移量
    limit: t.Optional(t.String()),   // 截断数量
})
export type GameListPaginationType = Static<typeof gameListPaginationSchema>;

// 不要用 t.Intersect —— TypeBox 编译器在 query schema 上不支持
// `Intersect + additionalProperties:false` 的组合，会直接抛
// "Preflight validation check failed to guard for the given schema"。
// t.Composite 会把多个 t.Object 平铺成一个 t.Object，没有 allOf，可以正常编译。
export const listGamesQuerySchema = t.Composite([
    gameListFilterSchema,
    gameListSortSchema,
    gameListPaginationSchema
]);
export type ListGamesQuery = Static<typeof listGamesQuerySchema>;

// --- Request Schemas ---
export const createGameReqSchema = t.Object({
    roomName: t.String({ minLength: 1, maxLength: 50 }),
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

export const verifyReqSchema = t.Object({
    email: t.String(),
    code: t.String()
});
export type VerifyReqBody = Static<typeof verifyReqSchema>;

// --- Responses ---
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

/**
 * List response now reuses the shared `gameSummaryRouteSchema`.
 */
export const listGamesSuccessRespSchema = t.Object({
    success: t.Literal(true),
    data: t.Array(gameSummaryRouteSchema)
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
            pregame: t.Optional(t.String()),
            chat: t.String(),
        }),
        message: t.String()
    })
});
export type ConnectWsSuccessResp = Static<typeof connectWsSuccessRespSchema>;