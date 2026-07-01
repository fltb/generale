import { type Elysia, t } from "elysia";
import { BombermanManager } from "./service/BombermanManager";
import { authPlugin } from "../../middleware/authPlugin";

export const bombermanManager = new BombermanManager();

export function bombermanRoutes(app: Elysia) {
  return app
    .use(authPlugin)
    .post(
      "/room/create",
      async ({ body }) => {
        const service = bombermanManager.createGame(body.roomName);
        return { success: true, data: { gameId: service.gameId } };
      },
      { body: t.Object({ roomName: t.String(), password: t.Optional(t.String()) }) },
    )
    .get("/room/list", async () => {
      return { success: true, data: [] };
    })
    .get("/room/connect/:gameId", async ({ params }) => {
      const service = bombermanManager.getGame(params.gameId);
      if (!service) return { success: false, message: "Game not found" };
      return {
        success: true,
        data: {
          gameId: params.gameId,
          playerId: "",
          phase: "pregame",
          domains: { primary: `room-${params.gameId}`, chat: `chat-${params.gameId}` },
        },
      };
    });
}
