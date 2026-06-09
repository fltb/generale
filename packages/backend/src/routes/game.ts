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
  listGamesQuerySchema,
  GameInfoSuccessResp
} from "@generale/types/dist/api";

import { GameServiceConfig } from "../game/service/GameService";
import { sessionService } from "../services/sessionService";
import { cookieScheme } from "./user";
import { applyGameFilters, applyGameSort, paginateGames } from "./utils/gameListFilter";

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
      maxPlayers: body.gameSettings?.maxPlayers ?? 8,
      teamMode: body.gameSettings?.teamMode ?? "ffa",
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
    // Acquire active games and normalize to unified summary objects
    const games: GameInfoSuccessResp["data"][] = gameServiceManager
      .getActiveGames()
      .map(id => gameServiceManager.getGame(id)?.getGameInfo())
      .filter(game => !!game);

    let result = applyGameFilters(games, query)

    result = applyGameSort(result, query)

    const page = paginateGames(result, query)

    return {
      success: true,
      data: page.items,
      meta: {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore
      }
    }
  }, {
    query: listGamesQuerySchema,
    response: { 200: listGamesSuccessRespSchema, 500: errorRespSchema },
    detail: { tags: ["Game"], summary: "List active games with filters & pagination" }
  })
  .get("/connect/:gameId", async ({ params, gameServiceManager, set, cookie: { sid } }) => {
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