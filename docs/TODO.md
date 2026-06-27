# TODO

## 项目的工作流优化

### 代码质量管控

因为我们使用了很多 AI 帮助写代码，所以需要配置 linter 检查代码质量，而不仅仅是 build。

#### Linter: Biome

推荐使用 **Biome**（替代 ESLint + Prettier），原生支持 TS/JSX，速度快，配置简单。

**配置内容：**
- 根目录 `biome.json`，三包共享一份配置
- Preset `recommended` + ~25 条额外 strict 规则（`correctness` / `suspicious` / `style` / `complexity`）
- SolidJS 兼容（JSX 解析，禁用与 SolidJS 冲突的规则如 `react` 相关）
- Formatter：双引号、强制分号、尾逗号、2-space 缩进、120 行宽
- CI 集成：`bunx biome ci --reporter=github` 检查模式
- 测试文件排除（不扫描 `__tests__/` 和 `*.test.ts`）

**完成状态：** 已配置并通过验证。

- [X] 安装 Biome 并创建 `biome.json` 根配置
- [X] 修复初始 lint 错误（格式 + a11y + noExplicitAny + noNonNullAssertion 等）
- [X] 添加 `bun run lint` / `bun run check` / `bun run check:write` 脚本
- [X] 启用严格模式（新增 ~25 条规则，开启 auto-fix）
- [X] 验证：`bun run lint` → 0 errors 0 warnings，全构建通过，162 tests passed
- [ ] 前后端日志系统：替代直接 `console.log`，支持 production/debug 等级（当前 `noConsole` rule 已关闭等待此项目）

### 自动化的功能验证

我们可能需要考虑引入 devops 的一些工具来进行构建和测试。我们希望能够将集成部署方便测试。

考虑到全栈都是自己的，而且使用了很多 AI, 我们甚至可以考虑"沙箱化测试"，即准备一套环境，预先定好的测试数据库去跑后端，然后将前端再允许多个 headless browser 沙箱 session 和脚本自动化操作，去验证我们的行为。

这样暴露一些 API, 可以让 AI 通过临时写功能验证脚本来验证功能，但是需要前端的状态管理的彻底分离和允许捕捉和脚本自动化操作，是一个非常大的工程。这部分完成就可以做到工业级框架。

#### CI/CD

**当前状态：** ✅ CI 已配置

**部署方案：** 本地构建 → Bun 编译为目标平台二进制 → scp 到服务器解压运行
- Elysia 直接 serve 前端静态文件（同端口），SPA fallback 支持刷新
- 服务器无需装 Bun（二进制内嵌运行时）
- 支持 systemd 管理

**已实现：**
- [X] 创建 `.github/workflows/ci.yml` — push/PR 触发，包含：
  - 依赖缓存（bun install --frozen-lockfile）
  - Build @generale/types
  - Biome check（`ci:lint` 模式）
  - Backend typecheck + vitest
  - Frontend build
- [X] 编译打包（仅 main branch push）：`bun build --compile` → tar.gz artifact
- [X] 更新包内容：`server`（二进制）+ `frontend/`（前端静态）+ `migrations/` + `start.sh` + `.env.example`
- [X] 后端 `scripts/start.sh` 启动脚本
- [X] 后端 `package.json` 添加 `start` 命令
- [X] Elysia 静态文件 serve + SPA fallback `"/*"`
- [ ] 部署到服务器：配置 systemd 服务，编写 `deploy.sh`

#### 沙箱化测试

**原则：**

1. **模拟真实用户行为** — 测试脚本通过 Playwright 发出真实的 click、type、键盘输入，操作真实 DOM 元素。不 mock 交互层
2. **验证真实用户可见数据** — 断言目标为 DOM 文本内容、元素可见性、CSS 状态（类名、disabled 属性等），即真实用户眼睛看到的东西
3. **后端完整跑** — 真实的 Elysia 服务器 + WebSocket。仅环境（DB 路径、ENV）由测试控制
4. **前端完整跑** — 真实浏览器中运行完整 SolidJS + PixiJS 应用
5. **PixiJS 地图交互放弃** — headless browser 中 WebGL/Canvas2D 不稳定，无法可靠模拟真实用户的 canvas 点击和拖拽。地图交互走 `window.__test__` 程序化 API 作为 escape hatch

`window.__test__` 的存在边界：**只有 Playwright 无法真实模拟的部分**才走程序化 API：

| 用户行为 | 模拟方式 | 原因 |
|----------|----------|------|
| 登录：填写表单 + 点按钮 | Playwright `page.fill()` + `page.click()` | 纯 DOM |
| 创建房间：填设置 + 点创建 | Playwright | 纯 DOM |
| 加入房间：输房间号/密码 + 点加入 | Playwright | 纯 DOM |
| Ready / Unready 按钮 | Playwright | 纯 DOM |
| 发送聊天消息 | Playwright `page.fill()` + `page.keyboard.press('Enter')` | 纯 DOM |
| 投降 / 离开房间 | Playwright | 纯 DOM |
| 点击地图瓦片 | `window.__test__.clickTile(x, y)` | PixiJS canvas，无法可靠模拟 |
| 地图拖拽/缩放 | `window.__test__` | PixiJS pointer events 不可靠 |
| 快捷键 | Playwright `page.keyboard.press()` | 全局键盘事件 |

| 验证目标 | 断言方式 | 原因 |
|----------|----------|------|
| 玩家列表显示正确人数和名字 | `expect(locator).toHaveText()` | DOM 可见文本 |
| Ready 状态指示 | `expect(locator).toHaveClass()` | CSS 类名变化 |
| 游戏阶段指示器 | `expect(page.getByText(...)).toBeVisible()` | DOM 可见元素 |
| 您的颜色 / 军队数量 | `expect(locator).toHaveText()` | HUD DOM |
| 结算画面 / 获胜者 | `expect(locator).toBeVisible()` | 弹窗/overlay DOM |
| 聊天消息出现在列表中 | `expect(locator).toHaveText()` | DOM 文本 |
| 地图瓦片所有权 / 军队分布 | `window.__test__.getGameState()` | PixiJS canvas 内，DOM 不可见 |
| WebSocket 连接 / 同步状态 | `window.__test__` | 不面向用户，但用于等待时序 |

#### 架构概览

```
┌─────────────────────────────────────────────────┐
│  TestHarness (Node.js 进程)                       │
│                                                   │
│  ┌──────────────────┐   ┌──────────────────┐    │
│  │ Backend Server   │   │ Frontend Dev      │    │
│  │ (Elysia, 真实进程)│   │ (rsbuild, 真实进程)│    │
│  │ port: random      │   │ port: random       │    │
│  │ DB: temp file     │   │ proxy → backend    │    │
│  └────────┬─────────┘   └────────┬─────────┘    │
│           │                      │               │
│  ┌────────▼──────────────────────▼──────────┐   │
│  │  Playwright (多个 browser context)         │   │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  │   │
│  │  │ ctx1  │  │ ctx2  │  │ ctx3  │  │ ctx4  │  │   │
│  │  │玩家1  │  │玩家2  │  │玩家3  │  │玩家4  │  │   │
│  │  └──────┘  └──────┘  └──────┘  └──────┘  │   │
│  │  真实点击  真实点击  真实点击  真实点击     │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  TestGameDSL (AI 可生成的测试脚本)                   │
│    DOM 操作 → Playwright API                       │
│    地图操作 → window.__test__ (escape hatch)        │
│    DOM 断言 → Playwright expect                     │
│    状态断言 → window.__test__ (escape hatch)        │
└─────────────────────────────────────────────────┘
```

#### 技术方案

##### 1. TestHarness — 后端生命周期管理

将 `src/index.ts` 中的启动逻辑与 listen 解耦，导出 `createApp()` 函数：

```typescript
// packages/backend/src/app.ts (新建)
export async function createApp() {
  // 原 index.ts 中所有 setup 逻辑（migrations, email, session...）
  const app = new Elysia()
    .use(...);
  return app;
}

// packages/backend/src/index.ts (精简)
import { createApp } from './app';
const app = await createApp();
app.listen({ port: 3000 });
```

TestHarness 中：
```typescript
// 启动后端，指定测试环境
process.env.DB_FILE_NAME = '/tmp/test-xxx.sqlite';
const app = await createApp();
const server = app.listen({ port: 0 });  // port: 0 = 随机端口
const port = server.port;
```

**关键点：** 不需要 mock SubConnector —— 真实的 WS 协议跑在随机端口上。

##### 2. 前端测试仪表化

通过 URL 参数 `?__test__=1` 开启测试模式。**仅暴露 Playwright 无法触及的内容**：

```typescript
// 在 app.tsx 中，测试模式下注入
window.__test__ = {
  // —— 地图操作（escape hatch：PixiJS canvas 无法可靠点击）——
  clickTile: (x, y) => { /* 直接 dispatch move/attack 操作 */ },
  panMap: (dx, dy) => { /* 移动 viewport */ },
  zoomMap: (scale) => { /* 缩放 */ },
  getViewport: () => ({ x, y, scale }),

  // —— 游戏状态断言（escape hatch：PixiJS 渲染不可见）——
  getGameState: () => structuredClone(gameState),
  getTileOwner: (x, y) => gameState.tiles[x][y].owner,
  getPlayerArmies: () => gameState.players.map(p => ({ id: p.id, army: p.totalArmy })),

  // —— 时序等待（这些状态变化不直接体现在 DOM 上）——
  waitForPhase: (phase) => { /* polling */ },
  waitForWSConnected: () => { /* polling */ },
  waitForTileOwner: (x, y, owner) => { /* polling */ },
};
```

**注意：** 以下操作**不**暴露到 `window.__test__`，因为 Playwright 可以直接做：

| 操作 | Playwright 实现 |
|------|----------------|
| 登录 | `page.getByLabel('Username').fill(name); page.getByRole('button', { name: 'Login' }).click()` |
| 创建/加入房间 | `page.getByRole('button', { name: 'Create Room' }).click()` |
| Ready | `page.getByRole('button', { name: 'Ready' }).click()` |
| 聊天 | `page.getByPlaceholder('Type a message...').fill(msg); page.keyboard.press('Enter')` |
| 投降 | `page.getByRole('button', { name: 'Surrender' }).click()` |

**插入点：** 仅 `useGameSession` 和 `useWebsocket` 需要暴露状态（`window.__test__` 的 escape hatch 部分）。login/room/chat 等 DOM 交互不需要 hooks 参与。

##### 3. Playwright 多 session 管理

```typescript
class TestScenario {
  private backendPort: number;
  private frontendPort: number;
  private browser: Browser;
  private sessions: PlayerSession[] = [];

  async start() {
    this.backendPort = await startBackend({ db: ':memory:' });
    this.frontendPort = await startFrontend({ backendPort: this.backendPort });
    this.browser = await chromium.launch();
  }

  async createSession(user: TestUser): PlayerSession {
    // 每个玩家独立 browser context（隔离 cookie/localStorage）
    const context = await this.browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://localhost:${this.frontendPort}?__test__=1`);
    return new PlayerSession(page, user);
  }
}
```

##### 4. PlayerSession — DOM 优先，仅必要时用 `window.__test__`

```typescript
class PlayerSession {
  constructor(private page: Page, private user: TestUser) {}

  // —— DOM 操作（100% Playwright 模拟真实用户）——

  async login() {
    await this.page.getByLabel('Username').fill(this.user.username);
    await this.page.getByLabel('Password').fill(this.user.password);
    await this.page.getByRole('button', { name: 'Login' }).click();
    // 验证登录成功：用户信息可见
    await expect(this.page.getByText(this.user.username)).toBeVisible();
  }

  async createRoom(opts: { mapSize?: string; password?: string }) {
    await this.page.getByRole('button', { name: 'Create Room' }).click();
    if (opts.mapSize) {
      await this.page.getByLabel('Map Size').selectOption(opts.mapSize);
    }
    if (opts.password) {
      await this.page.getByLabel('Room Password').fill(opts.password);
    }
    await this.page.getByRole('button', { name: 'OK' }).click();
    // 验证：进入房间，玩家列表显示自己
    await expect(this.page.getByTestId('player-list')).toContainText(this.user.username);
  }

  async joinRoom(roomId: string, opts?: { password?: string }) {
    await this.page.getByLabel('Room ID').fill(roomId);
    if (opts?.password) {
      await this.page.getByLabel('Password').fill(opts.password);
    }
    await this.page.getByRole('button', { name: 'Join' }).click();
    // 验证：进入房间
    await expect(this.page.getByTestId('player-list')).toContainText(this.user.username);
  }

  async readyUp() {
    await this.page.getByRole('button', { name: 'Ready' }).click();
    // 验证：按钮变为 Unready
    await expect(this.page.getByRole('button', { name: 'Unready' })).toBeVisible();
  }

  async sendChat(message: string) {
    await this.page.getByPlaceholder(/message/i).fill(message);
    await this.page.keyboard.press('Enter');
    // 验证：消息出现在聊天列表中
    await expect(this.page.getByTestId('chat-messages')).toContainText(message);
  }

  async surrender() {
    await this.page.getByRole('button', { name: 'Surrender' }).click();
    await this.page.getByRole('button', { name: 'Confirm' }).click();
  }

  // —— Escape hatch：PixiJS 无法模拟的部分 ——

  async clickTile(x: number, y: number) {
    await this.page.evaluate(([cx, cy]) => window.__test__.clickTile(cx, cy), [x, y]);
  }

  async getGameState() {
    return this.page.evaluate(() => window.__test__.getGameState());
  }

  async waitForPhase(phase: string, timeout = 30000) {
    await this.page.waitForFunction(
      (p) => window.__test__.waitForPhase(p),
      phase,
      { timeout }
    );
  }

  async waitForTileOwner(x: number, y: number, owner: string, timeout = 10000) {
    await this.page.waitForFunction(
      ([cx, cy, o]) => window.__test__.waitForTileOwner(cx, cy, o),
      [x, y, owner],
      { timeout }
    );
  }

  // —— 混合：DOM 断言（优先）——

  async expectPlayerCount(count: number) {
    await expect(this.page.getByTestId('player-list')
      .locator('[data-player-id]')).toHaveCount(count);
  }

  async expectPhaseDisplay(phaseText: string) {
    await expect(this.page.getByTestId('game-phase')).toHaveText(phaseText);
  }
}
```

##### 5. AI 可生成的测试脚本（示例）

```typescript
const test = new TestScenario();
await test.start();

// 玩家 1：真实登录 → 真实创建房间
const p1 = await test.createSession({ username: 'alice', password: 'pass' });
await p1.login();
await p1.createRoom({ mapSize: 'small' });
// 获取 roomId（需要从页面拿，不是 DOM 可见的，走 escape hatch）
const roomId = await p1.page.evaluate(() => window.__test__.roomId);

// 玩家 2-4：真实登录 → 真实加入
const others = await Promise.all(
  ['bob', 'charlie', 'diana'].map(name =>
    test.createSession({ username: name, password: 'pass' })
  )
);
await Promise.all(others.map(p => p.login()));
await Promise.all(others.map(p => p.joinRoom(roomId)));

// 真实玩家列表验证（DOM 断言）
await p1.expectPlayerCount(4);

// 全部点 Ready 按钮（真实点击）
await Promise.all(test.sessions.map(p => p.readyUp()));
await p1.waitForPhase('playing');

// 验证 HUD 阶段显示（DOM 断言）
await p1.expectPhaseDisplay('Playing');

// 地图操作（escape hatch：PixiJS 不可模拟）
await p1.clickTile(5, 3);
// 等待另一个客户端同步（escape hatch：game state 不在 DOM 中）
await others[0].waitForTileOwner(5, 3, 'alice');

// 验证州状态在所有客户端一致（escape hatch）
for (const p of test.sessions) {
  const state = await p.getGameState();
  expect(state.tiles[5][3].owner).toBe('alice');
}

// 结算验证（DOM 断言：结算弹窗）
await p1.surrender();
await expect(p1.page.getByTestId('game-end-overlay')).toBeVisible();
await expect(p1.page.getByTestId('game-end-overlay')).toContainText('Defeat');

await test.stop();
```

**设计要点：**
- 脚本可读性强——看代码就知道在模拟什么用户行为
- DOM 操作全部走 Playwright 原生 API，具有 `getByRole`/`getByLabel`/`getByPlaceholder` 等语义化选择器
- Escape hatch 仅用于 PixiJS 地图和纯数据验证，代码中出现 `window.__test__` 时明确标注这是 canvas 不可达的部分
- 断言首选 Playwright `expect`（DOM 可见数据），仅游戏内部状态走 `window.__test__`

#### 工时评估

| 组件 | 工时 | 说明 |
|------|------|------|
| 后端 `createApp()` 解耦 | 0.5 天 | 拆分 `index.ts` → `app.ts` + `index.ts` |
| TestHarness 后端启动 | 1 天 | Start backend on random port, seed test DB |
| TestHarness 前端 dev server | 0.5 天 | rsbuild dev with env-controlled proxy |
| 前端 `window.__test__` 仪表化（仅 game hook） | 1-2 天 | 仅 `useGameSession` + `useWebsocket` 暴露状态和 `clickTile` |
| 前端 DOM 元素添加 `data-testid` | 1-2 天 | 为关键 DOM 元素添加选择器钩子 |
| Playwright 基础设施 | 1 天 | Browser launch, context management |
| PlayerSession DOM 操作封装 | 2-3 天 | Login, createRoom, joinRoom, readyUp, chat, surrender |
| `waitFor*` 轮询工具（仅 WS 状态） | 1-2 天 | 仅相位、连接、瓦片所有权等待 |
| TestScenario 多 session 协调 | 1-2 天 | 并行操作 + 事件同步 |
| CI 集成（GitHub Actions） | 1 天 | xvfb runner 或 headed mode |
| 测试种子数据 | 1-2 天 | 预置用户、地图等 fixture |
| **总计** | **11-17 天** | **约 2.5-3.5 周** |

**不包含（Phase 后期可选）：**
- PixiJS 视觉回归测试（截图快照对比）
- 网络条件模拟（延迟/丢包）
- 性能压力测试
- 移动端 E2E

#### 风险点与缓解

| 风险 | 缓解 |
|------|------|
| PixiJS headless 无法渲染 | 明确放弃画布交互模拟，地图操作走 `window.__test__` escape hatch |
| SolidJS 渲染后 DOM 选择器不稳定 | 添加 `data-testid` 属性到关键元素，Playwright 优先用语义选择器（`getByRole`, `getByLabel`），`data-testid` 做备选 |
| WS 连接时序不稳定 | `waitForWSConnected()` 轮询 + 重试；基于状态轮询不依赖固定 timeout |
| rsbuild proxy 转发目标端口 | TestHarness 启动时动态设置 proxy target 为后端随机端口 |
| AI 生成的脚本选择器错误 | 使用 `getByRole`/`getByLabel` 等语义化 selector，Playwright 有自动等待 + 错误截图 |
| 多 session 时序竞态 | `waitFor*` 不依赖固定 timeout，基于状态轮询自动等待 |

#### 待办清单

- [ ] 后端：拆分 `index.ts` → `app.ts` + `index.ts`，导出 `createApp()`
- [ ] 后端：`createApp()` 支持通过 env 控制 DB 路径、port
- [ ] 后端：编写 seed 脚本（创建测试用户）
- [ ] 前端：关键 DOM 元素添加 `data-testid` 属性
- [ ] 前端：`useGameSession` 暴露 `window.__test__`（clickTile, getGameState, waitFor*）
- [ ] 前端：`useWebsocket` 暴露连接状态
- [ ] TestHarness：实现 BackendRunner（启动/停止后端）
- [ ] TestHarness：实现 FrontendRunner（启动/停止 rsbuild dev + 动态 proxy）
- [ ] Playwright：实现 ScenarioRunner（browser + context 管理）
- [ ] Playwright：封装 PlayerSession（DOM-first，仅必要时用 `window.__test__`）
- [ ] Playwright：实现 `waitFor*` 工具函数（基于 `page.waitForFunction`）
- [ ] 脚本示例：编写 2-3 个完整场景验证整个链路可工作
- [ ] CI：GitHub Actions 中集成 Playwright

## 游戏的外观与功能优化

#### 地图工坊

地图工坊功能已经完成，还差一点东西

用户可能会希望直接通过地图工坊找到地图开房间，所以需要把这部分考虑进入：

1. 我想要开一个已经知道了的：搜地图，直接开
2. 我想要选一个有意思的：看一眼，看 preview, 再回去看别的，再看 preview ，最后开

需要让这些路径更方便

第二点，我们可以去偷一些现有的，比如 generals.io 上面有很多地图。我们可以编辑器里面允许用户给一个 url 我们自己去爬然后转换成我们的格式，注意他们有些快是我们没有的。这部分我们应该在寻找到的时候**实现他们**，通过实现他们来拓展我们的游戏。我们希望能比他做到更多

##### 需要让游戏更具有游戏感

目前的问题是这个网页端的风格不够游戏化。

虽然最近的两个 commit 已经把 UI 和逻辑解耦方便定制了，而且也将网页的控件使用了游戏的风格渲染。

但是目前的网站的组件排列还是普通的网站的排列方式，没有特别游戏性的特色 UI 结构设计。

可以考虑把这个游戏的房间和大厅采用更有趣味性的布局，突出游戏化的特色。

目前可以先从游戏的特色入手，在游戏房间内部进行更有意思的布局

- [X] 聊天栏的行为模式优化：聊天栏虽然是在各个阶段都可用的，但是作为一个独立组建，他可能需要进行半透明底部等 UX 优化来确保跨阶段的时候不影响可用性和 UI 完整性。最终采用半透明玻璃态 + 右下角 floating 的独立面板方案，ChatPanel 新增 `transparent` prop 支持跨阶段复用。
- [ ] 游戏资源替换：修改默认头像的风格为像素风。调研了 DiceBear Pixel Art（https://api.dicebear.com/10.x/pixel-art/svg?seed=default，CC0），风格合适。后续可替换 profileService.ts 中的 SVG，或者引入 @dicebear 库直接生成。也需检查其他游戏资源（音效、图标等）是否需要统一到像素/复古风格。
- [X] 地图目前是固定大小的画布，应该改成可以在一块画布上拖动和缩放，方便大地图。已实现：PixiJS stage 容器捕获鼠标拖拽（含水平/垂直双向），滚轮缩放（以光标为中心），键盘 `=`/`-`/`0` 快捷键缩放，底部 HUD 缩放按钮。地图全屏铺满 viewport，顶部栏和玩家列表改为半透明 HUD 覆盖层。
- [ ] 地图画布中 icon 全变成红色了：应该是黑色，因为是基底

## 考虑引入其他游戏模式

这个项目的框架解耦很好，游戏状态同步的框架和游戏逻辑无关。

使用这套框架是可以去做其他游戏的，只要实现后端的游戏逻辑和前端的渲染和输入的逻辑，就可以做一个完整的联机游戏。那么就可以把其他有意思的网页小游戏做出来。也可以将网站直接拓展出来。

##### 联机游戏平台

为此，我们需要设计 2-5 个新的多人联机小游戏，观察他们的共性，将房间列表，房间逻辑，游戏设置与游戏内容进一步解耦，确保可以在不同的小游戏当中尽可能复用更多的逻辑，这样仅需完成游戏本身的逻辑和游戏的设置等逻辑，即可复刻到另一个游戏内。

这样就可以花比较少的精力去拓展成称一个在线小游戏平台。因为用户逻辑已经和游戏逻辑解耦了。

我们甚至可以引入存档等功能，让这些小游戏变成在线的可以持续玩的游戏，甚至引入单人模式。

这部分的内容需要在上方的后端结构优化中也考虑进去，不过重构只需要保证结构能支持后续的可拓展性即可，不需要预留接口。

##### 用户的网站局部|全局设置

目前已经有很多个性化外观了，包括网站的全局外观，按钮音效等，在游戏内部也有音效，这些可以进行用户的自定义管理，让用户自己设置调整。

可以考虑引入一个网站的全局用户的 settings 系统，再在游戏内部做一个游戏 settings 系统。

网站的全局设置可以存储网站主题，外观等全局的设置。

游戏内部设置存储每个玩家的键位，音效等设置，在游戏中设置。因为后续可能会引入多游戏，所以需要将这部分逻辑和网站全局设置拆分。

##### 网站的移动端优化

我们可能需要考虑将这个网站放在手机，平板等设备上面使用，因此需要考虑移动端的优化。

目前可以分成两类移动端优化，一类是网站本体的优化，这种可以直接在编写时顺手完成。

另一类就是游戏内部的优化了。我们需要界定什么属于每个游戏的独有部分，然后在这些部分将移动端优化直接下放，让游戏内部完成移动端优化，或者干脆表明不支持。

如果使用类似小游戏平台的设计，那么进入某个游戏的时候就直接下放了，然后游戏自己会把通用的部分用通用的写法编写，再独立编写移动端的部分。
