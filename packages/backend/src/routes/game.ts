import { Elysia, t } from "elysia";
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
  errorRespSchema
} from "@generale/types";

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
  .get("/list", async ({ gameServiceManager }) => {
    // Get active game IDs from the manager
    const activeGameIds = gameServiceManager.getActiveGames();
    const games = activeGameIds
      .map(id => gameServiceManager.getGame(id)?.getGameInfo())
      .filter(Boolean); // Filter out any undefined games

    return { success: true, data: games };
  }, {
    query: t.Object({
      includePrivate: t.Optional(t.String()),
      limit: t.Optional(t.String())
    }),
    response: { 200: listGamesSuccessRespSchema, 500: errorRespSchema },
    detail: { tags: ["Game"], summary: "List active games" }
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
