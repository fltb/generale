# General E

> **正在开发中 / Under Active Development**

一个受 [Generals.io](https://generals.io) 启发的多人联机回合制领土策略游戏。采用 monorepo 架构，前后端均使用 TypeScript 编写。

A multiplayer turn-based territorial strategy game inspired by Generals.io. Built as a monorepo with TypeScript across the full stack.

---

## 目录

- [技术栈 / Tech Stack](#技术栈--tech-stack)
- [项目结构 / Project Structure](#项目结构--project-structure)
- [架构概览 / Architecture](#架构概览--architecture)
- [功能特性 / Features](#功能特性--features)
- [快速开始 / Quick Start](#快速开始--quick-start)
- [开发指南 / Development Guide](#开发指南--development-guide)
- [游戏设计 / Game Design](#游戏设计--game-design)
- [API 文档 / API Documentation](#api-文档--api-documentation)
- [部署 / Deployment](#部署--deployment)
- [贡献 / Contributing](#贡献--contributing)
- [许可证 / License](#许可证--license)

---

## 技术栈 / Tech Stack

| 层 Layer | 技术 Technology | 说明 Notes |
|-----------|----------------|------------|
| **Runtime** | [Bun](https://bun.sh) | JavaScript/TypeScript 全栈运行时，包管理，monorepo 工作区 |
| **前端 Frontend** | [SolidJS](https://solidjs.com) | 响应式 UI 框架，无虚拟 DOM |
| **前端构建 Build** | [Rsbuild](https://rsbuild.dev) | 基于 Rspack 的高性能构建工具 |
| **前端样式 Styling** | [Tailwind CSS v4](https://tailwindcss.com) + [DaisyUI v5](https://daisyui.com) | 原子化 CSS + 像素风主题（fantasy16） |
| **游戏渲染 Render** | [PixiJS v8](https://pixijs.com) + solid-pixi | 2D WebGL 地图渲染 |
| **前端路由 Router** | [@solidjs/router](https://docs.solidjs.com/solid-router) | SolidJS 官方路由 |
| **前端状态 State** | [TanStack Solid Query v5](https://tanstack.com/query) | 服务端状态缓存与同步 |
| **后端 Backend** | [Elysia.js](https://elysiajs.com) | 高性能 Bun 原生 HTTP 框架 |
| **后端文档 API Docs** | [Swagger](https://swagger.io) (via @elysiajs/swagger) | 自动生成 API 文档 |
| **数据库 Database** | SQLite (via [Drizzle ORM](https://orm.drizzle.team)) | 轻量嵌入式数据库 |
| **邮件 Email** | [Nodemailer](https://nodemailer.com) | SMTP 邮件发送 |
| **图片处理 Image** | [Sharp](https://sharp.pixelplumbing.com) | 头像缩略图生成 |
| **测试 Testing** | [Vitest](https://vitest.dev) | 后端单元测试 |
| **共享类型 Shared Types** | `@generale/types` | 前后端共享 TypeScript 类型定义 |
| **许可证 License** | AGPL-3.0 | GNU Affero General Public License v3 |

---

## 项目结构 / Project Structure

```
generale/
├── packages/
│   ├── frontend/                # SolidJS 前端 SPA
│   │   ├── src/
│   │   │   ├── api/             # HTTP API 客户端
│   │   │   ├── app.tsx          # 根组件（Provider、路由）
│   │   │   ├── components/      # 业务组件
│   │   │   ├── game/            # 游戏业务逻辑 hooks
│   │   │   ├── hooks/           # 通用 hooks
│   │   │   ├── routes/          # 页面路由组件
│   │   │   ├── ui/              # UI 原语组件库
│   │   │   ├── utils/           # 工具函数
│   │   │   └── ws/              # WebSocket 客户端管理
│   │   ├── public/
│   │   ├── rsbuild.config.ts
│   │   ├── postcss.config.mjs
│   │   └── package.json
│   │
│   ├── backend/                 # Elysia.js 后端服务
│   │   ├── src/
│   │   │   ├── db/              # 数据库客户端与 Schema (Drizzle)
│   │   │   ├── game/
│   │   │   │   ├── core/        # 游戏引擎核心
│   │   │   │   ├── instance/    # 游戏实例
│   │   │   │   └── service/     # 游戏服务
│   │   │   ├── index.ts         # 服务入口
│   │   │   ├── middleware/      # 认证中间件
│   │   │   ├── plugins/         # WebSocket 插件
│   │   │   ├── routes/          # API 路由
│   │   │   └── services/        # 业务服务
│   │   ├── drizzle/             # Drizzle 迁移文件
│   │   ├── scripts/             # 工具脚本
│   │   ├── drizzle.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   └── types/                   # 前后端共享类型定义
│       ├── src/
│       │   ├── api/             # API 请求/响应类型 Schema
│       │   ├── connection/      # WebSocket 连接器类型
│       │   ├── game/            # 游戏核心类型、房间类型、聊天类型
│       │   └── index.ts
│       └── package.json
│
├── docs/
│   ├── TODO.md                  # 开发计划与修复清单
│   └── NOTE.md                  # 设计笔记
├── public/
├── package.json                 # 根 monorepo 配置
├── tsconfig.json
├── .env.example
├── .gitignore
└── LICENSE
```

---

## 架构概览 / Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Frontend (SolidJS SPA)                       │
│                                                                      │
│  ┌───────────┐   ┌──────────┐  ┌────────────┐  ┌──────────────┐      │
│  │  Routes   │   │  Hooks   │  │ Components │  │    UI Lib    │      │
│  │ (pages)   │   │(business)│  │   (views)  │  │ (primitives) │      │
│  └─────┬─────┘   └─────┬────┘  └─────┬──────┘  └──────┬───────┘      │
│        │               │             │                │              │
│  ┌─────┴───────────────┴─────────────┴────────────────┴──────────┐   │
│  │            WebSocket Client Manager                           │   │
│  │   (sub-connectors, auto-reconnect, pending queue)             │   │
│  └───────────────────────────┬───────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────────┐   │
│  │            TanStack Solid Query                               │   │
│  │        (server state cache + REST API)                        │   │
│  └───────────────────────────┬───────────────────────────────────┘   │
└──────────────────────────────┼───────────────────────────────────────┘
                               │ HTTP + WebSocket
┌──────────────────────────────┼───────────────────────────────────────┐
│                    Backend (Elysia.js + Bun)                         │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────────┐    │
│  │ Routes   │  │Services  │  │     Game Service Manager         │    │
│  │ /api/*   │  │(auth,    │  │                                  │    │
│  │ • user   │  │ profile, │  │  ┌────────────────────────────┐  │    │
│  │ • game   │  │ email,   │  │  │       GameService          │  │    │
│  │ • profile│  │ session) │  │  │                            │  │    │
│  └──────────┘  └──────────┘  │  │  ┌──────────────────────┐  │  │    │
│                              │  │  │ PreGameInstance      │  │  │    │
│  ┌──────────────────────────┐│  │  │ GameInstance         │  │  │    │
│  │   WebSocket Plugin       ││  │  │ ChatInstance         │  │  │    │
│  │ (sub-connectors,         ││  │  └──────────────────────┘  │  │    │
│  │  domain handlers,        ││  └────────────────────────────┘  │    │
│  │  session-based auth)     ││                                  │    │
│  └──────────────────────────┘│  ┌────────────────────────────┐  │    │
│                              │  │   GameService (room #2)    │  │    │
│  ┌──────────────────────────┐│  └────────────────────────────┘  │    │
│  │   Drizzle ORM (SQLite)   │|                                  │    │
│  └──────────────────────────┘└──────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### 数据流 / Data Flow

1. **HTTP API** — 用于用户认证、房间 CRUD、Profile 管理等 RESTful 操作，前端通过 TanStack Solid Query 管理缓存
2. **WebSocket** — 用于游戏实时通信，基于 sub-connector 模式：
   - 客户端通过全局 WS 连接，按 domain（game/chat/connection）分发消息
   - 进入游戏房间时建立 sub-connection，独立管理该房间的生命周期
   - 支持断线重连：保留 pending 队列，重连后自动重放未确认操作
3. **状态同步** — 使用 JSON Patch (RFC 6902) 进行增量同步，大变更时自动回退到全量快照；客户端基于版本号的乐观更新机制

---

## 功能特性 / Features

### 已实现 / Implemented

#### 用户系统 / User System
- [x] 邮箱注册与验证（验证码邮件）
- [x] 登录 / 登出（基于 httpOnly Cookie 的 Session）
- [x] 密码找回（邮件重置链接）
- [x] 密码修改 / 邮箱修改（需验证）
- [x] 反重复登录机制（新登录踢掉旧 Session + WebSocket 连接）
- [x] Session 自动清理（7 天滑动过期）

#### 个人资料 / Profile
- [x] Display Name 设置
- [x] 头像上传（自动生成缩略图，默认像素风头像）
- [x] 公开资料页 `/profile/:userId`
- [x] 私人资料编辑页 `/profile`

#### 游戏房间 / Game Room
- [x] 创建房间（Standard 快速模式 / Custom 自定义模式）
- [x] 房间列表（分页、筛选、排序、实时 WebSocket 推送）
- [x] 加入 / 退出房间
- [x] 房主自动转移（房主离开时顺位继承）
- [x] 踢出玩家与冷却机制
- [x] 队伍系统（个人战 FFA / 组队战，动态增删队伍）
- [x] 游戏设置（地图类型/大小、倍速、兵力增长速度等）
- [x] 玩家准备状态管理
- [x] 队伍合法性校验（至少两个队伍方可开始）

#### 游戏核心 / Game Core
- [x] 程序化地图生成（随机地形、兵营、王座）
- [x] Tick-based 回合制游戏推进
- [x] 兵力自然增长与移动
- [x] 战争迷雾（视野计算，队友共享视野）
- [x] 地图已探索地形保留显示（无兵力数据）
- [x] 移动操作队列（上下左右/WASD）
- [x] 自动裁决（非法移动自动取消）
- [x] 游戏结束判断与结算
- [x] 游戏倍速（0.5x - 3x）

#### 实时同步 / Real-time Sync
- [x] WebSocket sub-connector 架构
- [x] 版本号乐观状态更新
- [x] JSON Patch 增量同步 + Snapshot 全量回退
- [x] 断线重连（保留 pending 操作，重连后重放）
- [x] 操作确认/失败回调（超时 10s）

#### 聊天 / Chat
- [x] 房间内聊天（跨 PreGame / InGame 阶段）
- [x] 消息发送状态（sending / failed / success）
- [x] 团队聊天（`/team <message>` 格式）
- [x] 旁观者标识

#### UI / 用户体验
- [x] 像素风主题（Tailwind + DaisyUI fantasy16 主题）
- [x] 怀旧字体（Press Start 2P、Pixelify Sans）
- [x] FontAwesome 图标（Solid + Regular）
- [x] 按钮音效 SFX
- [x] 导航栏与用户菜单
- [x] Loading / Error / Empty 状态处理
- [x] 404 页面
- [x] 路由级认证保护
- [x] 地图 WebGL 渲染（PixiJS）

### 开发中 / In Progress
- [ ] 自定义地图导入
- [ ] 地图拖拽与缩放（大地图适配）
- [ ] 观战模式完善（当前仅基础全图视野）
- [ ] 玩家局内颜色选择
- [ ] 房间密码保护
- [ ] 游戏结算后 UI 优化（返回大厅 / 回到房间）
- [ ] Username 修改频率限制与唯一性
- [ ] 用户全局设置系统（主题、音效等）

### 计划中 / Planned
- [ ] 官方匹配系统（自动匹配玩家池）
- [ ] 多游戏模式支持（框架抽象为联机小游戏平台）
- [ ] 移动端适配
- [ ] 游戏 Mod / 插件系统
- [ ] 用户存档系统
- [ ] 数据协议优化（MessagePack）
- [ ] i18n 国际化

---

## 快速开始 / Quick Start

### 前置要求 / Prerequisites

- [Bun](https://bun.sh) >= 1.2.17
- 一个可用的 SMTP 邮箱账号（用于用户注册验证等邮件功能）

### 安装 / Installation

```bash
# 克隆仓库
git clone https://github.com/fltb/generale.git
cd generale-vue

# 安装所有包的依赖
bun install
```

### 配置 / Configuration

1. 在 `packages/backend/` 下创建 `.env` 文件（参考 `.env.example`）：

```env
EMAIL_METHOD=smtp
EMAIL_FROM=no-reply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@example.com
SMTP_PASS=your_password
DB_FILE_NAME=./.db/app.sqlite
```

2. 初始化数据库（Drizzle 迁移）：

```bash
bun run --filter=@generale/backend db:push
```

### 开发运行 / Development

```bash
# 同时启动前后端开发服务器
bun run dev
```

此命令会并行启动：
- **后端**：`http://localhost:3000`（Elysia.js API + WebSocket）
- **前端**：`http://localhost:5173`（Rsbuild Dev Server，API 代理到后端）
- **Swagger API 文档**：`http://localhost:3000/api/swagger`

### 单独开发 / Individual Development

```bash
# 仅后端
bun run --filter=@generale/backend dev

# 仅前端
bun run --filter=@generale/frontend dev

# 运行后端测试
bun run --filter=@generale/backend test
```

### 构建 / Build

```bash
# 构建所有包（前端 + 共享类型）
bun run build
```

---

## 开发指南 / Development Guide

### 路径别名 / Path Aliases

前端使用 `~` 作为 `src/` 目录的别名：

```typescript
import { useAuth } from '~/hooks/useAuth';
import { Button } from '~/ui/Button';
```

### 前端路由 / Frontend Routes

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | Home | 房间列表（需登录） |
| `/login` | LoginPage | 登录 / 注册 |
| `/profile` | ProfilePage | 个人资料编辑（需登录） |
| `/profile/:userId` | PublicProfilePage | 公开资料页 |
| `/forgot-password` | ForgotPasswordPage | 找回密码 |
| `/reset-password` | ResetPasswordPage | 重置密码 |
| `/verify-email` | VerifyEmailPage | 邮箱验证 |
| `/confirm-email-change` | ConfirmEmailChangePage | 确认邮箱变更 |
| `/game/:id` | RoomRoute | 游戏房间 / 游戏中 |
| `/test` | Test | 测试/调试页 |
| `*` | NotFound | 404 |

### 后端 API 路由 / Backend API Routes

所有 API 挂载在 `/api` 前缀下：

| 路由组 | 说明 |
|--------|------|
| `/api/user/*` | 用户注册、登录、验证、密码管理 |
| `/api/profile/*` | 个人资料与头像 |
| `/api/game/*` | 游戏房间 CRUD、列表、连接 |
| `/api/ws` | WebSocket 端点（含子连接协议） |

### WebSocket 子连接协议 / Sub-connector Protocol

游戏使用 domain-based 子连接模式：

```
客户端 → 全局 WS 连接 (/api/ws)
         ├── domain: "connection"  → 连接生命周期事件
         ├── domain: "game"        → 游戏状态同步
         └── domain: "chat"        → 聊天消息
```

进入房间时通过 `connect` 消息建立 sub-connection，离开时自动清理。

### 状态同步格式 / State Sync Format

服务端推送的状态消息结构：

```typescript
interface ServerStateEnvelope<T> {
  domain: "game" | "chat"
  type: "state" | "action-result" | "chat-msg"
  payload: {
    version: number
    type: "snapshot" | "patch"
    data: T | RFC6902Patch[]
    confirmed: number
  } | {
    id: number
    result: "ok" | "abort" | "fail"
    message?: string
  }
}
```

---

## 游戏设计 / Game Design

### 游戏阶段 / Game Phases

```
玩家创建/加入房间
      │
      ▼
┌─────────────┐
│ Room        │  房间阶段：队伍分配、设置调整、准备确认
│ Stage       │
└──────┬──────┘
       │ 所有玩家准备完毕 / 房主开始
       ▼
┌─────────────┐
│ Game        │  游戏阶段：Tick 推进、移动操作、领土争夺
│ Stage       │
└──────┬──────┘
       │ 游戏结束
       ▼
┌─────────────┐
│ Game Over   │  结算：返回房间 / 退出
└─────────────┘

ChatInstance 贯穿所有阶段（房间内 + 游戏中均可聊天）
```

### 游戏模式 / Game Modes

- **Standard（标准模式）**：快速开始，仅可选地图大小（Small / Medium / Large），不可修改详细设置
- **Custom（自定义模式）**：开放所有设置项，包括队伍数量、地形频率、倍速等
- **FFA（个人战）**：每个玩家独立队伍，静默管理
- **Team（组队战）**：玩家自由选择队伍，至少两支队伍方可开始

### 地图系统 / Map System

- **随机生成**：基于地形频率权重进行程序化生成，包含兵营（Barracks）、王座（Throne）、山地、沼泽等
- **战争迷雾**：玩家仅可见自己及队友视野范围内的地块，但已探索的地形永久保留显示
- **兵力增长**：地块随时间自动增长兵力，速度和上限可配置

---

## 部署 / Deployment

### 生产构建 / Production Build

```bash
# 1. 构建共享类型
bun run --filter=@generale/types build

# 2. 构建前端
bun run --filter=@generale/frontend build

# 3. 后端直接运行（Bun 原生支持 TypeScript）
bun run packages/backend/src/index.ts
```

### 环境变量 / Environment Variables

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EMAIL_METHOD` | 邮件发送方式 (smtp) | `smtp` |
| `EMAIL_FROM` | 发件人地址 | - |
| `SMTP_HOST` | SMTP 服务器地址 | - |
| `SMTP_PORT` | SMTP 端口 | `465` |
| `SMTP_SECURE` | 是否使用 SSL | `true` |
| `SMTP_USER` | SMTP 用户名 | - |
| `SMTP_PASS` | SMTP 密码 | - |
| `DB_FILE_NAME` | SQLite 数据库文件路径 | `.db/app.sqlite` |
| `APP_URL` | 应用根 URL（用于邮件链接） | `http://localhost:3000` |

---

## 贡献 / Contributing

本项目目前处于活跃开发阶段，欢迎提交 Issue 和 Pull Request。

在开始贡献前，请阅读：
- [docs/TODO.md](docs/TODO.md) — 当前开发任务与 Bug 追踪
- [docs/NOTE.md](docs/NOTE.md) — 设计与架构笔记

### 提交规范 / Commit Convention

本项目无严格的 commit message 格式要求，但推荐使用清晰的描述性信息。

---

## 许可证 / License

本项目采用 [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)。

Copyright (C) 2025 fltb.

---

<p align="center">
  <sub>Built with TypeScript, Bun, SolidJS, and Elysia</sub>
</p>
