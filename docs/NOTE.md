# Note

回合制在线多人战略游戏。Monorepo（Bun workspace），3 个包。

## 技术栈

| 层 | 技术 |
|----|------|
| Runtime / 包管理 | Bun (workspace) |
| 后端框架 | Elysia.js |
| 数据库 | Bun SQLite + drizzle-orm + drizzle-kit 迁移 |
| 共享类型 | `@generale/types`（Elysia Typebox schema） |
| 前端框架 | SolidJS + @solidjs/router |
| 前端样式 | Tailwind v4 + DaisyUI |
| 游戏画布 | PixiJS v8（通过 solid-pixi 包装） |
| 构建 | rsbuild |
| 状态管理 | TanStack Solid Query + WebSocket 自定义 hooks |
| 网格通讯 | WebSocket，domain 分域（`room-*`, `game-*`, `chat-*`） |

## 架构

### 后端

```
packages/backend/src/
├── index.ts            # 入口: env → migrations → Elysia app
├── db/                 # drizzle client / migrate / schema
├── routes/             # HTTP 路由 (user / game / profile / map)
├── services/           # 业务层 (userService / profileService / sessionService / mapService / emailService)
├── game/
│   ├── core/           # 游戏引擎 (map-gen / game-utils / game-state)
│   ├── instance/       # 实例管理 (RoomInstance / GameInstance / GameChatInstance)
│   └── service/        # GameService (实例生命周期 + WS domain 分发)
├── plugins/            # WebSocket 插件
├── middleware/          # auth (session-based)
└── ws/                 # WS 连接管理器
```

**游戏生命周期：**
1. `RoomInstance` — 房间阶段（玩家进出/准备/设置），常驻挂载
2. `GameInstance` — 游戏中，按需创建/销毁
3. `GameChatInstance` — 聊天，贯穿全阶段，依赖 `IRoomRoster` 接口鉴权

`RoomInstance` 在游戏阶段 **不卸载**（隐藏而非销毁），避免 WS 重连开销。`GameInstance` 游戏结束后销毁，`RoomInstance.resume()` 恢复房间状态。

**状态同步：** 客户端通过 `SyncedPreGameClientActionTypes` / `SyncedGameClientActionTypes` 枚举发送 WS action，后端 `Room/Game/ChatInstance.handleClientAction()` 处理并 `broadcastState()`。

**密码保护：** `RoomInstance` 内私有字段，不广播。`canJoin` 门控。Chat 跳过密码校验。

### 前端

```
packages/frontend/src/
├── app.tsx             # 路由 + AuthProvider + WebSocketProvider
├── routes/             # 各路由页面 (room / profile / maps / map-editor / map-preview)
├── components/         # 共享组件 (Avatar / ChatPanel / MapRender / MapTile / room/ / game/ / map-editor/)
├── game/               # 游戏逻辑 hooks (useRoomSession / useGameSession / useChatSession / selectors / render/)
├── hooks/              # 底层 hooks (useAuth / useWebSocket / useChat / useSyncedState)
├── ui/                 # UI 原语 (Button / Card / Panel / Input / Select / Modal / Badge / Alert / Collapse / Tabs / Checkbox / Label / ...)
├── api/                # API 客户端 (base.ts + authApi / gameApi / mapApi)
├── ws/                 # WebSocket 连接管理
└── utils/              # 工具函数 (playerColor / faIconGraphic / playerDisplay)
```

**组件约定：**
- 所有 UI 组件使用 `~/ui` 原语，不直接使用 DaisyUI 类名
- 游戏逻辑集中在 `~/hooks/` 和 `~/game/`，与 UI 分离
- `~/*` alias → `src/*`（tsconfig paths + rsbuild）
- `solid-pixi` 包装 PixiJS v8 —— `P.Container` / `P.Graphics` / `P.Text` / `P.Application`
- `pixel-border` 是自定义 CSS 类，用于像素游戏风边框
- FontAwesome 图标通过 `~/utils/faIconGraphic` 渲染为 PixiJS `GraphicsContext`

**WebSocket 域：**

| Domain | 管理组件 | 生命周期 |
|--------|---------|----------|
| `room-*` | `useRoomSession` → `RoomInstance` | 加入房间到离开 |
| `game-*` | `useGameSession` → `GameInstance` | 游戏开始到结束 |
| `chat-*` | `useChatSession` → `GameChatInstance` | 贯穿房间+游戏 |

`RoomWithSync` 和 `GameWithSync` **都保持挂载**（在路由中），通过 `display: none` 切换可见性，避免 WS 重连。

## 已实现功能

### 用户系统
- 注册 / 登录 / 邮件验证 / 密码重置 / 邮箱更改
- Session-based 鉴权（cookie）
- Profile 页面（头像上传 / displayName / bio / 用户名更改）
- 公开 Profile 查看
- **username**：唯一，7 天冷却期可更改（PATCH /me/username）。用于登录标识
- **displayName**：允许重名。展示时自动 `displayName#username` 消歧义
- 默认头像：16×16 像素风战士 SVG（TODO: 后续可替换为 DiceBear 像素风 API）

### 房间系统
- 创建房间：Standard（快速，仅地图大小） / Custom（全设置开放）
- 房间密码保护（端到端：创建时设置，加入时门控，前端 sessionStorage 缓存）
- 房间列表（搜索/筛选/排序，WS 实时推送）
- 玩家管理：准备/取消准备、踢出、房主转移、队伍切换（个人战/组队战）
- 房主断线 30s 回收计时器 → 自动转移或移除
- 房间密码错误 → sessionStorage 清除 + reload 重试

### 游戏系统
- 地图生成（随机 / 导入自定义地图）
- 六大 tile 类型：Plain / Throne / Barracks / Mountain / Swamp / Fog
- 地块增长率系统（可配置 gameSettings.tileGrow）
- 操作队列（移动指令 + 光标导航）
- 游戏状态 tick 循环同步
- 游戏结束结算 + 胜利动画 + 返回房间
- 观战模式（`enterSpectate` / `leaveSpectate`）
- 队友视野共享

### 聊天系统
- 独立 chat domain，贯穿房间+游戏
- 小队聊天（`/team` 前缀）
- 乐观发送 + 服务端确认
- 消息历史拉取
- 半透明玻璃态 floating panel

### 自定义地图
- **编辑器**（PixiJS 画布）：画笔绘制（5 种地形）、pan/zoom、undo/redo、保存草稿/发布
- **画廊**（公开 / 我的地图）：缩略图、搜索、排序、Fork
- **预览页**（只读 PixiJS 查看）
- **游戏集成**：创建房间可选自定义地图，地图中王座预置位置分配给玩家
- **草稿系统**：已发布地图可单独保存草稿（`.draft.json`），不影响发布版；发布时覆盖并删除草稿
- **缩略图**：发布时离屏 PixiJS 渲染生成完整地图缩略图，或手动上传封面
- 地图文件存储：`./public/maps/<id>.json`（tiles）+ `<id>.png`（缩略图）；DB 仅存元数据

### 地图画布
- PixiJS 全屏地图 + DOM HUD 覆盖层（半透明顶部栏 / 右侧玩家面板 / 底部缩放按钮）
- 鼠标拖拽平移（3px 阈值）+ 滚轮缩放（光标中心）+ 键盘快捷键（`=`/`-`/`0`）
- `ViewportApi` 暴露给外部按钮

### 玩家颜色
- 16 色面板（`PlayerColor` 枚举）
- 房间内玩家可自选颜色（4×4 网格选择器，已用颜色灰显）
- 仅房主禁止自己更换 ready 状态

### 声音
- 像素按钮点击音效（`sfx.click()` via WebAudio oscillator）
- 静音开关

## 数据库迁移

使用 drizzle-kit 官方流程：
1. 修改 `packages/backend/src/db/schema.ts`
2. `npx drizzle-kit generate` → 生成增量 SQL 文件
3. 提交新文件到 `drizzle/`
4. `runMigrations()` 启动时自动 apply（幂等，通过 `__drizzle_migrations` 表追踪）

`sealExistingMigrations()` 处理预存 DB：比较 `__drizzle_migrations` 表的 SHA-256 hash 与 `_journal.json` 条目，自动标记已有表的迁移为已应用。

## 注意事项

- **不配置 lint/format。** PR 只需构建 + typecheck + 测试通过。
- **`@generale/types` 必须先构建**（`cd packages/types && npx tsc -p tsconfig.json`）。后端和前端都依赖 `workspace:*`。
- **前端导入类型路径：** `@generale/types/dist/api`（注意 `/dist/api` 子路径）。
- **Commit 信息必须用英文。**
- **不自动 commit/push。** 展示 staged diff 后等用户确认。
- **测试文件可能有陈旧类型错误** — `__tests__/` 目录下的错误如与改动无关可忽略。
- **后端测试：** `npx vitest`（游戏场景测试最重要）
- **前端测试：** 多为手动 UI 测试（SolidJS + PixiJS）
- **MapRender 必须在 mount/cleanup 时调用 `destroyGcCache`（现为 `iconFactory.destroy()`）** 防止跨游戏会话的 PixiJS GraphicsContext 污染。
- **`resizeTo={window}`** 令 PixiJS canvas 铺满 viewport；HUD 覆盖层用 DOM `absolute` 定位。
