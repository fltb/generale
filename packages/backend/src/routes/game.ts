import type { GameId, PlayerId } from "@generale/types";
// Import schemas from your shared types package
import {
  connectWsSuccessRespSchema,
  createGameReqSchema,
  createGameSuccessRespSchema,
  errorRespSchema,
  type GameInfoSuccessResp,
  gameInfoSuccessRespSchema,
  gameParamsReqSchema,
  listGamesQuerySchema,
  listGamesSuccessRespSchema,
} from "@generale/types/dist/api";
import { Elysia } from "elysia";
import type { GameServiceConfig } from "../game/service/GameService";
import { gameServiceManager } from "../game/service/GameServiceManager";
import { sessionService } from "../services/sessionService";
import { cookieScheme } from "./user";
import { applyGameFilters, applyGameSort, paginateGames } from "./utils/gameListFilter";
import { tForRequest } from "../services/i18n";

export const gameRoutes = new Elysia({ prefix: "/game" })
  // Decorate with the actual singleton manager instance
  .decorate("gameServiceManager", gameServiceManager)
  .post(
    "/create",
    ({ body, gameServiceManager, set, cookie: { sid }, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const session = sid?.value ? sessionService.get(sid.value) : undefined;
      if (!session) {
        set.status = 401;
        return { success: false, error: t("Please log in first") };
      }
      const gameId = `game_${Date.now()}` as GameId;

      let finalMapSize: GameServiceConfig["mapSize"] = "medium";

      if (body.gameSettings) {
        const settings = body.gameSettings;

        // discriminant must be 'type' per new schema
        if (settings.type === "custom") {
          if (settings.mapSize && typeof settings.mapSize === "object") {
            const { width, height } = settings.mapSize;
            finalMapSize = { width: Number(width), height: Number(height) };
          } else if (settings.customMapId) {
            // custom map selected, dimensions determined by the map
            finalMapSize = { width: 20, height: 20 }; // placeholder, GameService will override from map data
          } else {
            set.status = 400;
            return { success: false, error: t("custom mode requires numeric mapSize or customMapId") };
          }
        } else {
          finalMapSize = (settings.mapSize ?? "medium") as "small" | "medium" | "large";
        }
      }

      const gameConfig = {
        gameId,
        roomName: body.roomName,
        mapSize: finalMapSize,
        type: (body.gameSettings?.type as "custom" | "standard") ?? "standard",
        maxPlayers: body.gameSettings?.maxPlayers ?? 8,
        teamMode: body.gameSettings?.teamMode ?? "ffa",
        ...(body.password ? { password: body.password } : {}),
        creatorId: session.userId,
        ...(body.gameSettings?.type === "custom" && body.gameSettings.customMapId
          ? { customMapId: body.gameSettings.customMapId }
          : {}),
      } as unknown as GameServiceConfig;

      // create game
      gameServiceManager.createGame(gameConfig);

      return {
        success: true,
        data: { gameId, playerId: "", message: t("Game created successfully") },
      };
    },
    {
      body: createGameReqSchema,
      cookie: cookieScheme,
      response: { 200: createGameSuccessRespSchema, 400: errorRespSchema },
      detail: { tags: ["Game"], summary: "Create a new game" },
    },
  )
  .get(
    "/info/:gameId",
    ({ params, gameServiceManager, set, request }) => {
      const t = tForRequest({ request });
      const gameService = gameServiceManager.getGame(params.gameId as GameId);

      if (!gameService) {
        set.status = 404;
        return { error: t("Game not found") };
      }

      // Call the instance method
      const gameInfo = gameService.getGameInfo();
      return { success: true, data: gameInfo };
    },
    {
      params: gameParamsReqSchema,
      response: { 200: gameInfoSuccessRespSchema, 404: errorRespSchema, 500: errorRespSchema },
      detail: { tags: ["Game"], summary: "Get game information" },
    },
  )
  .get(
    "/list",
    ({ query, gameServiceManager }) => {
      // Acquire active games and normalize to unified summary objects
      const games: GameInfoSuccessResp["data"][] = gameServiceManager
        .getActiveGames()
        .map((id) => gameServiceManager.getGame(id)?.getGameInfo())
        .filter((game) => !!game);

      let result = applyGameFilters(games, query);

      result = applyGameSort(result, query);

      const page = paginateGames(result, query);

      return {
        success: true,
        data: page.items,
        meta: {
          total: page.total,
          offset: page.offset,
          limit: page.limit,
          hasMore: page.hasMore,
        },
      };
    },
    {
      query: listGamesQuerySchema,
      response: { 200: listGamesSuccessRespSchema, 500: errorRespSchema },
      detail: { tags: ["Game"], summary: "List active games with filters & pagination" },
    },
  )
  .get(
    "/connect/:gameId",
    ({ params, gameServiceManager, set, cookie: { sid }, request }) => {
      const t = tForRequest({ cookie: { sid }, request });
      const { gameId } = params as { gameId: string };
      const session = sid?.value ? sessionService.get(sid.value) : undefined;
      if (!session) {
        set.status = 401;
        return { success: false, error: t("Not authenticated") };
      }

      const playerId = session.userId as PlayerId;

      const gameService = gameServiceManager.getGame(gameId as GameId);
      if (!gameService) {
        set.status = 404;
        return { success: false, error: t("Game not found") };
      }

      const result = gameService.prepareConnectionForPlayer(playerId);

      if (!result.success) {
        switch (result.reason) {
          case "NOT_AUTHORIZED":
            set.status = 403;
            break;
          case "GAME_UNAVAILABLE":
            set.status = 410;
            break;
          case "INVALID_STATE":
            set.status = 400;
            break;
          default:
            set.status = 500;
        }
        return { success: false, error: result.message };
      }

      return {
        success: true,
        data: {
          gameId,
          playerId,
          phase: result.data.phase,
          domains: result.data.domains,
          hasPassword: result.data.hasPassword,
          message: t("Ready to connect"),
        },
      };
    },
    {
      params: gameParamsReqSchema, // update schema in shared types to only include gameId
      response: {
        200: connectWsSuccessRespSchema,
        400: errorRespSchema,
        401: errorRespSchema,
        403: errorRespSchema,
        404: errorRespSchema,
        410: errorRespSchema,
        500: errorRespSchema,
      },
      detail: { tags: ["WebSocket"], summary: "Prepare WebSocket connection (session-based player)" },
      cookie: cookieScheme,
    },
  );
