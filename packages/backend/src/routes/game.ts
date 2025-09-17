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

export const gameRoutes = new Elysia({ prefix: "/api/game" })
  // Decorate with the actual singleton manager instance
  .decorate("gameServiceManager", gameServiceManager)
  .post("/create", async ({ body, gameServiceManager }) => {
    const gameId = `game_${Date.now()}` as GameId;

    // Build the config object, ensuring optional properties are handled correctly.
    const gameConfig: any = { gameId };
    if (body.gameSettings?.maxPlayers) {
      gameConfig.maxPlayers = body.gameSettings.maxPlayers;
    }

    // Use the manager to create a new game service instance
    gameServiceManager.createGame(gameConfig);

    // A player ID is not needed on creation, it's generated on join.
    return {
      success: true,
      data: { gameId, playerId: '', message: "Game created successfully. Player can now join." }
    };
  }, {
    body: createGameReqSchema,
    response: { 200: createGameSuccessRespSchema, 400: errorRespSchema },
    detail: { tags: ["Game"], summary: "Create a new game" }
  })
  .get("/info/:gameId", async ({ params, gameServiceManager, set }) => {
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

    // Collect game info objects
    let games = activeGameIds
      .map(id => gameServiceManager.getGame(id)?.getGameInfo())
      .filter(Boolean);

    // --- 过滤条件 ---
    if (query.roomName) {
      games = games.filter(g =>
        g.name?.toLowerCase().includes(query.roomName!.toLowerCase())
      );
    }
    if (query.mode) {
      games = games.filter(g => g.mode === query.mode);
    }
    if (query.map) {
      games = games.filter(g => g.map === query.map);
    }
    if (query.full !== undefined) {
      const wantFull = query.full === "true";
      games = games.filter(g => {
        const isFull = g.players.length >= g.maxPlayers;
        return wantFull ? isFull : !isFull;
      });
    }

    // --- offset & limit ---
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;

    const total = games.length;
    const sliced = games.slice(offset, offset + limit);

    return {
      success: true,
      data: sliced,
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
  .get("/connect/:gameId/:playerId", async ({ params, gameServiceManager, set }) => {
    const { gameId, playerId } = params;
    const gameService = gameServiceManager.getGame(gameId as GameId);

    // 1. Check if the game resource exists at all.
    if (!gameService) {
      set.status = 404;
      return { success: false, error: "Game not found" };
    }

    // 2. Call the new, single service method to handle all logic.
    const result = gameService.prepareConnectionForPlayer(playerId as PlayerId);

    // 3. Handle failure cases based on the reason provided by the service.
    if (!result.success) {
      switch (result.reason) {
        case 'NOT_AUTHORIZED':
          set.status = 403; // Forbidden
          break;
        case 'GAME_UNAVAILABLE':
          set.status = 410; // Gone (more specific than 404)
          break;
        case 'INVALID_STATE':
          set.status = 400; // Bad Request
          break;
        default:
          set.status = 500; // Internal Server Error for unexpected reasons
      }
      return { success: false, error: result.message };
    }

    // 4. Build the success response directly from the service's data.
    return {
      success: true,
      data: {
        gameId,
        playerId,
        // The service now provides the phase and domains
        phase: result.data.phase,
        domains: result.data.domains,
        message: "Ready to connect. Please open the provided domains."
      }
    };
  }, {
    params: gamePlayerParamsReqSchema,
    // IMPORTANT: Update the response schema to include the new status codes and response body
    response: {
      200: connectWsSuccessRespSchema, // This schema must be updated for the new 'data' shape
      400: errorRespSchema,
      403: errorRespSchema,
      404: errorRespSchema,
      410: errorRespSchema, // Add 410 for disbanded/ended games
      500: errorRespSchema
    },
    detail: { tags: ["WebSocket"], summary: "Prepare WebSocket connection" }
  })
