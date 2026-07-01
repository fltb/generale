# 多游戏平台架构设计

**Goal:** 将当前 Generale 单游戏站点重构为支持多游戏的在线小游戏平台。POC 游戏为 Bomberman（炸弹人），完成后验证架构可扩展性，再接入更多游戏。

**Driver:** 当前框架的游戏同步层（WS domain / StateSync）已经和游戏逻辑解耦，只需将房间、Manager、前端路由从"Generale 专属"改为"游戏自治"，即可仅靠新游戏自身逻辑复刻完整联机游戏。

---

## 1. 架构原则

| 原则 | 说明 |
|------|------|
| 各游戏自治 | 独立路由、独立 Manager、独立 lobby WS domain。每个游戏是站点内一个子应用 |
| 不强制继承 | 不定义接口、不建 Registry、不做多态调度。静态绑定 |
| 共享层极简 | `StateSyncState<T>` + `displaceConnector()` + `useSyncedState()` — 仅此三样可跨游戏复用 |
| 数据库隔离 | 游戏自有表强制前缀 `{gameType}_`（`generale_*`、`bomberman_*`） |
| 前端独立 | 游戏组件完全独立，仅共用底层 UI 组件库（Button、Card 等） |

---

## 2. 共享层（不动或只加小工具）

### Backend — 不动

```
packages/backend/src/
├── plugins/websocket.ts           # WS domain 注册/分发/连接管理
├── game/
│   ├── instance/state-sync.ts     # StateSyncState<T> 泛型增量同步
│   ├── instance/connector-manager.ts  # displaceConnector 防竞态
│   └── chat/GameChatInstance.ts   # 纯消息管道，游戏无关
├── middleware/                      # Auth / session
├── services/                        # User / Profile / Email / userSettings
└── db/                              # 平台级表（users, sessions, profiles, game_results, game_user_settings）
```

### Frontend — 不动

```
packages/frontend/src/shared/
├── hooks/useSyncedState.ts       # 泛型 patch/snapshot 协议
├── hooks/useLobbyRealtime.ts     # lobby WS 订阅
└── ws/manager.ts                 # WS 连接管理 + SubConnector
packages/frontend/src/ui/         # 通用 UI 组件库
```

### Types — 不动

`PlayerId`、`GameId`、`GameStatus`、StateSync 协议类型均在 `packages/types/src/` 保持。

### 可选小工具

两个纯函数，抽不抽均可：

- `shared/subscribers.ts` — `createSubscriberSet()`：lobby WS 订阅者 Map 管理（~15 行）
- `shared/broadcast.ts` — `broadcast()`：遍历订阅者广播事件

---

## 3. Types 包新增

```
packages/types/src/
├── game/game-type.ts              # GameType 字符串常量 ("generale" | "bomberman")
├── game/room/base-room.ts         # BaseRoomState + BasePlayerInfo（无 gameType 字段）
├── settings/global.ts             # GlobalSettings 接口
└── api/game/result.ts             # GameResultRow + GameResultParticipant
```

### BaseRoomState

```ts
export interface BasePlayerInfo {
  id: PlayerId;
  name: string;
  displayName?: string;
  avatarThumbUrl?: string;
  isHost: boolean;
  status: BasePlayerStatus;
}

export interface BaseRoomState {
  gameId: GameId;
  hostId: PlayerId;
  players: BasePlayerInfo[];
  playerLimit: number;
  started: boolean;
  gameConfig: unknown;          // 各游戏自己定义，运行时校验
}

export enum BasePlayerStatus {
  Lobby = "lobby",
  Playing = "playing",
  Disconnected = "disconnected",
  Spectating = "spectating",
}
```

### GameResultRow

```ts
export interface GameResultParticipant {
  playerId: PlayerId;
  rank: number;
  score: number;
  teamId?: TeamId;
}

export interface GameResultRow {
  id: string;
  gameId: GameId;
  gameType: GameType;
  endedAt: number;
  durationMs: number;
  participants: GameResultParticipant[];
  stateSnapshot?: unknown;
}
```

### GlobalSettings

```ts
export interface GlobalSettings {
  locale: "en" | "zh-CN";
  theme: string;
  soundMuted: boolean;
}
```

---

## 4. 数据库新增

```sql
-- 游戏结果记录（所有游戏共用）
CREATE TABLE game_results (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  ended_at INTEGER NOT NULL,
  duration_ms INTEGER,
  participants TEXT NOT NULL,       -- JSON: GameResultParticipant[]
  state_snapshot TEXT               -- JSON: 完整 GameState，回放用
);

-- 游戏内用户设置（按游戏类型隔离）
CREATE TABLE game_user_settings (
  user_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (user_id, game_type, key)
);
```

- 游戏自有表（`generale_custom_maps`、`bomberman_maps`、`bomberman_campaign_progress` 等）定义在各游戏目录的 `db/schema.ts` 中，表名强制前缀 `{gameType}_`。
- drizzle 多个 schema 合并一个全局 drizzle 实例，迁移照常生成。

---

## 5. API 路由拆分

```
/api/auth/*                    # 全局
/api/profile/*                 # 全局
/api/settings/global           # 全局设置
/api/settings/game/:type       # 游戏内设置（按 gameType 区分）
/api/generale/room/create      # Generale 专属
/api/generale/room/list        # Generale 专属
/api/generale/room/connect     # Generale 专属
/api/generale/maps/*           # Generale 专属
/api/bomberman/room/create     # Bomberman 专属
/api/bomberman/room/list       # Bomberman 专属
/api/bomberman/room/connect    # Bomberman 专属
```

body 不需要 `gameType` 字段——路由路径本身就是 discriminator。

---

## 6. 各游戏独立空间

### Backend

```
packages/backend/src/games/{generale, bomberman}/
├── core/              # 游戏核心逻辑（tick、操作处理、胜负判定）
├── instance/          # {Name}Room.ts、{Name}Game.ts
├── service/           # {Name}Service.ts、{Name}Manager.ts
├── db/schema.ts       # 游戏自有表
├── routes.ts          # 注册游戏专属 API 路由（接收 Manager 实例）
└── settings.ts        # gameConfig 默认值 + 校验函数
```

### Frontend

```
packages/frontend/src/routes/games/{generale, bomberman}/
├── hub.tsx            # 房间列表首页
├── room.tsx           # 房间/游戏页面（GameWithSync + ConnectedRoom）
├── game.tsx           # PixiJS 游戏渲染
├── components/        # 游戏专用 UI（设置面板、玩家列表、HUD 等）
└── hooks/             # useRoomSession、useGameSession、useMapInput
```

### 路由

```tsx
// app.tsx
<Route path="/generale" component={GeneraleHub} />
<Route path="/generale/room/:id" component={GeneraleRoomRoute} />
<Route path="/bomberman" component={BombermanHub} />
<Route path="/bomberman/room/:id" component={BombermanRoomRoute} />
```

### 新游戏添加 checklist

从零加一个游戏需要的创建清单：

1. Types: 定义 `{Name}State`、`{Name}Config`、`{Name}Operation` 类型
2. Backend `games/{name}/core/`: 游戏 tick + 操作处理 + 胜负判定
3. Backend `games/{name}/instance/`: Room + Game 类
4. Backend `games/{name}/service/`: Service + Manager
5. Backend `games/{name}/settings.ts`: 默认 gameConfig + 校验
6. Backend `games/{name}/routes.ts`: API 路由注册
7. Backend `index.ts`: `new {Name}Manager(wsManager)`
8. Frontend `routes/games/{name}/`: hub + room + game + components + hooks
9. Frontend `app.tsx`: 加路由

不碰的文件: `plugins/websocket.ts`、`state-sync.ts`、`connector-manager.ts`、所有共享组件。

---

## 7. 迁移步骤（6 步，每步可独立测试回滚）

### 第 1 步：DB 加表

新增 `game_results`、`game_user_settings` 表。新表不影响现有逻辑。

### 第 2 步：Types 包加类型

新增 `game-type.ts`、`base-room.ts`、`settings/global.ts`、`api/game/result.ts`。不改现有文件，编译验证。

### 第 3 步：前端目录迁移

将 `src/components/game/`、`src/components/room/`、`src/components/roomlist/`、`src/game/` 迁移到 `src/routes/games/generale/` 下。`app.tsx` 改 import 路径。`bun run test` 全部通过。

### 第 4 步：后端目录迁移

将 `src/game/core/`、`src/game/instance/RoomInstance.ts`、`GameInstance.ts`、`GameService.ts`、`GameServiceManager.ts` 迁移到 `src/games/generale/` 下。`state-sync.ts`、`connector-manager.ts`、`GameChatInstance.ts` 留在共享层。`interface.d.ts` 删除。`bun run test` 全部通过。

### 第 5 步：拆分 Manager

当前 `GameServiceManager` 改名 `GeneraleManager`。不用继承或抽象——独立实现 CRUD + lobby WS。Bomberman 的 Manager 后续新建时 copy 类似模式。

### 第 6 步：新游戏接入

`games/bomberman/` 新建，前端路由 `/bomberman/*` 新建。从头写代码，不复制 Generale。

**关键原则：每一步后 `bun run build && bun run test` 全部通过才继续下一步。**

---

## 8. Bomberman 游戏设计（POC 样板）

### 8.1 规则

2-4 人在封闭网格竞技场内对战。最后存活者获胜。

**核心操作：**
- 上下左右移动
- 在自己脚下放置炸弹（同场最多 N 颗）

**爆炸：** 引信倒计时到 0 后十字方向爆炸。范围受 blastRadius 控制。炸到其他炸弹 → 连锁起爆。

**墙壁：** 硬墙（不可破坏）+ 软墙（被炸毁，概率掉落道具）。

**道具：** 速度+1、炸弹数+1、爆炸范围+1、踢炸弹、投掷炸弹、穿透炸弹、遥控炸弹、手套。

**倒计时 / 缩圈：** 防止僵局，超时后地图边缘开始缩圈。

**单/多人：** 多人走房间流程。单人走关卡模式，跳过 RoomRoster。

### 8.2 状态模型

```ts
interface BombermanState {
  status: GameStatus;
  tick: number;
  map: BombermanMap;
  players: Record<PlayerId, BombermanPlayer>;
  bombs: Bomb[];
  explosions: Explosion[];
  items: Item[];
  roundTimer?: number;         // 倒计时
  shrinkBoundary?: number;     // 缩圈边界
}

interface BombermanMap { width: number; height: number; tiles: BombermanTile[][]; }
type BombermanTile = { type: "empty" | "hard_wall" | "soft_wall"; item?: ItemType };

interface BombermanPlayer {
  playerId: PlayerId; alive: boolean;
  x: number; y: number;
  bombMax: number; bombActive: number;
  blastRadius: number; speed: number;
  items: ItemType[];
}

interface Bomb { id: string; playerId: PlayerId; x: number; y: number; fuse: number; blastRadius: number; }
interface Explosion { x: number; y: number; ttl: number; }
interface Item { x: number; y: number; type: ItemType; }
```

### 8.3 操作

```ts
type BombermanOperation =
  | { type: "MOVE"; direction: "up" | "down" | "left" | "right" }
  | { type: "PLACE_BOMB" }
  | { type: "KICK_BOMB"; direction: string }
  | { type: "THROW_BOMB" }
  | { type: "DETONATE" }
  | { type: "NOOP" }
```

### 8.4 Tick 模型（实时）

和当前 Generale 一致，定时器驱动。每 tick：

1. 收集所有 player + bot 操作
2. 移动玩家（撞墙/炸弹/其他玩家 → 不动）
3. 放置炸弹（脚下为空、未达上限 → 生成炸弹，fuse = N）
4. 踢/投掷炸弹检测
5. 所有炸弹 fuse -= 1
6. fuse === 0 的炸弹爆炸，十字方向扩展（穿透道具跳过软墙停止），杀玩家，掉落道具
7. 连锁爆炸（A 炸到 B → B 立刻起爆）
8. 爆炸残影 TTL 递减，0 后移除
9. 倒计时递减，归零后缩小边界（边界外玩家死亡）
10. 判断存活人数 → 只剩 1 人 → `GAME_ENDED`

### 8.5 前端渲染

PixiJS 渲染管线，复用 Generale 的 PixiJS 初始化模式：
- 网格渲染：tiles 画硬墙/软墙/空地
- 实体渲染：players（角色精灵）、bombs（炸弹动画）、explosions（爆炸残影）、items（道具图标）
- 无 Fog of War，全图可见
- 移动端：虚拟方向键 + 炸弹按钮

### 8.6 关卡模式

**概念：** 章节关卡制，每章 3-5 关 + Boss。玩家单人对战 Bot。

**关卡配置：**
```ts
interface BombermanLevel {
  levelId: string;
  chapterId: string;
  map: BombermanMap;
  bots: BombermanBotConfig[];
  itemDropTable: ItemWeights;
  stars: {
    1: {};                            // 存活即可
    2: { timeLimit: number };         // N 秒内通关
    3: { timeLimit: number; noDeath: true };  // N 秒且不死
  };
}
```

**Bot 类型：** random、chase、patrol、boss_charge、boss_teleport。Boss 多血条（需被炸 N 次才死）。

**Bot 不是 WS 连接——** 游戏内部直接往操作队列注入：`this.queues[bot.playerId].push(bot.getNextAction(state))`。

**存储：**
```sql
CREATE TABLE bomberman_campaign_progress (
  user_id TEXT PRIMARY KEY,
  unlocked INTEGER,
  stars TEXT,       -- JSON: { "b1_stage1": 3, ... }
  best_times TEXT   -- JSON: { "b1_stage1": 42000, ... }
);
```

**启动方式：** `POST /api/bomberman/room/create` body 带 `mode: "single"` + `levelId`。直接返回 game domain，不走 RoomInstance。

### 8.7 架构影响 vs 经典 Bomberman

| 经典 Bomberman 功能 | 实现方式 | 对架构影响 |
|------|------|:---:|
| 基础操作 + 道具系统 | BombermanGame tick + BombermanPlayer.items | 无 |
| 多地图/关卡 | 文件系统 + `gameConfig.mapId`（DB 只存元数据） | 无 |
| 单人剧情 + Boss | Bot 操作队列注入 + `bomberman_campaign_progress` 表 | 无 |
| 倒计时/缩圈 | BombermanState 额外字段 | 无 |
| 多回合制 (BO3) | BombermanGame 内部子状态机 | 无 |

**所有功能都在 Bomberman 自身代码内消化，共享层零改动。** 这恰好证明组合架构的正确性。

---

## 9. 用户设置两级拆分

| 层 | 存储表 | 键示例 |
|----|--------|--------|
| 全局 | `user_settings` | `locale`, `theme`, `soundMuted` |
| 游戏内 | `game_user_settings` (userId, gameType, key) | `volume`, `keybinds`, `showTips` |

- 全局设置：`user_settings` 表已有，加 typed 校验（白名单键 + validate）。
- 游戏内：`game_user_settings` 新表，联合主键 `(userId, gameType, key)`。各游戏定义自己的 key 集合。

API: `GET/PATCH /api/settings/global` 和 `GET/PATCH /api/settings/game/:type`。

---

## 10. 移动端

- 全局：`index.html` 加 `<meta name="viewport">`。Tailwind 响应式断点（`sm:`、`md:`）逐步加入全局 UI 组件。
- 游戏内：各游戏自己承担触控适配。Bomberman 用虚拟摇杆 + 按钮。复杂策略游戏可标注"不支持移动端"。
- 无 PWA 要求。目标是核心功能在手机上可用。

---

## 11. 排行榜 / 社交（预留，不实现）

- `game_results` 表已存储全部游戏结果。排行榜延时计算即可。
- 好友系统、成就系统不在此次范围。

---

### 8.8 Game Config

```ts
interface BombermanConfig {
  mapId?: string;                  // 地图 ID，不传 = 随机生成
  mapWidth: number;                // 默认 15（自动取奇）
  mapHeight: number;               // 默认 13
  playerLimit: number;             // 2-4，默认 4
  tickRate: number;                // 每秒 tick 数，默认 4
  bombFuse: number;                // 引信 tick 数，默认 12
  bombLimit: number;               // 每人同场最多炸弹，默认 1
  blastRadius: number;             // 初始爆炸范围，默认 1
  roundTimeSec: number;            // 倒计时秒，0 = 无限
  shrinkEnabled: boolean;          // 启用缩圈
  itemDropRate: number;            // 软墙掉落概率 0-1，默认 0.6
  items: ItemType[];               // 启用的道具
  mode: "multi" | "single";        // 多人/单人
  levelId?: string;                // 单人关卡 ID
  rounds?: number;                 // 多回合 BO3/BO5（可选）
}
```

### 8.9 Tick 伪代码

```ts
function tick(state: BombermanState, queues: Record<PlayerId, BombermanOperation[]>): BombermanState {
  const next = clone(state); next.tick++;

  // 1. 处理玩家 + bot 操作（每玩家只取最后一个 op）
  for (const [pid, ops] of Object.entries(queues)) {
    const player = next.players[pid];
    if (!player?.alive) continue;
    const op = ops[ops.length - 1];
    switch (op.type) {
      case "MOVE": movePlayer(player, op.direction, next); break;
      case "PLACE_BOMB": placeBomb(player, next); break;
      case "KICK_BOMB": ... break;
      case "THROW_BOMB": ... break;
      case "DETONATE": detonateRemote(player, next); break;
    }
  }

  // 2. 炸弹计时 → fuse 归零 → 连锁爆炸
  for (const bomb of next.bombs) bomb.fuse--;
  processExplosions(next);              // BFS 收集引燃链，一次批量处理

  // 3. 爆炸残影衰减（TTL 每 tick -1，归零移除）

  // 4. 倒计时 / 缩圈
  if (next.config.roundTimeSec > 0 && --next.roundTimer <= 0) {
    next.roundTimer = next.config.roundTimeSec * next.config.tickRate;
    next.shrinkBoundary--;
    killOutOfBounds(next);
  }

  // 5. 胜负判定 — 存活 ≤ 1 → GameStatus.Ended
  return next;
}
```

核心子函数 `explode(bomb)`：十字方向从 bomb.x/y 出发，blastRadius 步内：
- 杀玩家、引爆其他炸弹（fuse = 0）
- 硬墙停止、软墙破坏（概率掉道具）→ 穿透道具可继续
- 爆炸残影 TTL = 8

### 8.10 渲染方案

PixiJS 画布 + DOM overlay（和 Generale 模式完全一致）：

```
<div class="relative w-full h-screen">
  <Application resizeTo={window}>    {/* PixiJS canvas */}
    <MapLayer />                      {/* 网格背景 + 墙壁 P.Graphics */}
    <EntityLayer />                   {/* 玩家 P.Graphics + 炸弹动态 + 爆炸残影 + 道具 */}
  </Application>
  <Timer />                           {/* DOM overlay: 倒计时 */}
  <ItemBar />                         {/* 道具栏 */}
  <VirtualControls />                 {/* 移动端虚拟摇杆 */}
</div>
```

- 所有实体用 `P.Graphics` 几何图形（无外部精灵依赖，样板阶段即可用，后续升级精灵表时替换组件内部即可）
- 炸弹动画：fuse 每降 2 tick 切换颜色（红 ↔ 深红）
- 爆炸残影：十字方向，透明度从中心向外衰减
- 玩家：色圆形 + 中心小十字指示方向
- Boss：比玩家大一号 + DOM overlay 血条
- HUD 全在 `<Application>` 外面，`absolute` 叠加

### 8.11 输入处理

**键盘：** 持续检测当前按下的键 → 每 tick 生成对应操作入队。

```ts
const KEY_MAP = {
  ArrowUp/ArrowDown/ArrowLeft/ArrowRight/w/s/a/d: MOVE(direction),
  Space: PLACE_BOMB,
  e: DETONATE,
};
// 踢/投掷：拥有对应道具时，走向炸弹自动捡起，按方向键触发
```

**移动端：** `pointer: coarse` 检测设备 → 显示左下角虚拟方向键 + 右下角炸弹按钮。touch 事件映射到操作。纯 DOM overlay。

### 8.12 游戏结束与多回合

**单局制：** `PREGAME → INGAME → ENDED → 回房间`（和 Generale 一样）。

**多回合（可选）：** `BombermanGame` 内部维护 round / totalRounds / scores 字段，每局结束后显示 5 秒积分表，自动重新生成地图进入下一局。总分最高者最终获胜。

**结算画面：** DOM overlay 显示排名 + 积分，`再来一局`（房主专属）和 `返回房间` 按钮。

**game_results 写入：** 单局制结束写一条。多回合制最终结束时写一条，state_snapshot 存最后一局状态。

### 8.13 地图生成

随机生成算法和 Generale 的 `map-gen.ts` 模式相同：

1. 宽高自动补奇 → 全图初始化为空地
2. 边框 + 偶数行列交叉点 = 硬墙（柱状分布确保不出现大片空地）
3. 随机 60% 空地填充软墙（避开出生点 3x3 区域 + 柱状墙相邻格）
4. BFS 验证：所有出生点可达 + 至少 80% 空地可达
5. 不通过 → 重新生成

出生点：2 玩家 = 左上 + 右下；3 玩家 = 左上 + 右上 + 右下；4 玩家 = 四角各一。

**预设地图存储：** 关卡地图用 JSON 文件放在 `games/bomberman/maps/` 下，version control。用户工坊地图存在文件系统 `data/maps/bomberman/{id}.json`，DB 只存元数据（id, name, author_id, width, height, created_at）。未来切对象存储：底层 I/O 从 `readFile()` 改为 `fetch(s3Url)`，表结构不动。

### 8.14 道具掉落系统

加权随机表（总权重 45）：

| 道具 | 效果 | 可叠加？ | 权重 |
|------|------|:---:|:---:|
| BOMB_UP | bombMax +1 | ✅ | 10 |
| FIRE_UP | blastRadius +1 | ✅ | 10 |
| SPEED_UP | speed +1 | ✅ | 10 |
| KICK | 踢炸弹 | ❌ | 4 |
| GLOVE | 投掷炸弹 | ❌ | 3 |
| PUNCH | 弹射炸弹 | ❌ | 3 |
| REMOTE | 遥控引爆 | ❌ | 2 |
| PIERCE | 穿透爆炸 | ❌ | 2 |
| SPIRIT | 死后幽灵减速 | ❌ | 1 |

软墙破坏时 `Math.random() < itemDropRate` → 掉落随机道具。玩家死亡时身上道具全部掉落到死亡格，可被抢夺。

### 8.15 Spectator 模式

无 Fog of War，全图可见。复用 `BaseGameInstance` 的 spectator connector 模式：开 game domain sub → 每 tick 接收全量 state。

### 8.16 前端组件结构

```
routes/games/bomberman/
├── hub.tsx                     # 房间列表 + 创建房间入口
├── room.tsx                    # Room UI + GameWithSync phase 切换
├── game.tsx                    # Application 容器 + HUD overlay
├── components/
│   ├── MapLayer.tsx            # grid + 墙壁 P.Graphics
│   ├── EntityLayer.tsx         # 玩家/炸弹/爆炸/道具
│   ├── HUD.tsx                 # 计时器 + 存活数 + 道具栏
│   ├── VirtualControls.tsx     # 虚拟摇杆 + 按钮
│   ├── Scoreboard.tsx          # 积分表 / 结算画面
│   └── RoomSettings.tsx        # 房主设置面板
├── hooks/
│   ├── useBombermanInput.ts    # keyboard + touch
│   ├── useRoomSession.ts       # room session
│   └── useGameSession.ts       # game session
└── utils/
    ├── mapGen.ts               # map 生成 + BFS
    └── items.ts                # 道具掉落表
```

### 8.17 后端启动嵌入

```ts
// packages/backend/src/index.ts
const wsManager = new WebSocketConnectionManager();
const generaleManager = new GeneraleManager(wsManager);
const bombermanManager = new BombermanManager(wsManager);
app.group("/api/generale", (app) => generaleRoutes(app, generaleManager));
app.group("/api/bomberman", (app) => bombermanRoutes(app, bombermanManager));
```
