# AGENTS.md — generale-vue

## Overview

Online multiplayer strategy game. **Monorepo** with 3 Bun workspace packages.

| Package | Path | Stack |
|---------|------|-------|
| `@generale/types` | `packages/types/` | Elysia + TypeScript (shared type schemas) |
| `@generale/backend` | `packages/backend/` | Elysia + Bun SQLite + drizzle-orm + WebSocket |
| `frontend` | `packages/frontend/` | **SolidJS** (not Vue) + PixiJS + rsbuild + Tailwind v4 + DaisyUI |

## Essential commands

```bash
# Root (workspace-wide via Bun)
bun run build      # builds all 3 packages
bun run dev        # dev servers for all packages
bun run test       # all tests (FE vitest, BE vitest + bun:test)

# Backend (package-specific)
cd packages/backend
bun run dev                               # dev server with --watch
bun run test                              # unit + integration tests
bun run test:unit                         # vitest unit tests only
bun run test:integration                  # bun:test integration tests only
npx vitest src/plugins/__tests__/websocket.game-scenario.test.ts  # single test file
npx drizzle-kit generate                  # generate migration from schema changes
npx tsc --noEmit                          # typecheck only (no emit)

# Frontend
cd packages/frontend
npx rsbuild build                         # production build
npx rsbuild dev                           # dev server (port 5173, proxies /api → localhost:3000)
bun run test                              # vitest (513 tests, 82 files)
bun run test:vitest                       # same as `bun run test`

# Types (must build first after schema changes)
cd packages/types
npx tsc -p tsconfig.json                  # build → dist/
```

## Build order & dependency

**`@generale/types` must be built first** after any type changes. Backend and frontend both depend on it as `workspace:*`. If backend/frontend can't resolve `@generale/types`, run:

```bash
cd packages/types && npx tsc -p tsconfig.json
```

Frontend imports types via `@generale/types/dist/api` (note the `/dist/api` subpath).

## DB schema changes

Uses drizzle-kit with SQLite + the official Drizzle migration pipeline.

**Developer workflow:**
```bash
cd packages/backend

# 1. Edit src/db/schema.ts
# 2. Generate incremental SQL migration
npx drizzle-kit generate
# 3. Commit the new file under drizzle/
```

**Runtime:** `runMigrations()` in `src/db/migrate.ts` applies pending migrations at startup via `drizzle-orm/bun-sqlite/migrator`. It uses the `__drizzle_migrations` table to track applied migrations — idempotent and safe for repeated runs.

**Pre-existing DBs:** `sealExistingMigrations()` detects databases created before the migration system was introduced. It marks all existing migration entries as "already applied" so `migrate()` won't attempt to re-create tables.

**Env required:** `DB_FILE_NAME=` (see `.env.example`).

## Architecture

### Frontend (`packages/frontend/src/`)

```
src/
├── app.tsx               # root: SolidJS Router + AuthProvider + WebSocketProvider
├── routes/               # route entrypoints (room.tsx, profile.tsx, etc.)
├── components/           # shared UI (Avatar, ChatPanel, MapRender) + game/ + room/
├── game/                 # logic hooks (useRoomSession, useGameSession, useChatSession, selectors, render/)
├── hooks/                # low-level hooks (useAuth, useWebsocket, useChat, useSyncedState)
├── ui/                   # UI primitives (Button, Card, Panel, Badge, Alert, Modal, Overlay, etc.)
├── api/                  # API client functions → base.ts wrappers
├── ws/                   # WebSocket connection manager
└── utils/                # playerColor, faIconGraphic, playerDisplay
```

**Key conventions:**
- `~/*` alias → `src/*` (configured in tsconfig paths + rsbuild)
- All game components import primitives from `~/ui` (not raw daisyUI classes directly)
- Logic/UI separation: hooks in `~/game/` or `~/hooks/`, rendering in `~/components/`
- `solid-pixi` wraps PixiJS v8 for the map canvas — use `P.Container`, `P.Graphics`, `P.Text`, `Application`
- `pixel-border` is a custom CSS class for game-style pixelated borders
- FontAwesome icons rendered to PixiJS `GraphicsContext` via `~/utils/faIconGraphic`
- Chat uses its own `chat-*` WebSocket domain, separate from `room-*` and `game-*`

### Backend (`packages/backend/src/`)

```
src/
├── index.ts              # entry: env init → migrations → Elysia app
├── db/                   # drizzle client.ts, migrate.ts, schema.ts
├── routes/               # Elysia route handlers (user.ts, game.ts, profile.ts)
├── services/             # userService, profileService, sessionService, emailService
├── game/                 # game engine: core/, instance/, service/
├── plugins/              # WebSocket plugin, domain handler registration
├── middleware/            # authPlugin (session-based)
└── ws/                   # WS connection manager
```

**Key conventions:**
- Elysia with `bun-types` — use Bun native APIs
- `WSContext` is built server-side from session; frontend never sends `userid`/`username`
- Game uses domain-based sub-connections: `room-*`, `game-*`, `chat-*`
- RoomInstance stays mounted across game phases (hidden, not unmounted)

### Shared types (`packages/types/src/`)

- Elysia `t.Object()` schemas shared between backend routes and frontend clients
- Exports through `src/api/index.ts` → built to `dist/api/index.js`

## Key quirks & gotchas

- **Repo is named generale-vue but frontend is SolidJS**, not Vue. Name is historical.
- **Biome** configured at root (lint + format). Run `bun run lint` or `bun run check`.
- **Frontend `.env`** — API proxy already configured in `rsbuild.config.ts`; no frontend env needed.
- **Backend `.env`** — copy `.env.example`, set `DB_FILE_NAME=` and SMTP credentials.
- **`resizeTo={window}`** on PixiJS Application — canvas fills entire viewport, HUD overlays are DOM positioned `absolute` on top.
- **MapRender must call `destroyGcCache()`** on mount/cleanup to avoid stale PixiJS GraphicsContext across game sessions.
- **RoomWithSync and GameWithSync both stay mounted** (hidden via `display: none`) to avoid WebSocket reconnect overhead during phase transitions.
- **Username is unique (DB-level constraint), changeable every 7 days.** displayName allows duplicates; `resolveDisplayNames()` utility adds `displayName#username` disambiguation.
- **Production startup:** `scripts/start.sh` sets `NODE_ENV=production` + `FRONTEND_DIST=./frontend`. Run via `./start.sh` from the deploy directory.
- **SMTP env vars required:** `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — server crashes at startup if missing. Transporter verify has 5s timeout; failure only logs warning, doesn't block startup.
- **Deploy package:** CI `package` job compiles binary + frontend dist + migrations into `generale-server/` folder, uploaded as artifact. Download → unzip → `cd generale-server` → `./start.sh`.
- **Public URL:** `PUBLIC_URL` env controls sitemap.xml / robots.txt / og:image URL. Default `http://localhost:3000`.

## Testing

- **Backend:** vitest for unit tests (`bun run test:unit`), bun:test for integration (`bun run test:integration`, needs `bun:sqlite`). Run all: `bun run test`.
- **Frontend:** All tests use vitest. Run: `bun run test` (513 tests, 82 files). Coverage: 90%+ across ui/ components/ hooks/ routes/ game/.
- Test files may have stale type errors — ignore them if they're in `__tests__/` directories and not related to your changes.

### E2E testing (Playwright)

`e2e/` directory at monorepo root. Tests run in Node.js; use `npm install` (not `bun install`).

**Setup & run:**
```bash
cd e2e && npm install && npx playwright install chromium && npm test
```

**Architecture:**
- `BackendRunner` spawns `bun run src/index.ts` on random port with temp DB, runs seed, waits for `/api/health`
- `FrontendRunner` spawns `bunx rsbuild dev` on random port with `BACKEND_TARGET` env pointing to backend
- `TestScenario` coordinates full lifecycle, creates player sessions
- `PlayerSession` provides DOM-first API via `page.*` real user interaction
- `window.__test__` (URL param `?__test__=1`) enables PixiJS canvas escape hatch: `clickTile`, `getGameState`, `waitForTileOwner`, `waitForStatus`, `waitForWSConnected`
- **7 scenarios implemented:** registration, room management, game flow, chat, kick/host transfer, in-game interaction, disconnection/reconnect

**Gotchas:**
- Backend runs in Bun; test harness spawns it as child process
- `rsbuild.config.ts` reads `BACKEND_TARGET` and `FRONTEND_PORT` env vars for dynamic proxy
- `Page.on("dialog")` auto-accepts confirm/alert to prevent blocking
- Surrender uses `{ force: true }` because `game-end-overlay` (fixed, z-50) intercepts clicks once game ends

## Repository conventions

- **Commit messages must be in English.**
- **Never commit or push automatically.** Always show the user the staged diff and wait for explicit confirmation before `git commit` or `git push`.
- **AI is a helper, not the center.** The project maintains its own structure, comments, and tests to ensure quality. Do not commit AI-generated coverage reports, design docs, or workflow artifacts to git.
- **Before pushing, run `bun run ci:lint` (biome) and confirm it passes (exit 0, 0 errors 0 warnings).** Do not push if lint fails.
- **Before pushing, run `bun run build` and confirm it succeeds.** This builds types, backend, and frontend.
- **Before pushing, run `bun run test` and confirm all tests pass.** This runs frontend vitest + backend vitest + backend bun:test across all workspace packages. Do not push if any tests fail.
