import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { gameRoutes } from "./routes/game";
import { websocketPlugin } from "./plugins/websocket";
import { GameService } from "./game/service/GameService";

// Initialize GameService with default config
const gameService = new GameService({
  gameId: "lobby", // Added required gameId
  maxPlayers: 8,
  gameTimeout: 30 * 60 * 1000, // 30 minutes
  heartbeatInterval: 30 * 1000, // 30 seconds
}); 

const app = new Elysia()
  .use(cors())
  .use(swagger({
    documentation: {
      info: {
        title: 'Generale Game API',
        version: '1.0.0',
        description: 'API for Generale multiplayer strategy game'
      },
      tags: [
        { name: 'Game', description: 'Game management endpoints' },
        { name: 'WebSocket', description: 'Real-time game communication' }
      ]
    }
  }))
  .decorate('gameService', gameService)
  .use(websocketPlugin)
  .use(gameRoutes)
  .get("/", () => ({ message: "Generale Game Server", version: "1.0.0" }))
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  
  // Test endpoint to register domain handlers
  .post("/test/register-domain", ({ body }: { body: { domain: string } }) => {
    const { domain } = body;
    
    // Import the registerDomainHandler function
    const { registerDomainHandler } = require('./plugins/websocket');
    
    // Register a test domain handler
    registerDomainHandler(domain, {
      onOpen: (connectionId: string, config: any) => {
        console.log(`Test domain '${domain}' opened for connection: ${connectionId}`, config);
      },
      onMessage: (connectionId: string, payload: any) => {
        console.log(`Test domain '${domain}' received message from ${connectionId}:`, payload);
        // Echo the message back
        return {
          type: 'echo',
          originalPayload: payload,
          timestamp: new Date().toISOString()
        };
      },
      onClose: (connectionId: string, code?: number, reason?: string) => {
        console.log(`Test domain '${domain}' closed for connection: ${connectionId}`, { code, reason });
      },
      onDisconnect: (connectionId: string) => {
        console.log(`Test domain '${domain}' disconnected: ${connectionId}`);
      },
      onReconnect: (connectionId: string) => {
        console.log(`Test domain '${domain}' reconnected: ${connectionId}`);
      }
    });
    
    return { success: true, message: `Domain '${domain}' registered successfully` };
  })
  
  .listen({
    port: process.env["PORT"] || 3000,
    hostname: process.env["HOST"] || "0.0.0.0"
  });

console.log(
  `🦊 Generale Game Server is running at ${app.server?.hostname}:${app.server?.port}`
);
