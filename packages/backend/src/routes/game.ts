import { Elysia } from "elysia";
import { gameServiceManager } from "../game/service/GameServiceManager";
import { PlayerId, GameId } from "@generale/types";

// Import schemas from your shared types package
import {
  createGameReqSchema,
  gameParamsReqSchema,
  gamePlayerParamsReqSchema,
  createGameSuccessRespSchema,
  gameInfoSuccessRespSchema,
  listGamesSuccessRespSchema,
  connectWsSuccessRespSchema,
  errorRespSchema,
  listGamesQuerySchema
} from "@generale/types/dist/api";

import { GameServiceConfig } from "../game/service/GameService";
import { sessionService } from "../services/sessionService";
import { cookieScheme } from "./user";

export const gameRoutes = new Elysia({ prefix: "/game" })
  // Decorate with the actual singleton manager instance
  .decorate("gameServiceManager", gameServiceManager)
  .post("/create", async ({ body, gameServiceManager, set }) => {
    const gameId = `game_${Date.now()}` as GameId;

    let finalMapSize: any = 'medium';

    if (body.gameSettings) {
      const settings = body.gameSettings;

      // discriminant must be 'type' per new schema
      if (settings.type === "custom") {
        if (!settings.mapSize || typeof settings.mapSize !== "object") {
          set.status = 400;
          return { success: false, error: "custom mode requires numeric mapSize {width, height}" };
        }
        const { width, height } = settings.mapSize;
        finalMapSize = { width: Number(width), height: Number(height) };
      } else {
        finalMapSize = settings.mapSize;
      }
    }

    const gameConfig: GameServiceConfig = {
      gameId,
      roomName: body.roomName,
      mapSize: finalMapSize,
      type: (body.gameSettings?.type as ("custom" | "standard")) ?? "standard",
      maxPlayers: body.gameSettings?.maxPlayers ?? 8
    };

    // create game
    gameServiceManager.createGame(gameConfig);

    return {
      success: true,
      data: { gameId, playerId: "", message: "Game created successfully. Player can now join." }
    };
  }, {
    body: createGameReqSchema,
    response: { 200: createGameSuccessRespSchema, 400: errorRespSchema },
    detail: { tags: ["Game"], summary: "Create a new game" }
  }).get("/info/:gameId", async ({ params, gameServiceManager, set }) => {
    const gameService = gameServiceManager.getGame(params.gameId as GameId);

    if (!gameService) {
      set.status = 404;
      return { error: "Game not found" };
    }

    // Call the instance method
    const gameInfo = gameService.getGameInfo();
    return { success: true, data: gameInfo };
  }, {
    params: gameParamsReqSchema,
    response: { 200: gameInfoSuccessRespSchema, 404: errorRespSchema, 500: errorRespSchema },
    detail: { tags: ["Game"], summary: "Get game information" }
  })
  .get("/list", async ({ query, gameServiceManager }) => {
    // Get active game IDs from the manager
    const activeGameIds = gameServiceManager.getActiveGames();

    // Normalize each game's info into the public summary shape required by listGamesSuccessRespSchema
    let games = activeGameIds
      .map(id => {
        const svc = gameServiceManager.getGame(id);
        if (!svc) return null;

        const info: any = typeof svc.getGameInfo === "function" ? svc.getGameInfo() : {};

        // Attempt to read sensible fallbacks from different possible shapes
        const settings = info.settings ?? info.gameSettings ?? {};
        const playersArray = Array.isArray(info.players) ? info.players : (Array.isArray(info.playerList) ? info.playerList : []);

        // Ensure status is one of the allowed values
        const rawStatus = info.status ?? settings.status ?? "lobby";
        const status = (rawStatus === "lobby" || rawStatus === "in-progress" || rawStatus === "finished")
          ? rawStatus
          : "lobby";

        const playerCount =
          typeof info.playerCount === "number"
            ? info.playerCount
            : (playersArray.length || 0);

        const maxPlayers =
          typeof info.maxPlayers === "number"
            ? info.maxPlayers
            : (typeof settings.maxPlayers === "number" ? settings.maxPlayers : 8);

        return {
          id: info.id ?? id,
          playerCount,
          maxPlayers,
          status,
          hasPassword: Boolean(info.hasPassword ?? settings.hasPassword ?? false),

          // keep these for server-side filtering even though schema doesn't require them in list response
          // they will be filtered on below; they are not returned to client unless you choose to include them
          _raw: info,
          _settings: settings,
          _players: playersArray,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        playerCount: number;
        maxPlayers: number;
        status: "lobby" | "in-progress" | "finished";
        hasPassword: boolean;
        _raw?: any;
        _settings?: any;
        _players?: any[];
      }>;

    // --- 过滤条件 ---
    // note: allow query.roomName to match settings.roomName or info.name
    if (query.roomName) {
      const q = String(query.roomName).toLowerCase();
      // filter by either top-level name or settings.roomName (common places to store the room name)
      games = games.filter(g => {
        const nameCandidates = [
          (g._raw?.name ?? ""),
          (g._settings?.roomName ?? ""),
          (g._raw?.roomName ?? "")
        ];
        return nameCandidates.some(n => typeof n === "string" && n.toLowerCase().includes(q));
      });
    }

    if (query.mode) {
      const q = String(query.mode);
      games = games.filter(g => {
        const modeCandidates = [
          g._raw?.mode,
          g._settings?.gameMode,
          g._raw?.gameMode
        ];
        return modeCandidates.some(m => m === q);
      });
    }

    if (query.map) {
      const q = String(query.map);
      games = games.filter(g => {
        const mapCandidates = [
          g._raw?.map,
          g._settings?.mapSize,
          g._raw?.mapSize
        ];
        return mapCandidates.some(m => m === q);
      });
    }

    if (query.full !== undefined) {
      const wantFull = String(query.full) === "true";
      games = games.filter(g => {
        const isFull = typeof g.playerCount === "number" && typeof g.maxPlayers === "number"
          ? g.playerCount >= g.maxPlayers
          : false;
        return wantFull ? isFull : !isFull;
      });
    }

    // --- offset & limit ---
    const offset = query.offset ? parseInt(String(query.offset), 10) : 0;
    const limit = query.limit ? parseInt(String(query.limit), 10) : 20;

    const total = games.length;
    const sliced = games.slice(offset, offset + limit);

    // Return only the fields required by the list schema
    const responseData = sliced.map(g => ({
      id: String(g.id),
      playerCount: Number(g.playerCount),
      maxPlayers: Number(g.maxPlayers),
      status: g.status,
      hasPassword: Boolean(g.hasPassword)
    }));

    return {
      success: true,
      data: responseData,
      meta: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total
      }
    };
  }, {
    query: listGamesQuerySchema,
    response: { 200: listGamesSuccessRespSchema, 500: errorRespSchema },
    detail: { tags: ["Game"], summary: "List active games with filters & pagination" }
  })
  .get("/connect/:gameId", async ({ params,  gameServiceManager, set, cookie: { sid } }) => {
    const { gameId } = params as { gameId: string };
    // require session
    const session = sid?.value ? sessionService.get(sid.value) : undefined
    if (!session) {
      set.status = 401;
      return { success: false, error: "Not authenticated (missing/expired session)" };
    }

    const playerId = session.userId as PlayerId;

    const gameService = gameServiceManager.getGame(gameId as GameId);
    if (!gameService) {
      set.status = 404;
      return { success: false, error: "Game not found" };
    }

    // service handles authorization/availability
    const result = gameService.prepareConnectionForPlayer(playerId);

    if (!result.success) {
      switch (result.reason) {
        case 'NOT_AUTHORIZED':
          set.status = 403;
          break;
        case 'GAME_UNAVAILABLE':
          set.status = 410;
          break;
        case 'INVALID_STATE':
          set.status = 400;
          break;
        default:
          set.status = 500;
      }
      return { success: false, error: result.message };
    }

    // success: return domains/phase/message, but do NOT expose internal session details
    return {
      success: true,
      data: {
        gameId,
        playerId, // ok to return if you want but front-end should not rely on it
        phase: result.data.phase,
        domains: result.data.domains,
        message: "Ready to connect. Please open the provided domains."
      }
    };
  }, {
    params: gameParamsReqSchema, // update schema in shared types to only include gameId
    response: {
      200: connectWsSuccessRespSchema,
      400: errorRespSchema,
      401: errorRespSchema,
      403: errorRespSchema,
      404: errorRespSchema,
      410: errorRespSchema,
      500: errorRespSchema
    },
    detail: { tags: ["WebSocket"], summary: "Prepare WebSocket connection (session-based player)" },
    cookie: cookieScheme
  });