import { Elysia, t } from "elysia";
import { GameService } from "../game/service/GameService";
import { PlayerId, GameId } from "@generale/types";

// Request/Response types
const CreateGameRequest = t.Object({
  playerName: t.String({ minLength: 1, maxLength: 50 }),
  gameSettings: t.Optional(t.Object({
    maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 8 })),
    mapSize: t.Optional(t.Union([t.Literal("small"), t.Literal("medium"), t.Literal("large")])),
    gameMode: t.Optional(t.Union([t.Literal("classic"), t.Literal("blitz"), t.Literal("custom")]))
  }))
});

const JoinGameRequest = t.Object({
  gameId: t.String(),
  playerName: t.String({ minLength: 1, maxLength: 50 }),
  password: t.Optional(t.String())
});



export const gameRoutes = new Elysia({ prefix: "/api/game" })
  .decorate("gameService", {} as GameService) // Will be overridden by main app
  
  // Create a new game
  .post("/create", async ({ body, gameService, set }) => {
    try {
      const playerId = generatePlayerId();
      const gameId = await gameService.createGameForAPI(playerId, body.playerName, body.gameSettings);
      
      return {
        success: true,
        data: {
          gameId,
          playerId,
          message: "Game created successfully"
        }
      };
    } catch (error) {
      set.status = 400;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create game"
      };
    }
  }, {
    body: CreateGameRequest,
    detail: {
      tags: ["Game"],
      summary: "Create a new game",
      description: "Creates a new game session and returns game ID and player ID"
    }
  })
  
  // Join an existing game
  .post("/join", async ({ body, gameService, set }) => {
    try {
      const playerId = generatePlayerId();
      const success = await gameService.joinGameForAPI(body.gameId as GameId, playerId, body.playerName, body.password);
      
      if (!success) {
        set.status = 400;
        return {
          success: false,
          error: "Failed to join game. Game may be full, not found, or password incorrect."
        };
      }
      
      return {
        success: true,
        data: {
          gameId: body.gameId,
          playerId,
          message: "Joined game successfully"
        }
      };
    } catch (error) {
      set.status = 400;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to join game"
      };
    }
  }, {
    body: JoinGameRequest,
    detail: {
      tags: ["Game"],
      summary: "Join an existing game",
      description: "Join an existing game session with game ID"
    }
  })
  
  // Get game info
  .get("/info/:gameId", async ({ params, gameService, set }) => {
    try {
      const gameInfo = await gameService.getGameInfo(params.gameId as GameId);
      
      if (!gameInfo) {
        set.status = 404;
        return {
          success: false,
          error: "Game not found"
        };
      }
      
      return {
        success: true,
        data: gameInfo
      };
    } catch (error) {
      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get game info"
      };
    }
  }, {
    params: t.Object({
      gameId: t.String()
    }),
    detail: {
      tags: ["Game"],
      summary: "Get game information",
      description: "Retrieve information about a specific game"
    }
  })
  
  // List active games
  .get("/list", async ({ gameService, query }) => {
    try {
      const games = await gameService.listActiveGames({
        includePrivate: query.includePrivate === "true",
        limit: query.limit ? parseInt(query.limit) : 20
      });
      
      return {
        success: true,
        data: games
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list games"
      };
    }
  }, {
    query: t.Optional(t.Object({
      includePrivate: t.Optional(t.String()),
      limit: t.Optional(t.String())
    })),
    detail: {
      tags: ["Game"],
      summary: "List active games",
      description: "Get a list of active games that can be joined"
    }
  })
  
  // Connect to WebSocket for a specific game
  .get("/connect/:gameId/:playerId", async ({ params, gameService, set }) => {
    try {
      const { gameId, playerId } = params;
      
      // Validate that player is part of this game
      const canConnect = await gameService.canPlayerConnect(gameId as GameId, playerId as PlayerId);
      
      if (!canConnect) {
        set.status = 403;
        return {
          success: false,
          error: "Player not authorized to connect to this game"
        };
      }
      
      return {
        success: true,
        data: {
          websocketUrl: `/ws`,
          gameId,
          playerId,
          message: "Ready to connect to WebSocket"
        }
      };
    } catch (error) {
      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to prepare connection"
      };
    }
  }, {
    params: t.Object({
      gameId: t.String(),
      playerId: t.String()
    }),
    detail: {
      tags: ["WebSocket"],
      summary: "Prepare WebSocket connection",
      description: "Validate and prepare WebSocket connection for a player in a game"
    }
  })
  
  // Leave game
  .post("/leave", async ({ body, gameService, set }) => {
    try {
      const { gameId, playerId } = body;
      const success = await gameService.leaveGame(gameId as GameId, playerId as PlayerId);
      
      if (!success) {
        set.status = 400;
        return {
          success: false,
          error: "Failed to leave game"
        };
      }
      
      return {
        success: true,
        data: {
          message: "Left game successfully"
        }
      };
    } catch (error) {
      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to leave game"
      };
    }
  }, {
    body: t.Object({
      gameId: t.String(),
      playerId: t.String()
    }),
    detail: {
      tags: ["Game"],
      summary: "Leave game",
      description: "Remove player from game session"
    }
  });

// Helper function to generate unique player IDs
function generatePlayerId(): PlayerId {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as PlayerId;
}
