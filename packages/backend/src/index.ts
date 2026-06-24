import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { gameRoutes } from "./routes/game";
import { userRoutes } from "./routes/user";
import { profileRoutes } from "./routes/profile";
import { authPlugin } from "./middleware/authPlugin";
import { registerDomainHandler, websocketPlugin } from "./plugins/websocket";
import { initEmailServiceWithEnv } from "./services/emailService";
import { ProfileService } from "./services/profileService";
import { sessionService } from "./services/sessionService";
import { runMigrations } from "./db/migrate";

await initEmailServiceWithEnv();
await ProfileService.ensureDefaultAvatars();
await runMigrations();

// session 维护：
//  - 启动期跑一次 prune，清掉上次运行期间堆积的过期记录
//  - 每小时再跑一次。get() 已经做了 lazy 删除，这里只是把"长期没人 touch"
//    的死会话也回收，避免 sessions 表无限增长
{
  try {
    const removed = sessionService.pruneExpired();
    if (removed > 0) console.info(`[session] startup prune removed ${removed} expired sessions`);
  } catch (err) {
    console.warn('[session] startup prune failed', err);
  }
  const SESSION_PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1h
  setInterval(() => {
    try {
      const removed = sessionService.pruneExpired();
      if (removed > 0) console.info(`[session] periodic prune removed ${removed} expired sessions`);
    } catch (err) {
      console.warn('[session] periodic prune failed', err);
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
      .use(websocketPlugin)
      // 这里把 handler 改成 (ctx:any) -> 从 ctx.body 读取 domain
      .post("/test/register-domain", (ctx) => {
        const { domain } = ctx.body as { domain: string };

        // 导入 registerDomainHandler（你的插件文件里应 export 该函数）

        // registerDomainHandler 接受一个函数 (connector) => void
        registerDomainHandler(domain, (connector) => {
          // 在这里为 connector 注册回调（与 SubConnectorImpl 的方法名一致）
          connector.onOpen(() => {
            console.log(`Test domain '${domain}' opened for connection: ${connector.getConnectionId()}`, connector.getContext && connector.getContext());
          });

          // 服务器端收到客户端 message 时触发 onClientMessage 回调
          connector.onClientMessage((payload) => {
            console.log(`Test domain '${domain}' received message from ${connector.getConnectionId()}:`, payload);
            // 直接通过 connector.send 回送（如果你的 SubConnectorImpl 有 send 方法）
            connector.send?.({
              type: 'echo',
              originalPayload: payload,
              timestamp: new Date().toISOString()
            });
          });

          connector.onClose((code?: number, reason?: string) => {
            console.log(`Test domain '${domain}' closed for connection: ${connector.getConnectionId()}`, { code, reason });
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
      .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  )
  .listen({
    port: process.env["PORT"] || 3000,
    hostname: process.env["HOST"] || "0.0.0.0"
  });

console.log(
  `🦊 Generale Game Server is running at ${app.server?.hostname}:${app.server?.port}`
);