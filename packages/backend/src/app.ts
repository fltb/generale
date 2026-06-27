import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runMigrations } from "./db/migrate";
import { authPlugin } from "./middleware/authPlugin";
import { registerDomainHandler, websocketPlugin } from "./plugins/websocket";
import { gameRoutes } from "./routes/game";
import { mapRoutes } from "./routes/map";
import { profileRoutes } from "./routes/profile";
import { userRoutes } from "./routes/user";
import { initEmailServiceWithEnv } from "./services/emailService";
import { ProfileService } from "./services/profileService";
import { sessionService } from "./services/sessionService";

export interface CreateAppOptions {
  skipMigrations?: boolean;
  skipEmailInit?: boolean;
  skipSessionPrune?: boolean;
}

export async function createApp(opts: CreateAppOptions = {}) {
  if (!opts.skipEmailInit) {
    await initEmailServiceWithEnv();
  }
  await ProfileService.ensureDefaultAvatars();
  if (!opts.skipMigrations) {
    await runMigrations();
  }

  // session 维护：
  //  - 启动期跑一次 prune，清掉上次运行期间堆积的过期记录
  //  - 每小时再跑一次。get() 已经做了 lazy 删除，这里只是把"长期没人 touch"
  //    的死会话也回收，避免 sessions 表无限增长
  if (!opts.skipSessionPrune) {
    try {
      const removed = sessionService.pruneExpired();
      if (removed > 0) console.info(`[session] startup prune removed ${removed} expired sessions`);
    } catch (err) {
      console.warn("[session] startup prune failed", err);
    }
    const SESSION_PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1h
    setInterval(() => {
      try {
        const removed = sessionService.pruneExpired();
        if (removed > 0) console.info(`[session] periodic prune removed ${removed} expired sessions`);
      } catch (err) {
        console.warn("[session] periodic prune failed", err);
      }
    }, SESSION_PRUNE_INTERVAL_MS);
  }

  const app = new Elysia()
    .use(cors())
    // 静态托管头像：./public/avatars/<userId>.<ext> -> URL /api/avatars/<userId>.<ext>
    // 走 /api 前缀是为了和已有路由共用同一个 rsbuild 反向代理。
    // 头像 URL 由 ProfileService.saveAvatarBytes 生成，带 ?v=<ms> 缓存破。
    .use(staticPlugin({ assets: "public/avatars", prefix: "/api/avatars" }))
    .use(authPlugin)
    .group("/api", (api) =>
      api
        .use(userRoutes)
        .use(profileRoutes)
        .use(gameRoutes)
        .use(mapRoutes)
        .use(
          swagger({
            documentation: {
              info: {
                title: "Generale Game API",
                version: "1.0.0",
                description: "API for Generale multiplayer strategy game",
              },
              tags: [
                { name: "Game", description: "Game management endpoints" },
                { name: "WebSocket", description: "Real-time game communication" },
              ],
            },
          }),
        )
        .use(websocketPlugin)
        .post("/test/register-domain", (ctx) => {
          const { domain } = ctx.body as { domain: string };

          registerDomainHandler(domain, (connector) => {
            connector.onOpen(() => {
              console.log(
                `Test domain '${domain}' opened for connection: ${connector.getConnectionId()}`,
                connector.getContext?.(),
              );
            });

            connector.onClientMessage((payload) => {
              console.log(`Test domain '${domain}' received message from ${connector.getConnectionId()}:`, payload);
              connector.send?.({
                type: "echo",
                originalPayload: payload,
                timestamp: new Date().toISOString(),
              });
            });

            connector.onClose((code?: number, reason?: string) => {
              console.log(`Test domain '${domain}' closed for connection: ${connector.getConnectionId()}`, {
                code,
                reason,
              });
            });

            connector.onDisconnect(() => {
              console.log(`Test domain '${domain}' disconnected: ${connector.getConnectionId()}`);
            });

            connector.onReconnect(() => {
              console.log(`Test domain '${domain}' reconnected: ${connector.getConnectionId()}`);
            });
          });

          return { success: true, message: `Domain '${domain}' registered successfully` };
        })
        .get("/", () => ({ message: "Generale Game Server", version: "1.0.0" }))
        .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() })),
    )
    // 前端静态文件 serve + SPA fallback（仅 NODE_ENV=production 时有效）
    // 开发模式下 rbuild dev server 自己处理
    .use(staticPlugin({ assets: process.env["FRONTEND_DIST"] || "./frontend", prefix: "/", alwaysStatic: true }))
    .get("/*", ({ set }) => {
      const dist = process.env["FRONTEND_DIST"] || "./frontend";
      const indexHtml = join(dist, "index.html");
      if (existsSync(indexHtml)) {
        set.headers["Content-Type"] = "text/html";
        return Bun.file(indexHtml);
      }
      return new Response("Not Found", { status: 404 });
    });

  return app;
}
