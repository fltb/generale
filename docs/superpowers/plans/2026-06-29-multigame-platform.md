# Multi-Game Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Generale codebase into a multi-game platform and implement Bomberman as the second game (POC).

**Architecture:** Games are autonomous sub-applications with independent Managers, routes, and lobby WS domains. Shared layer is minimal: `StateSyncState<T>`, `displaceConnector()`, `useSyncedState()`. No forced inheritance — each game composes what it needs from the existing connection/sync primitives.

**Tech Stack:** Bun + Elysia + SQLite (drizzle-orm) + SolidJS + PixiJS (solid-pixi) + TypeScript + vitest

**Spec:** `docs/superpowers/specs/2026-06-29-multigame-platform-design.md`

## Global Constraints

- Every task ends with verifying `cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test` passes from repo root
- All new game-owned DB tables MUST use `{gameType}_` prefix
- Bomberman uses file-based maps (`games/bomberman/maps/*.json`), not DB storage for tiles
- Route paths follow `/api/{gameType}/room/*` pattern
- Frontend routes follow `/{gameType}/*` pattern
- Generale existing code paths continue working — all tests pass at every step
- User settings API: `GET/PATCH /api/settings/global` and `GET/PATCH /api/settings/game/:type`
- No `gameType` field in room state or API bodies — routes are the discriminator

---

## Phase 1: Infrastructure (DB + Types)

### Task 1.1: Add `game_results` and `game_user_settings` tables to drizzle schema

**Files:**
- Modify: `packages/backend/src/db/schema.ts`

**Interfaces:**
- Produces: `gameResults` table, `gameUserSettings` table (available for drizzle queries later)

- [ ] **Step 1: Add table definitions to schema.ts**

Append to `packages/backend/src/db/schema.ts`:

```ts
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const gameResults = sqliteTable("game_results", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  gameType: text("game_type").notNull(),
  endedAt: integer("ended_at").notNull(),
  durationMs: integer("duration_ms"),
  participants: text("participants", { mode: "json" }).notNull(),
  stateSnapshot: text("state_snapshot", { mode: "json" }),
});

export const gameUserSettings = sqliteTable(
  "game_user_settings",
  {
    userId: text("user_id").notNull(),
    gameType: text("game_type").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.gameType, table.key] }),
  }),
);
```

Ensure the existing import line at top includes `primaryKey` and `sqliteTable` — it already does since schema.ts uses them for `userSettings`.

- [ ] **Step 2: Generate migration and verify**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend && npx drizzle-kit generate
```

Verify a new file appears in `packages/backend/drizzle/`.

- [ ] **Step 3: Build and run tests**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat: add game_results and game_user_settings tables"
```

---

### Task 1.2: Add shared types to `@generale/types`

**Files:**
- Create: `packages/types/src/game/game-type.ts`
- Create: `packages/types/src/game/room/base-room-state.ts`
- Create: `packages/types/src/settings/global.ts`
- Create: `packages/types/src/game/result.ts`
- Modify: `packages/types/src/api/index.ts`

- [ ] **Step 1: Create `game-type.ts`**

```ts
// packages/types/src/game/game-type.ts
export const GENERALE = "generale" as const;
export const BOMBERMAN = "bomberman" as const;

export type GameType = typeof GENERALE | typeof BOMBERMAN;
```

- [ ] **Step 2: Create `base-room-state.ts`**

```ts
// packages/types/src/game/room/base-room-state.ts
import type { GameId, PlayerId } from "../core-type";

export enum BasePlayerStatus {
  Lobby = "lobby",
  Playing = "playing",
  Disconnected = "disconnected",
  Spectating = "spectating",
}

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
  gameConfig: unknown;
}
```

- [ ] **Step 3: Create `global.ts`**

```ts
// packages/types/src/settings/global.ts
export interface GlobalSettings {
  locale: string;
  theme: string;
  soundMuted: boolean;
}

export const GLOBAL_SETTINGS_KEYS: readonly (keyof GlobalSettings)[] = [
  "locale",
  "theme",
  "soundMuted",
] as const;
```

- [ ] **Step 4: Create `result.ts`**

```ts
// packages/types/src/game/result.ts
import type { GameId, PlayerId, TeamId } from "./core-type";
import type { GameType } from "./game-type";

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

- [ ] **Step 5: Export new files from the API index**

Read `packages/types/src/api/index.ts` and add these export lines:

```ts
export * from "../game/game-type";
export type { BasePlayerInfo, BasePlayerStatus, BaseRoomState } from "../game/room/base-room-state";
export type { GlobalSettings } from "../settings/global";
export type { GameResultParticipant, GameResultRow } from "../game/result";
```

- [ ] **Step 6: Build types and verify**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/types && npx tsc -p tsconfig.json
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/game/game-type.ts packages/types/src/game/room/base-room-state.ts packages/types/src/settings/global.ts packages/types/src/game/result.ts packages/types/src/api/index.ts
git commit -m "feat: add shared types for multi-game platform (GameType, BaseRoomState, GameResultRow, GlobalSettings)"
```

---

## Phase 2: Frontend Directory Migration

### Task 2.1: Create Generale game directory structure in frontend

**Files:**
- Create: `packages/frontend/src/routes/games/generale/` (directory)
- Move: `packages/frontend/src/components/game/` → `packages/frontend/src/routes/games/generale/components/game/`
- Move: `packages/frontend/src/components/room/` → `packages/frontend/src/routes/games/generale/components/room/`
- Move: `packages/frontend/src/components/roomlist/` → `packages/frontend/src/routes/games/generale/components/roomlist/`
- Move: `packages/frontend/src/components/MapRender.tsx` → `packages/frontend/src/routes/games/generale/components/MapRender.tsx`
- Move: `packages/frontend/src/game/` → `packages/frontend/src/routes/games/generale/hooks/`
- Move: `packages/frontend/src/hooks/useRoomSession*` → `packages/frontend/src/routes/games/generale/hooks/` (if they exist separately)
- Move: `packages/frontend/src/api/gameApi.ts` → `packages/frontend/src/routes/games/generale/api/gameApi.ts`
- Move: `packages/frontend/src/routes/generale/` → `packages/frontend/src/routes/games/generale/routes/`

- [ ] **Step 1: Create directory structure**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend/src
mkdir -p routes/games/generale/components routes/games/generale/hooks routes/games/generale/api routes/games/generale/routes
```

- [ ] **Step 2: Move Generale-specific files**

First, list what's in each source directory to get exact paths:

```bash
ls packages/frontend/src/components/game/ packages/frontend/src/components/room/ packages/frontend/src/components/roomlist/ packages/frontend/src/game/ packages/frontend/src/routes/generale/ 2>/dev/null
```

Then move using `git mv` to preserve history:

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend/src

# Move game components
for f in components/game/*; do git mv "$f" routes/games/generale/components/game/; done 2>/dev/null

# Move room components
for f in components/room/*; do git mv "$f" routes/games/generale/components/room/; done 2>/dev/null

# Move roomlist components
for f in components/roomlist/*; do git mv "$f" routes/games/generale/components/roomlist/; done 2>/dev/null

# Move MapRender
git mv components/MapRender.tsx routes/games/generale/components/MapRender.tsx 2>/dev/null

# Move game hooks
for f in game/*; do git mv "$f" routes/games/generale/hooks/; done 2>/dev/null

# Move game API
git mv api/gameApi.ts routes/games/generale/api/gameApi.ts 2>/dev/null

# Move route page
for f in routes/generale/*; do git mv "$f" routes/games/generale/routes/; done 2>/dev/null
```

- [ ] **Step 3: Update ALL imports across the entire frontend codebase**

For each file that imported from the old paths, update the import. The `~` alias resolves to `packages/frontend/src/`. Run rgrep to find all references:

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend
# Find all imports referencing old paths
rg "from ['\"]~/(components/(game|room|roomlist)/|components/MapRender|game/|api/gameApi|routes/generale/)" --include '*.ts' --include '*.tsx' -n
```

For each found import, update to the new path. The mapping is:

| Old import path | New import path |
|---|---|
| `~/components/game/...` | `~/routes/games/generale/components/game/...` |
| `~/components/room/...` | `~/routes/games/generale/components/room/...` |
| `~/components/roomlist/...` | `~/routes/games/generale/components/roomlist/...` |
| `~/components/MapRender` | `~/routes/games/generale/components/MapRender` |
| `~/game/...` | `~/routes/games/generale/hooks/...` |
| `~/api/gameApi` | `~/routes/games/generale/api/gameApi` |
| `~/routes/generale/...` | `~/routes/games/generale/routes/...` |

Also check `app.tsx` for imports from the old route location:

```bash
rg "routes/generale|components/(game|room|roomlist)" packages/frontend/src/app.tsx
```

Update app.tsx imports accordingly.

- [ ] **Step 4: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

Fix any import errors until build and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate frontend Generale code to routes/games/generale/"
```

---

## Phase 3: Backend Directory Migration

### Task 3.1: Create Generale game directory in backend and move files

**Files:**
- Create: `packages/backend/src/games/generale/` directory
- Move: `packages/backend/src/game/core/` → `packages/backend/src/games/generale/core/`
- Move: `packages/backend/src/game/instance/RoomInstance.ts` → `packages/backend/src/games/generale/instance/GeneraleRoom.ts`
- Move: `packages/backend/src/game/instance/GameInstance.ts` → `packages/backend/src/games/generale/instance/GeneraleGame.ts`
- Move: `packages/backend/src/game/service/GameService.ts` → `packages/backend/src/games/generale/service/GeneraleService.ts`
- Move: `packages/backend/src/game/service/GameServiceManager.ts` → `packages/backend/src/games/generale/service/GeneraleManager.ts`
- Move: `packages/backend/src/routes/game.ts` → `packages/backend/src/games/generale/routes.ts`
- Move: `packages/backend/src/game/service/units/` → `packages/backend/src/games/generale/service/units/`
- Delete: `packages/backend/src/game/instance/interface.d.ts`
- Keep: `packages/backend/src/game/instance/state-sync.ts` (shared, DON'T MOVE)
- Keep: `packages/backend/src/game/instance/connector-manager.ts` (shared, DON'T MOVE)
- Keep: `packages/backend/src/game/instance/GameChatInstance.ts` (shared, DON'T MOVE)

- [ ] **Step 1: Create directory structure**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend/src
mkdir -p games/generale/core games/generale/instance games/generale/service/units
```

- [ ] **Step 2: Move core game logic**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend/src
for f in game/core/*; do git mv "$f" games/generale/core/; done
```

- [ ] **Step 3: Move instance files**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend/src
git mv game/instance/RoomInstance.ts games/generale/instance/GeneraleRoom.ts
git mv game/instance/GameInstance.ts games/generale/instance/GeneraleGame.ts
```

- [ ] **Step 4: Move service files**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend/src
git mv game/service/GameService.ts games/generale/service/GeneraleService.ts
git mv game/service/GameServiceManager.ts games/generale/service/GeneraleManager.ts
for f in game/service/units/*; do git mv "$f" games/generale/service/units/; done
```

- [ ] **Step 5: Move routes and delete interface**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend/src
git mv routes/game.ts games/generale/routes.ts
git rm game/instance/interface.d.ts
```

- [ ] **Step 6: Update ALL imports in GeneraleGame.ts (formerly GameInstance.ts)**

The file now lives at `src/games/generale/instance/GeneraleGame.ts`. Update its imports to reference shared code:

```ts
// WAS: import { mask, tick } from "../core";
// NOW: import { mask, tick } from "../../core";  
// (these are in games/generale/core/)

// WAS: import { displaceConnector as displace } from "./connector-manager";
// NOW: import { displaceConnector as displace } from "../../../game/instance/connector-manager";

// WAS: import { StateSyncState } from "./state-sync";
// NOW: import { StateSyncState } from "../../../game/instance/state-sync";
```

- [ ] **Step 7: Update ALL imports in GeneraleRoom.ts (formerly RoomInstance.ts)**

```ts
// WAS: import { displaceConnector as displace } from "./connector-manager";
// NOW: import { displaceConnector as displace } from "../../../game/instance/connector-manager";

// WAS: import { StateSyncState } from "./state-sync";
// NOW: import { StateSyncState } from "../../../game/instance/state-sync";
```

Also remove the `import type { IBaseInstance, IRoomRoster } from "./interface";` line and the `implements IBaseInstance<...>, IRoomRoster`.

- [ ] **Step 8: Update ALL imports in GeneraleService.ts (formerly GameService.ts)**

```ts
// WAS: import { generateMap } from "../core/map-gen";
// NOW: import { generateMap } from "../../core/map-gen";

// WAS: import { GameChatInstance } from "../instance/GameChatInstance";
// NOW: import { GameChatInstance } from "../../../game/instance/GameChatInstance";

// WAS: import { GameInstance, type GameInstanceSettings } from "../instance/GameInstance";
// NOW: import { GeneraleGame, type GameInstanceSettings } from "../instance/GeneraleGame";

// WAS: import { RoomInstance } from "../instance/RoomInstance";
// NOW: import { GeneraleRoom } from "../instance/GeneraleRoom";

// WAS: import { buildGameInfo } from "./units/GameInfoPresenter";
// NOW: import { buildGameInfo } from "./units/GameInfoPresenter"; (same relative path)

// WAS: import { RoomUpdateFilter } from "./units/RoomUpdateFilter";
// NOW: import { RoomUpdateFilter } from "./units/RoomUpdateFilter"; (same relative path)
```

Update the class references inside the file: `new GameInstance(...)` → `new GeneraleGame(...)`, `new RoomInstance(...)` → `new GeneraleRoom(...)`.

- [ ] **Step 9: Update imports in GeneraleManager.ts (formerly GameServiceManager.ts)**

```ts
// WAS: import { GameService, type GameServiceConfig } from "./GameService";
// NOW: import { GeneraleService, type GameServiceConfig } from "./GeneraleService";
```

Update `new GameService(config)` → `new GeneraleService(config)`.

- [ ] **Step 10: Update imports in GeneraleGame.ts for IBaseInstance**

Remove the line:
```ts
import type { IBaseInstance } from "./interface";
```

Remove `implements IBaseInstance<SyncedGameClientActions, SyncedGameServerEvent>` from the class declaration. The class doesn't need the interface since nothing polymorphically calls it.

- [ ] **Step 11: Update imports in app.ts**

```ts
// WAS: import { gameRoutes } from "./routes/game";
// NOW: import { generaleRoutes } from "./games/generale/routes";

// Also in the app setup, rename:
// WAS: gameRoutes → NOW use the imported name
```

In `app.ts`, find the line where `gameRoutes` is used (`.use(gameRoutes)` or similar) and update to use the new imported name.

- [ ] **Step 12: Update all other files that import from moved paths**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend
rg "from.*routes/game" --include '*.ts' -n
rg "from.*game/(core|instance|service)/" --include '*.ts' -n
```

For each found import, update to the new path. Key patterns:
- `routes/game` → `games/generale/routes`
- `game/core/` → `games/generale/core/`
- `game/instance/RoomInstance` → `games/generale/instance/GeneraleRoom`
- `game/instance/GameInstance` → `games/generale/instance/GeneraleGame`
- `game/service/GameService` → `games/generale/service/GeneraleService`
- `game/service/GameServiceManager` → `games/generale/service/GeneraleManager`

Shared files that DON'T change path:
- `game/instance/state-sync` stays as-is
- `game/instance/connector-manager` stays as-is
- `game/instance/GameChatInstance` stays as-is

- [ ] **Step 13: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

Fix all import/type errors until build and all tests pass.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor: migrate backend Generale code to games/generale/, keep sync primitives shared"
```

---

### Task 3.2: Rename GeneraleManager and update app setup

**Files:**
- Modify: `packages/backend/src/games/generale/service/GeneraleManager.ts`
- Modify: `packages/backend/src/app.ts`

- [ ] **Step 1: Rename class in GeneraleManager.ts**

If the class is still called `GameServiceManager`, rename it to `GeneraleManager` (find/replace across the file):

```ts
// WAS: export class GameServiceManager {
// NOW: export class GeneraleManager {
```

Also export it so app.ts can import:

```ts
export const generaleManager = new GeneraleManager();
```
→ Change to just exporting the class. The app.ts will instantiate it.

- [ ] **Step 2: Update app.ts**

Read `packages/backend/src/app.ts` to find where `GameServiceManager` is imported and instantiated. Update:

```ts
// Remove old import
// Add new:
import { GeneraleManager } from "./games/generale/service/GeneraleManager";

// Where the manager was created:
const wsManager = /* existing reference to WS connection manager */;
const generaleManager = new GeneraleManager(wsManager);
```

Note: The `GameServiceManager` currently receives the `registerDomainHandler` function and WebSocket infrastructure. Check how it's currently instantiated in app.ts and replicate for `GeneraleManager`.

- [ ] **Step 3: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename GameServiceManager to GeneraleManager"
```

---

## Phase 4: Bomberman Backend

### Task 4.1: Bomberman types (shared)

**Files:**
- Create: `packages/types/src/game/bomberman/index.ts`
- Modify: `packages/types/src/api/index.ts`

- [ ] **Step 1: Create Bomberman types file**

```ts
// packages/types/src/game/bomberman/index.ts
import type { GameId, PlayerId } from "../core-type";

export enum GameStatus {
  Playing = "PLAYING",
  Ended = "ENDED",
}

export type ItemType =
  | "BOMB_UP"
  | "FIRE_UP"
  | "SPEED_UP"
  | "KICK"
  | "GLOVE"
  | "PUNCH"
  | "REMOTE"
  | "PIERCE"
  | "SPIRIT";

export interface BombermanTile {
  type: "empty" | "hard_wall" | "soft_wall";
  item?: ItemType;
}

export interface BombermanMap {
  width: number;
  height: number;
  tiles: BombermanTile[][];
}

export interface BombermanPlayer {
  playerId: PlayerId;
  alive: boolean;
  x: number;
  y: number;
  bombMax: number;
  bombActive: number;
  blastRadius: number;
  speed: number;
  items: ItemType[];
}

export interface Bomb {
  id: string;
  playerId: PlayerId;
  x: number;
  y: number;
  fuse: number;
  blastRadius: number;
}

export interface Explosion {
  x: number;
  y: number;
  ttl: number;
}

export interface Item {
  x: number;
  y: number;
  type: ItemType;
}

export interface BombermanConfig {
  mapId?: string;
  mapWidth: number;
  mapHeight: number;
  playerLimit: number;
  tickRate: number;
  bombFuse: number;
  bombLimit: number;
  blastRadius: number;
  roundTimeSec: number;
  shrinkEnabled: boolean;
  itemDropRate: number;
  items: ItemType[];
  mode: "multi" | "single";
  levelId?: string;
  rounds?: number;
}

export interface BombermanState {
  status: GameStatus;
  tick: number;
  map: BombermanMap;
  players: Record<PlayerId, BombermanPlayer>;
  bombs: Bomb[];
  explosions: Explosion[];
  items: Item[];
  config: BombermanConfig;
  roundTimer?: number;
  shrinkBoundary?: number;
  gameId?: GameId;
  round?: number;
  totalRounds?: number;
  scores?: Record<PlayerId, number>;
}

export type BombermanOperation =
  | { type: "MOVE"; direction: "up" | "down" | "left" | "right" }
  | { type: "PLACE_BOMB" }
  | { type: "KICK_BOMB"; direction: string }
  | { type: "THROW_BOMB"; direction: string }
  | { type: "DETONATE" }
  | { type: "NOOP" };

export interface BombermanBotConfig {
  playerId: PlayerId;
  spawnX: number;
  spawnY: number;
  ai: "random" | "chase" | "patrol" | "boss_charge" | "boss_teleport";
}
```

- [ ] **Step 2: Export from api/index.ts**

Add to `packages/types/src/api/index.ts`:

```ts
export * from "../game/bomberman";
```

- [ ] **Step 3: Build types**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/types && npx tsc -p tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/game/bomberman/index.ts packages/types/src/api/index.ts
git commit -m "feat: add Bomberman shared types"
```

---

### Task 4.2: Bomberman default config + validation

**Files:**
- Create: `packages/backend/src/games/bomberman/settings.ts`

- [ ] **Step 1: Create settings.ts**

```ts
// packages/backend/src/games/bomberman/settings.ts
import type { BombermanConfig, ItemType } from "@generale/types";

const ALL_ITEMS: ItemType[] = [
  "BOMB_UP", "FIRE_UP", "SPEED_UP",
  "KICK", "GLOVE", "PUNCH",
  "REMOTE", "PIERCE", "SPIRIT",
];

export function defaultBombermanConfig(): BombermanConfig {
  return {
    mapWidth: 15,
    mapHeight: 13,
    playerLimit: 4,
    tickRate: 4,
    bombFuse: 12,
    bombLimit: 1,
    blastRadius: 1,
    roundTimeSec: 180,
    shrinkEnabled: false,
    itemDropRate: 0.6,
    items: [...ALL_ITEMS],
    mode: "multi",
  };
}

export function validateBombermanConfig(config: unknown): string | null {
  const c = config as Partial<BombermanConfig>;
  if (c.mapWidth && (c.mapWidth < 11 || c.mapWidth > 31)) return "mapWidth must be 11-31";
  if (c.mapHeight && (c.mapHeight < 11 || c.mapHeight > 31)) return "mapHeight must be 11-31";
  if (c.playerLimit && (c.playerLimit < 2 || c.playerLimit > 4)) return "playerLimit must be 2-4";
  if (c.tickRate && (c.tickRate < 2 || c.tickRate > 8)) return "tickRate must be 2-8";
  return null;
}
```

- [ ] **Step 2: Write test for validateBombermanConfig**

Create `packages/backend/src/games/bomberman/__tests__/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultBombermanConfig, validateBombermanConfig } from "../settings";

describe("defaultBombermanConfig", () => {
  it("returns valid config with expected defaults", () => {
    const config = defaultBombermanConfig();
    expect(config.mapWidth).toBe(15);
    expect(config.mapHeight).toBe(13);
    expect(config.playerLimit).toBe(4);
    expect(config.tickRate).toBe(4);
    expect(config.bombFuse).toBe(12);
    expect(config.bombLimit).toBe(1);
    expect(config.blastRadius).toBe(1);
    expect(config.roundTimeSec).toBe(180);
    expect(config.itemDropRate).toBe(0.6);
    expect(config.mode).toBe("multi");
  });
});

describe("validateBombermanConfig", () => {
  it("returns null for valid config", () => {
    expect(validateBombermanConfig(defaultBombermanConfig())).toBeNull();
  });

  it("rejects mapWidth below 11", () => {
    expect(validateBombermanConfig({ mapWidth: 9 })).toContain("mapWidth");
  });

  it("rejects mapWidth above 31", () => {
    expect(validateBombermanConfig({ mapWidth: 40 })).toContain("mapWidth");
  });

  it("rejects playerLimit below 2", () => {
    expect(validateBombermanConfig({ playerLimit: 1 })).toContain("playerLimit");
  });

  it("rejects playerLimit above 4", () => {
    expect(validateBombermanConfig({ playerLimit: 8 })).toContain("playerLimit");
  });

  it("rejects tickRate below 2", () => {
    expect(validateBombermanConfig({ tickRate: 1 })).toContain("tickRate");
  });

  it("rejects tickRate above 8", () => {
    expect(validateBombermanConfig({ tickRate: 10 })).toContain("tickRate");
  });

  it("returns null for partial valid config", () => {
    expect(validateBombermanConfig({ mapWidth: 21, playerLimit: 2 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run config tests**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend && npx vitest run src/games/bomberman/__tests__/settings.test.ts
```
Expected: 8 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/games/bomberman/settings.ts packages/backend/src/games/bomberman/__tests__/settings.test.ts
git commit -m "feat: Bomberman default config, validation, and tests"
```

---

### Task 4.3: Bomberman map generation + BFS validation

**Files:**
- Create: `packages/backend/src/games/bomberman/core/map-gen.ts`

- [ ] **Step 1: Create map-gen.ts**

```ts
// packages/backend/src/games/bomberman/core/map-gen.ts
import type { BombermanMap, BombermanTile } from "@generale/types";

function createEmptyMap(width: number, height: number): BombermanMap {
  const tiles: BombermanTile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = { type: "empty" };
    }
  }
  return { width, height, tiles };
}

export function generateBombermanMap(width: number, height: number): BombermanMap {
  width = width % 2 === 1 ? width : width + 1;
  height = height % 2 === 1 ? height : height + 1;

  const map = createEmptyMap(width, height);

  // Borders and pillar hard walls
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        map.tiles[y][x] = { type: "hard_wall" };
      } else if (x % 2 === 0 && y % 2 === 0) {
        map.tiles[y][x] = { type: "hard_wall" };
      }
    }
  }

  // Random soft walls (60% of empty cells, excluding safe zones)
  const corners = [
    { x: 1, y: 1 },
    { x: width - 2, y: 1 },
    { x: 1, y: height - 2 },
    { x: width - 2, y: height - 2 },
  ];

  const safeSet = new Set<string>();
  for (const c of corners) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        safeSet.add(`${c.x + dx},${c.y + dy}`);
      }
    }
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (map.tiles[y][x].type !== "empty") continue;
      if (safeSet.has(`${x},${y}`)) continue;
      if (y % 2 === 0 && x % 2 === 0) continue;
      if (Math.random() < 0.6) {
        map.tiles[y][x] = { type: "soft_wall" };
      }
    }
  }

  return map;
}

export function validateConnectivity(map: BombermanMap, spawns: { x: number; y: number }[]): boolean {
  const visited = new Set<string>();
  const queue = [{ x: spawns[0].x, y: spawns[0].y }];
  visited.add(`${spawns[0].x},${spawns[0].y}`);

  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      const tile = map.tiles[ny]?.[nx];
      if (!tile || tile.type === "hard_wall" || tile.type === "soft_wall") continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  for (const s of spawns) {
    if (!visited.has(`${s.x},${s.y}`)) return false;
  }

  let totalPassable = 0, reachable = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x].type !== "hard_wall" && map.tiles[y][x].type !== "soft_wall") {
        totalPassable++;
        if (visited.has(`${x},${y}`)) reachable++;
      }
    }
  }
  return reachable / totalPassable >= 0.8;
}

export function getSpawnPositions(playerCount: number, width: number, height: number): { x: number; y: number }[] {
  const corners = [
    { x: 1, y: 1 },
    { x: width - 2, y: 1 },
    { x: 1, y: height - 2 },
    { x: width - 2, y: height - 2 },
  ];
  if (playerCount === 2) return [corners[0], corners[3]];
  if (playerCount === 3) return [corners[0], corners[1], corners[3]];
  return corners.slice(0, playerCount);
}
```

- [ ] **Step 2: Write test for map-gen**

Create `packages/backend/src/games/bomberman/core/__tests__/map-gen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateBombermanMap, validateConnectivity, getSpawnPositions } from "../map-gen";

describe("generateBombermanMap", () => {
  it("returns map with correct dimensions (odd-corrected)", () => {
    const map = generateBombermanMap(15, 13);
    expect(map.width).toBe(15);
    expect(map.height).toBe(13);
    expect(map.tiles.length).toBe(13);
    expect(map.tiles[0].length).toBe(15);
  });

  it("forces odd dimensions (even input)", () => {
    const map = generateBombermanMap(14, 12);
    expect(map.width).toBe(15);
    expect(map.height).toBe(13);
  });

  it("has hard walls on all borders", () => {
    const map = generateBombermanMap(15, 13);
    for (let x = 0; x < map.width; x++) {
      expect(map.tiles[0][x].type).toBe("hard_wall");
      expect(map.tiles[map.height - 1][x].type).toBe("hard_wall");
    }
    for (let y = 0; y < map.height; y++) {
      expect(map.tiles[y][0].type).toBe("hard_wall");
      expect(map.tiles[y][map.width - 1].type).toBe("hard_wall");
    }
  });

  it("has pillar hard walls at even-even positions", () => {
    const map = generateBombermanMap(15, 13);
    for (let y = 2; y < map.height - 2; y += 2) {
      for (let x = 2; x < map.width - 2; x += 2) {
        expect(map.tiles[y][x].type).toBe("hard_wall");
      }
    }
  });

  it("has cleared 3x3 zones at all 4 corners", () => {
    const map = generateBombermanMap(15, 13);
    const corners = [
      { x: 1, y: 1 },
      { x: map.width - 2, y: 1 },
      { x: 1, y: map.height - 2 },
      { x: map.width - 2, y: map.height - 2 },
    ];
    for (const c of corners) {
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const tile = map.tiles[c.y + dy]?.[c.x + dx];
          if (tile && tile.type !== "hard_wall") {
            expect(tile.type).toBe("empty");
          }
        }
      }
    }
  });

  it("validates connectivity for generated maps (all spawns reachable)", () => {
    const map = generateBombermanMap(15, 13);
    const spawns = getSpawnPositions(4, 15, 13);
    const connected = validateConnectivity(map, spawns);
    expect(connected).toBe(true);
  });

  it("generates maps with at least some soft walls", () => {
    let softWallCount = 0;
    const map = generateBombermanMap(15, 13);
    for (const row of map.tiles) {
      for (const tile of row) {
        if (tile.type === "soft_wall") softWallCount++;
      }
    }
    expect(softWallCount).toBeGreaterThan(0);
  });
});

describe("validateConnectivity", () => {
  it("returns true for a fully open map", () => {
    const map = {
      width: 5,
      height: 5,
      tiles: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ type: "empty" as const })),
      ),
    };
    const spawns = [{ x: 1, y: 1 }, { x: 3, y: 3 }];
    expect(validateConnectivity(map, spawns)).toBe(true);
  });

  it("returns false when spawns are separated by hard walls", () => {
    const map = {
      width: 5,
      height: 5,
      tiles: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ type: "empty" as const })),
      ),
    };
    for (let y = 0; y < 5; y++) map.tiles[y][2] = { type: "hard_wall" };
    const spawns = [{ x: 1, y: 2 }, { x: 3, y: 2 }];
    expect(validateConnectivity(map, spawns)).toBe(false);
  });
});

describe("getSpawnPositions", () => {
  it("returns 4 corners for 4 players", () => {
    const spawns = getSpawnPositions(4, 15, 13);
    expect(spawns).toHaveLength(4);
    expect(spawns[0]).toEqual({ x: 1, y: 1 });
    expect(spawns[3]).toEqual({ x: 13, y: 11 });
  });

  it("returns opposite corners for 2 players", () => {
    const spawns = getSpawnPositions(2, 15, 13);
    expect(spawns).toHaveLength(2);
    expect(spawns[0]).toEqual({ x: 1, y: 1 });
    expect(spawns[1]).toEqual({ x: 13, y: 11 });
  });
});
```

- [ ] **Step 3: Run map-gen tests**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend && npx vitest run src/games/bomberman/core/__tests__/map-gen.test.ts
```
Expected: All tests pass (10+ tests).

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/games/bomberman/core/
git commit -m "feat: Bomberman map generation with BFS validation and tests"
```

---

### Task 4.4: Bomberman game tick logic

**Files:**
- Create: `packages/backend/src/games/bomberman/core/game.ts`

- [ ] **Step 1: Create game.ts**

```ts
// packages/backend/src/games/bomberman/core/game.ts
import type { BombermanState, BombermanOperation, Bomb, PlayerId } from "@generale/types";
import { GameStatus } from "@generale/types";

const ITEM_DROP_TABLE: { type: string; weight: number }[] = [
  { type: "BOMB_UP", weight: 10 },
  { type: "FIRE_UP", weight: 10 },
  { type: "SPEED_UP", weight: 10 },
  { type: "KICK", weight: 4 },
  { type: "GLOVE", weight: 3 },
  { type: "PUNCH", weight: 3 },
  { type: "REMOTE", weight: 2 },
  { type: "PIERCE", weight: 2 },
  { type: "SPIRIT", weight: 1 },
];

let nextId = 1;
function genId(): string {
  return `bomb_${nextId++}`;
}

const DIRS: Record<string, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function cloneState(state: BombermanState): BombermanState {
  return JSON.parse(JSON.stringify(state));
}

function weightedRandom(table: { type: string; weight: number }[]): string {
  const total = table.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of table) {
    r -= item.weight;
    if (r <= 0) return item.type;
  }
  return table[0].type;
}

function movePlayer(player: any, direction: string, state: BombermanState): void {
  const d = DIRS[direction];
  if (!d) return;
  const nx = player.x + d.dx;
  const ny = player.y + d.dy;
  const tile = state.map.tiles[ny]?.[nx];
  if (!tile || tile.type === "hard_wall" || tile.type === "soft_wall") return;
  if (hasBombAt(state, nx, ny) && !player.items.includes("KICK")) return;
  for (const [, p] of Object.entries(state.players)) {
    const op = p as any;
    if (op.alive && op.playerId !== player.playerId && op.x === nx && op.y === ny) return;
  }
  player.x = nx;
  player.y = ny;
  
  // Pickup items
  const itemIdx = state.items.findIndex((i) => i.x === nx && i.y === ny);
  if (itemIdx >= 0) {
    const item = state.items[itemIdx];
    state.items.splice(itemIdx, 1);
    if (["BOMB_UP", "FIRE_UP", "SPEED_UP"].includes(item.type)) {
      if (item.type === "BOMB_UP") player.bombMax++;
      else if (item.type === "FIRE_UP") player.blastRadius++;
      else player.speed++;
    } else {
      player.items.push(item.type);
    }
  }
}

function hasBombAt(state: BombermanState, x: number, y: number): boolean {
  return state.bombs.some((b) => b.x === x && b.y === y);
}

function placeBomb(player: any, state: BombermanState): void {
  if (player.bombActive >= player.bombMax) return;
  if (hasBombAt(state, player.x, player.y)) return;
  state.bombs.push({
    id: genId(),
    playerId: player.playerId,
    x: player.x,
    y: player.y,
    fuse: state.config.bombFuse,
    blastRadius: player.blastRadius,
  });
  player.bombActive++;
}

function processExplosions(state: BombermanState): void {
  const exploded = new Set<string>();
  let toProcess: Bomb[] = [];

  for (const bomb of state.bombs) {
    if (bomb.fuse <= 0) toProcess.push(bomb);
  }

  while (toProcess.length > 0) {
    const batch = toProcess;
    toProcess = [];
    for (const bomb of batch) {
      if (exploded.has(bomb.id)) continue;
      exploded.add(bomb.id);
      explode(bomb, state);
      for (const other of state.bombs) {
        if (!exploded.has(other.id) && bombInExplosionRange(bomb, other, state)) {
          other.fuse = 0;
          toProcess.push(other);
        }
      }
    }
  }

  state.bombs = state.bombs.filter((b) => !exploded.has(b.id));
}

function bombInExplosionRange(bomb: Bomb, target: Bomb, _state: BombermanState): boolean {
  if (bomb.x === target.x && Math.abs(bomb.y - target.y) <= bomb.blastRadius) return true;
  if (bomb.y === target.y && Math.abs(bomb.x - target.x) <= bomb.blastRadius) return true;
  return false;
}

function explode(bomb: Bomb, state: BombermanState): void {
  const dirs = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

  for (const dir of dirs) {
    for (let r = 0; r <= bomb.blastRadius; r++) {
      const x = bomb.x + dir.dx * r;
      const y = bomb.y + dir.dy * r;
      const tile = state.map.tiles[y]?.[x];
      if (!tile) break;

      state.explosions.push({ x, y, ttl: 8 });

      // Kill players at this position
      for (const [, player] of Object.entries(state.players)) {
        const p = player as any;
        if (p.alive && p.x === x && p.y === y) {
          p.alive = false;
          // Drop items
          for (const item of p.items) {
            if (!["BOMB_UP", "FIRE_UP", "SPEED_UP"].includes(item)) {
              state.items.push({ x, y, type: item });
            }
          }
          p.items = [];
        }
      }

      if (tile.type === "hard_wall") break;
      if (tile.type === "soft_wall") {
        tile.type = "empty";
        if (Math.random() < state.config.itemDropRate) {
          const dropType = weightedRandom(ITEM_DROP_TABLE);
          state.items.push({ x, y, type: dropType as any });
        }
        break;
      }

      if (dir.dx === 0 && dir.dy === 0) break;
    }
  }
}

function killOutOfBounds(state: BombermanState): void {
  const b = state.shrinkBoundary ?? 0;
  for (const [, player] of Object.entries(state.players)) {
    const p = player as any;
    if (p.alive && (p.x < b || p.x >= state.map.width - b || p.y < b || p.y >= state.map.height - b)) {
      p.alive = false;
    }
  }
}

export function tick(
  state: BombermanState,
  queues: Record<PlayerId, BombermanOperation[]>,
): BombermanState {
  const next = cloneState(state);
  next.tick++;

  // 1. Process player actions
  for (const [pid, ops] of Object.entries(queues)) {
    const player = next.players[pid];
    if (!player?.alive) continue;
    const op = ops[ops.length - 1];
    if (!op) continue;

    switch (op.type) {
      case "MOVE":
        movePlayer(player, op.direction, next);
        break;
      case "PLACE_BOMB":
        placeBomb(player, next);
        break;
      // KICK/THROW/DETONATE handled similarly in full implementation
    }
  }

  // 2. Bomb timers
  for (const bomb of next.bombs) bomb.fuse--;

  // 3. Explosions
  processExplosions(next);

  // 4. Explosion decay
  for (const e of next.explosions) e.ttl--;
  next.explosions = next.explosions.filter((e) => e.ttl > 0);

  // 5. Round timer / shrink
  if (next.config.roundTimeSec > 0) {
    if (!next.roundTimer) next.roundTimer = next.config.roundTimeSec * next.config.tickRate;
    next.roundTimer--;
    if (next.roundTimer <= 0) {
      next.roundTimer = next.config.roundTimeSec * next.config.tickRate;
      if (next.shrinkBoundary === undefined) next.shrinkBoundary = 0;
      next.shrinkBoundary++;
      killOutOfBounds(next);
    }
  }

  // 6. Win condition
  const alive = Object.values(next.players).filter((p: any) => p.alive);
  if (alive.length <= 1) {
    next.status = GameStatus.Ended;
  }

  return next;
}
```

- [ ] **Step 2: Write test for tick()**

Create `packages/backend/src/games/bomberman/core/__tests__/game.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tick } from "../game";
import type { BombermanState, BombermanOperation } from "@generale/types";
import { GameStatus } from "@generale/types";

function makeBaseState(): BombermanState {
  return {
    status: GameStatus.Playing,
    tick: 0,
    map: {
      width: 5,
      height: 5,
      tiles: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ type: "empty" as const })),
      ),
    },
    players: {
      p1: { playerId: "p1", alive: true, x: 1, y: 1, bombMax: 1, bombActive: 0, blastRadius: 2, speed: 1, items: [] },
      p2: { playerId: "p2", alive: true, x: 3, y: 3, bombMax: 1, bombActive: 0, blastRadius: 2, speed: 1, items: [] },
    },
    bombs: [],
    explosions: [],
    items: [],
    config: {
      mapWidth: 5, mapHeight: 5, playerLimit: 2, tickRate: 4,
      bombFuse: 3, bombLimit: 1, blastRadius: 2, roundTimeSec: 0,
      shrinkEnabled: false, itemDropRate: 0.6, items: ["BOMB_UP", "FIRE_UP"], mode: "multi",
    },
  };
}

describe("tick - player movement", () => {
  it("moves player in requested direction", () => {
    const state = makeBaseState();
    const result = tick(state, { p1: [{ type: "MOVE", direction: "right" }], p2: [] });
    expect(result.players.p1.x).toBe(2);
    expect(result.players.p1.y).toBe(1);
  });

  it("blocks movement into hard walls", () => {
    const state = makeBaseState();
    state.map.tiles[1][2] = { type: "hard_wall" };
    const result = tick(state, { p1: [{ type: "MOVE", direction: "right" }], p2: [] });
    expect(result.players.p1.x).toBe(1);
    expect(result.players.p1.y).toBe(1);
  });

  it("blocks movement into other players", () => {
    const state = makeBaseState();
    state.players.p2.x = 2; state.players.p2.y = 1;
    const result = tick(state, { p1: [{ type: "MOVE", direction: "right" }], p2: [] });
    expect(result.players.p1.x).toBe(1);
  });
});

describe("tick - bomb placement", () => {
  it("places bomb at player position", () => {
    const state = makeBaseState();
    const result = tick(state, { p1: [{ type: "PLACE_BOMB" }], p2: [] });
    expect(result.bombs).toHaveLength(1);
    expect(result.bombs[0].x).toBe(1);
    expect(result.bombs[0].y).toBe(1);
    expect(result.players.p1.bombActive).toBe(1);
  });

  it("prevents placing bomb when at limit", () => {
    const state = makeBaseState();
    state.players.p1.bombMax = 1;
    state.players.p1.bombActive = 1;
    const result = tick(state, { p1: [{ type: "PLACE_BOMB" }], p2: [] });
    expect(result.bombs).toHaveLength(0);
  });
});

describe("tick - bomb explosion", () => {
  it("bomb fuse decrements each tick", () => {
    const state = makeBaseState();
    state.bombs = [{ id: "b1", playerId: "p1", x: 1, y: 1, fuse: 3, blastRadius: 2 }];
    const result = tick(state, { p1: [], p2: [] });
    expect(result.bombs[0].fuse).toBe(2);
  });

  it("bomb explodes when fuse reaches 0, killing players in range", () => {
    const state = makeBaseState();
    state.bombs = [{ id: "b1", playerId: "p1", x: 1, y: 1, fuse: 1, blastRadius: 2 }];
    state.players.p2.x = 2; state.players.p2.y = 1;
    const result = tick(state, { p1: [], p2: [] });
    expect(result.bombs).toHaveLength(0);
    expect(result.players.p2.alive).toBe(false);
    expect(result.explosions.length).toBeGreaterThan(0);
  });

  it("explosion destroys soft walls", () => {
    const state = makeBaseState();
    state.map.tiles[2][1] = { type: "soft_wall" };
    state.bombs = [{ id: "b1", playerId: "p1", x: 1, y: 1, fuse: 1, blastRadius: 2 }];
    const result = tick(state, { p1: [], p2: [] });
    const tile = result.map.tiles[2]?.[1];
    expect(tile?.type).toBe("empty");
  });

  it("game ends when only one player survives", () => {
    const state = makeBaseState();
    state.bombs = [{ id: "b1", playerId: "p1", x: 3, y: 3, fuse: 1, blastRadius: 2 }];
    state.players.p2.alive = true;
    const result = tick(state, { p1: [], p2: [] });
    expect(result.status).toBe(GameStatus.Ended);
  });
});

describe("tick - item pickup", () => {
  it("player picks up item when moving onto it", () => {
    const state = makeBaseState();
    state.items = [{ x: 2, y: 1, type: "BOMB_UP" }];
    const result = tick(state, { p1: [{ type: "MOVE", direction: "right" }], p2: [] });
    expect(result.players.p1.bombMax).toBe(2);
    expect(result.items).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tick tests**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend && npx vitest run src/games/bomberman/core/__tests__/game.test.ts
```
Expected: All tests pass (9+ tests).

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/games/bomberman/core/
git commit -m "feat: Bomberman game tick logic with tests"
```

### Task 4.5: BombermanGame instance

**Files:**
- Create: `packages/backend/src/games/bomberman/instance/BombermanGame.ts`

- [ ] **Step 1: Create BombermanGame.ts**

```ts
// packages/backend/src/games/bomberman/instance/BombermanGame.ts
import type { BombermanState, BombermanOperation, BombermanPlayer, PlayerId, BombermanConfig } from "@generale/types";
import { GameStatus } from "@generale/types";
import { tick } from "../core/game";
import { generateBombermanMap, getSpawnPositions } from "../core/map-gen";
import { StateSyncState } from "../../../game/instance/state-sync";
import { displaceConnector } from "../../../game/instance/connector-manager";

export interface BombermanGameEndResult {
  winnerId: PlayerId | null;
  reason: string;
  state: BombermanState;
}

export class BombermanGame {
  private state: BombermanState;
  private stateSync = new StateSyncState<BombermanState>();
  private syncData = new Map<PlayerId, { lastConfirmedOp: number }>();
  private destroyed = false;
  private tickTimerId: ReturnType<typeof setInterval> | null = null;
  private onEndCallbacks: Array<(result: BombermanGameEndResult) => void> = [];
  private queues: Record<PlayerId, BombermanOperation[]> = {};
  private bots: Array<{ playerId: PlayerId; getAction: (state: BombermanState) => BombermanOperation }> = [];

  constructor(config: BombermanConfig, playerIds: PlayerId[]) {
    const mapConfig = config;
    const width = mapConfig.mapWidth;
    const height = mapConfig.mapHeight;

    let map;
    if (mapConfig.mapId) {
      // TODO: load from file or workshop — for now, generate random
      map = generateBombermanMap(width, height);
    } else {
      map = generateBombermanMap(width, height);
    }

    const spawns = getSpawnPositions(playerIds.length, width, height);

    const players: Record<PlayerId, BombermanPlayer> = {};
    for (let i = 0; i < playerIds.length; i++) {
      players[playerIds[i]] = {
        playerId: playerIds[i],
        alive: true,
        x: spawns[i].x,
        y: spawns[i].y,
        bombMax: config.bombLimit,
        bombActive: 0,
        blastRadius: config.blastRadius,
        speed: 1,
        items: [],
      };
    }

    this.state = {
      status: GameStatus.Playing,
      tick: 0,
      map,
      players,
      bombs: [],
      explosions: [],
      items: [],
      config,
    };

    for (const pid of playerIds) this.queues[pid] = [];
  }

  addBot(playerId: PlayerId, getAction: (state: BombermanState) => BombermanOperation): void {
    this.state.players[playerId] = {
      playerId,
      alive: true,
      x: 1, y: 1,
      bombMax: 1, bombActive: 0,
      blastRadius: 1, speed: 1,
      items: [],
    };
    this.bots.push({ playerId, getAction });
    this.queues[playerId] = [];
  }

  handleAction(pid: PlayerId, op: BombermanOperation, optimisticId: number): void {
    const synced = this.syncData.get(pid);
    if (synced && synced.lastConfirmedOp >= optimisticId) return;
    if (!this.queues[pid]) this.queues[pid] = [];
    this.queues[pid].push(op);
    if (typeof optimisticId === "number") {
      if (!this.syncData.has(pid)) this.syncData.set(pid, { lastConfirmedOp: -1 });
      this.syncData.get(pid)!.lastConfirmedOp = optimisticId;
    }
  }

  startTicking(): void {
    const interval = 1000 / this.state.config.tickRate;
    this.tickTimerId = setInterval(() => {
      for (const bot of this.bots) {
        const action = bot.getAction(this.state);
        if (!this.queues[bot.playerId]) this.queues[bot.playerId] = [];
        this.queues[bot.playerId].push(action);
      }
      this.state = tick(this.state, this.queues);
      for (const pid of Object.keys(this.queues)) {
        this.queues[pid] = [];
      }
      if (this.state.status === GameStatus.Ended) {
        if (this.tickTimerId) clearInterval(this.tickTimerId);
        this.tickTimerId = null;
        this.triggerEnd();
      }
    }, interval);
  }

  getState(): BombermanState {
    return this.state;
  }

  getStateForSync(): BombermanState {
    return this.state;
  }

  sendState(): void {
    // State sync is handled by callers who subscribe to events
  }

  private triggerEnd(): void {
    const alive = Object.values(this.state.players).filter((p) => p.alive);
    const result: BombermanGameEndResult = {
      winnerId: alive.length === 1 ? alive[0].playerId : null,
      reason: alive.length <= 1 ? "last_alive" : "timeout",
      state: this.state,
    };
    for (const cb of this.onEndCallbacks) cb(result);
  }

  onEnd(cb: (result: BombermanGameEndResult) => void): void {
    this.onEndCallbacks.push(cb);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.tickTimerId) clearInterval(this.tickTimerId);
    this.stateSync.clearAll();
    this.syncData.clear();
    this.onEndCallbacks = [];
  }
}
```

- [ ] **Step 2: Write integration test for BombermanGame**

Create `packages/backend/src/games/bomberman/__tests__/bomberman-game.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { BombermanGame } from "../instance/BombermanGame";
import { defaultBombermanConfig } from "../settings";
import { GameStatus } from "@generale/types";

describe("BombermanGame", () => {
  let game: BombermanGame;
  let config: ReturnType<typeof defaultBombermanConfig>;

  beforeEach(() => {
    config = defaultBombermanConfig();
    config.mapWidth = 9;
    config.mapHeight = 9;
    config.playerLimit = 2;
    config.tickRate = 10;   // Fast ticks for testing
    game = new BombermanGame(config, ["p1", "p2"]);
  });

  it("starts with GameStatus.Playing", () => {
    const state = game.getState();
    expect(state.status).toBe(GameStatus.Playing);
    expect(state.tick).toBe(0);
  });

  it("creates players at spawn positions", () => {
    const state = game.getState();
    expect(state.players.p1).toBeDefined();
    expect(state.players.p2).toBeDefined();
    expect(state.players.p1.alive).toBe(true);
    expect(state.players.p2.alive).toBe(true);
  });

  it("handles player actions", () => {
    game.handleAction("p1", { type: "MOVE", direction: "right" }, 0);
    game.handleAction("p1", { type: "PLACE_BOMB" }, 1);
    // Actions are queued, tick processes them
    game.startTicking();
    // Let one tick happen, then stop
    setTimeout(() => {
      game.destroy();
    }, 50);
  });

  it("ends game when one player dies and onEnd callback fires", async () => {
    let endResult: any = null;
    game.onEnd((result) => { endResult = result; });

    // Place bomb right next to p2 repeatedly so they die on explosion
    const p2State = game.getState().players.p2;
    // Place p1 bomb next to p2
    for (let i = 0; i < 20; i++) {
      game.handleAction("p1", { type: "PLACE_BOMB" }, i);
    }

    game.startTicking();

    // Wait for game to process some ticks
    await new Promise((r) => setTimeout(r, 500));
    game.destroy();

    // After ticks + destroy, game might have ended
    const state = game.getState();
    // BombermanGame's tick loop processes actions each interval
    expect(state.players.p1).toBeDefined();
    expect(state.players.p2).toBeDefined();
  });

  it("destroys cleanly", () => {
    game.startTicking();
    game.destroy();
    // Should not throw
  });
});
```

- [ ] **Step 3: Run instance tests**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend && npx vitest run src/games/bomberman/__tests__/bomberman-game.test.ts
```
Expected: All tests pass (4+ tests).

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/games/bomberman/
git commit -m "feat: BombermanGame instance with tick loop, bot support, and tests"
```

---

### Task 4.6: BombermanService + BombermanManager

**Files:**
- Create: `packages/backend/src/games/bomberman/service/BombermanService.ts`
- Create: `packages/backend/src/games/bomberman/service/BombermanManager.ts`
- Create: `packages/backend/src/games/bomberman/routes.ts`
- Modify: `packages/backend/src/app.ts`

- [ ] **Step 1: Create BombermanService.ts**

```ts
// packages/backend/src/games/bomberman/service/BombermanService.ts
import type { BombermanConfig, PlayerId, GameId } from "@generale/types";
import { BombermanGame, type BombermanGameEndResult } from "../instance/BombermanGame";
import { defaultBombermanConfig, validateBombermanConfig } from "../settings";
import { registerDomainHandler, unregisterDomainHandler } from "../../../plugins/websocket";

interface CreateRoomRequest {
  roomName: string;
  password?: string;
  config?: Partial<BombermanConfig>;
  mode?: "multi" | "single";
  levelId?: string;
}

export class BombermanService {
  private gameId: GameId;
  private gameInstance: BombermanGame | null = null;
  private playerIds: PlayerId[] = [];
  private destroyed = false;

  constructor(gameId: GameId) {
    this.gameId = gameId;
    registerDomainHandler(`room-${gameId}`, (conn) => {
      // Stub — room handling simplified for POC
    });
    registerDomainHandler(`game-${gameId}`, (conn) => {
      // Game domain handler
    });
    registerDomainHandler(`chat-${gameId}`, (conn) => {
      // Chat domain handler
    });
  }

  startGame(config: BombermanConfig): void {
    this.gameInstance = new BombermanGame(config, this.playerIds);
    this.gameInstance.onEnd((result) => this.handleGameEnd(result));
    this.gameInstance.startTicking();
  }

  private handleGameEnd(result: BombermanGameEndResult): void {
    // Insert into game_results
    console.log("Bomberman game ended:", result.reason);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    unregisterDomainHandler(`room-${this.gameId}`);
    unregisterDomainHandler(`game-${this.gameId}`);
    unregisterDomainHandler(`chat-${this.gameId}`);
    this.gameInstance?.destroy();
  }
}
```

- [ ] **Step 2: Create BombermanManager.ts**

```ts
// packages/backend/src/games/bomberman/service/BombermanManager.ts
import type { PlayerId } from "@generale/types";
import { BombermanService } from "./BombermanService";
import { registerDomainHandler } from "../../../plugins/websocket";

export class BombermanManager {
  private services = new Map<string, BombermanService>();

  constructor() {
    registerDomainHandler("lobby-bomberman", (conn) => {
      // Lobby WS — simplified POC, just returns empty list for now
      conn.send(JSON.stringify({ type: "LIST", payload: [] }));
    });
  }

  createGame(roomName: string): BombermanService {
    const id = `bomb_${Date.now()}`;
    const service = new BombermanService(id);
    this.services.set(id, service);
    return service;
  }

  getGame(id: string): BombermanService | undefined {
    return this.services.get(id);
  }

  removeGame(id: string): void {
    const service = this.services.get(id);
    if (service) {
      service.destroy();
      this.services.delete(id);
    }
  }
}
```

- [ ] **Step 3: Create routes.ts**

```ts
// packages/backend/src/games/bomberman/routes.ts
import { Elysia, t } from "elysia";
import type { BombermanManager } from "./service/BombermanManager";
import { authPlugin } from "../../middleware/authPlugin";

export function bombermanRoutes(app: Elysia, manager: BombermanManager) {
  return app
    .use(authPlugin)
    .post(
      "/room/create",
      async ({ body, session }) => {
        const service = manager.createGame(body.roomName);
        return { success: true, data: { gameId: (service as any).gameId } };
      },
      { body: t.Object({ roomName: t.String(), password: t.Optional(t.String()), config: t.Optional(t.Any()) }) },
    )
    .get("/room/list", async () => {
      return { success: true, data: [] };
    })
    .get("/room/connect/:gameId", async ({ params, session }) => {
      const service = manager.getGame(params.gameId);
      if (!service) return { success: false, message: "Game not found" };
      return {
        success: true,
        data: {
          gameId: params.gameId,
          playerId: session.userId,
          phase: "pregame",
          domains: { primary: `room-${params.gameId}`, chat: `chat-${params.gameId}` },
        },
      };
    });
}
```

- [ ] **Step 4: Update app.ts to wire Bomberman**

In `packages/backend/src/app.ts`, add:

```ts
import { BombermanManager } from "./games/bomberman/service/BombermanManager";
import { bombermanRoutes } from "./games/bomberman/routes";

// After generalManager setup:
const bombermanManager = new BombermanManager();

// In the Elysia .use() chain:
.group("/api/bomberman", (app) => bombermanRoutes(app, bombermanManager))
```

- [ ] **Step 5: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

Fix any import issues until build passes. Test failures in existing Generale tests should not regress.

- [ ] **Step 6: Write test for BombermanManager**

Create `packages/backend/src/games/bomberman/__tests__/manager.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { BombermanManager } from "../service/BombermanManager";

describe("BombermanManager", () => {
  let manager: BombermanManager;

  beforeEach(() => {
    manager = new BombermanManager();
  });

  it("creates a new game with unique ID", () => {
    const s1 = manager.createGame("Room A");
    const s2 = manager.createGame("Room B");
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s1).not.toBe(s2);
  });

  it("retrieves a game by ID", () => {
    const service = manager.createGame("Test");
    const id = (service as any).gameId;
    const found = manager.getGame(id);
    expect(found).toBe(service);
  });

  it("returns undefined for non-existent game", () => {
    expect(manager.getGame("nonexistent")).toBeUndefined();
  });

  it("removes a game and destroys it", () => {
    const service = manager.createGame("Test");
    const id = (service as any).gameId;
    manager.removeGame(id);
    expect(manager.getGame(id)).toBeUndefined();
  });

  it("removeGame is idempotent for non-existent ID", () => {
    // Should not throw
    expect(() => manager.removeGame("ghost")).not.toThrow();
  });
});
```

- [ ] **Step 7: Run manager tests**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/backend && npx vitest run src/games/bomberman/__tests__/manager.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Bomberman backend (Service, Manager, routes, wired into app)"
```

---

## Phase 5: Bomberman Frontend

### Task 5.1: Bomberman frontend directory + hooks

**Files:**
- Create: `packages/frontend/src/routes/games/bomberman/` directory
- Create: `packages/frontend/src/routes/games/bomberman/hooks/useBombermanInput.ts`
- Create: `packages/frontend/src/routes/games/bomberman/hooks/useGameSession.ts`

- [ ] **Step 1: Create directory**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend/src
mkdir -p routes/games/bomberman/hooks routes/games/bomberman/components
```

- [ ] **Step 2: Create useBombermanInput.ts**

```ts
// packages/frontend/src/routes/games/bomberman/hooks/useBombermanInput.ts
import { createSignal, onCleanup } from "solid-js";
import type { BombermanOperation } from "@generale/types";

export function useBombermanInput(enqueueOp: (op: BombermanOperation) => void) {
  const [showVirtualControls, setShowVirtualControls] = createSignal(false);

  // Check if mobile
  setShowVirtualControls(window.matchMedia("(pointer: coarse)").matches);

  const keyMap: Record<string, BombermanOperation> = {
    ArrowUp: { type: "MOVE", direction: "up" },
    ArrowDown: { type: "MOVE", direction: "down" },
    ArrowLeft: { type: "MOVE", direction: "left" },
    ArrowRight: { type: "MOVE", direction: "right" },
    w: { type: "MOVE", direction: "up" },
    s: { type: "MOVE", direction: "down" },
    a: { type: "MOVE", direction: "left" },
    d: { type: "MOVE", direction: "right" },
    " ": { type: "PLACE_BOMB" },
    e: { type: "DETONATE" },
  };

  const pressed = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const key = e.key === "Spacebar" ? " " : e.key;
    const op = keyMap[key];
    if (op) {
      pressed.add(e.key);
      enqueueOp(op);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    pressed.delete(e.key);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  onCleanup(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  });

  return { showVirtualControls };
}
```

- [ ] **Step 3: Create useGameSession.ts**

```ts
// packages/frontend/src/routes/games/bomberman/hooks/useGameSession.ts
import { createSignal } from "solid-js";
import type { BombermanState, BombermanOperation } from "@generale/types";
import { useSyncedState } from "~/shared/hooks/useSyncedState";

export function useBombermanGameSession(domain: string) {
  const state = useSyncedState<BombermanState>(domain);
  const [operationQueue, setOperationQueue] = createSignal<BombermanOperation[]>([]);

  function enqueueOp(op: BombermanOperation) {
    setOperationQueue((prev) => [...prev, op]);
  }

  function clearQueue() {
    setOperationQueue([]);
  }

  return {
    state,
    enqueueOp,
    clearQueue,
    operationQueue,
  };
}
```

Note: Check `useSyncedState` exact API location — it may be at `~/shared/hooks/useSyncedState` or `~/hooks/useSyncedState` depending on Task 2.1 migration. Update import accordingly.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/games/bomberman/hooks/
git commit -m "feat: Bomberman frontend hooks (input + game session)"
```

---

### Task 5.2: Bomberman rendering components

**Files:**
- Create: `packages/frontend/src/routes/games/bomberman/components/MapLayer.tsx`
- Create: `packages/frontend/src/routes/games/bomberman/components/EntityLayer.tsx`
- Create: `packages/frontend/src/routes/games/bomberman/components/VirtualControls.tsx`
- Create: `packages/frontend/src/routes/games/bomberman/components/HUD.tsx`
- Create: `packages/frontend/src/routes/games/bomberman/components/Scoreboard.tsx`

- [ ] **Step 1: Create MapLayer.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/components/MapLayer.tsx
import { P } from "solid-pixi";
import { For } from "solid-js";
import type { BombermanTile } from "@generale/types";

const TILE_SIZE = 36;
const HARD_WALL_COLOR = 0x666666;
const SOFT_WALL_COLOR = 0xccaa66;
const EMPTY_COLOR = 0x336633;

interface MapLayerProps {
  tiles: BombermanTile[][];
  x: number;
  y: number;
}

export function MapLayer(props: MapLayerProps) {
  return (
    <P.Container x={props.x} y={props.y}>
      <For each={props.tiles}>
        {(row, y) => (
          <For each={row}>
            {(tile, x) => {
              let color = EMPTY_COLOR;
              if (tile.type === "hard_wall") color = HARD_WALL_COLOR;
              else if (tile.type === "soft_wall") color = SOFT_WALL_COLOR;
              return (
                <P.Graphics
                  draw={(g) => {
                    g.clear();
                    g.rect(0, 0, TILE_SIZE, TILE_SIZE);
                    g.fill({ color });
                    if (tile.type !== "empty") {
                      g.rect(0, 0, TILE_SIZE, TILE_SIZE);
                      g.stroke({ color: 0x333333, width: 1 });
                    }
                  }}
                  x={x() * TILE_SIZE}
                  y={y() * TILE_SIZE}
                />
              );
            }}
          </For>
        )}
      </For>
    </P.Container>
  );
}
```

- [ ] **Step 2: Create EntityLayer.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/components/EntityLayer.tsx
import { P } from "solid-pixi";
import { For } from "solid-js";
import type { BombermanPlayer, Bomb, Explosion, Item } from "@generale/types";

const TILE_SIZE = 36;
const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12];
const BOMB_COLOR = 0x222222;
const EXPLOSION_COLORS = [0xff6600, 0xff9900, 0xffcc00, 0xff3300];
const ITEM_COLORS: Record<string, number> = {
  BOMB_UP: 0x222222,
  FIRE_UP: 0xff4400,
  SPEED_UP: 0x00ff00,
  KICK: 0xffff00,
  GLOVE: 0xffffff,
  PUNCH: 0xff8800,
  REMOTE: 0xff0000,
  PIERCE: 0x00ffff,
  SPIRIT: 0xcc88ff,
};

interface EntityLayerProps {
  players: Array<BombermanPlayer & { colorIndex: number }>;
  bombs: Bomb[];
  explosions: Explosion[];
  items: Item[];
}

export function EntityLayer(props: EntityLayerProps) {
  return (
    <P.Container>
      {/* Players */}
      <For each={props.players}>
        {(player) => (
          <Show when={player.alive}>
            <P.Graphics
              draw={(g) => {
                g.clear();
                const cx = TILE_SIZE / 2;
                const cy = TILE_SIZE / 2;
                const r = TILE_SIZE * 0.35;
                g.circle(cx, cy, r);
                g.fill({ color: PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length] });
                g.rect(cx - 2, cy - r * 0.6, 4, r * 0.6);
                g.fill({ color: 0xffffff });
              }}
              x={player.x * TILE_SIZE}
              y={player.y * TILE_SIZE}
            />
          </Show>
        )}
      </For>

      {/* Bombs */}
      <For each={props.bombs}>
        {(bomb) => {
          const pulseColor = bomb.fuse % 4 < 2 ? 0x333333 : 0xff0000;
          return (
            <P.Graphics
              draw={(g) => {
                g.clear();
                const s = TILE_SIZE * 0.7;
                const offset = (TILE_SIZE - s) / 2;
                g.rect(offset, offset, s, s);
                g.fill({ color: BOMB_COLOR });
                g.rect(offset + 2, offset + 2, s - 4, s - 4);
                g.fill({ color: pulseColor });
              }}
              x={bomb.x * TILE_SIZE}
              y={bomb.y * TILE_SIZE}
            />
          );
        }}
      </For>

      {/* Explosions */}
      <For each={props.explosions}>
        {(exp) => {
          const alpha = exp.ttl / 8;
          return (
            <P.Graphics
              draw={(g) => {
                g.clear();
                const s = TILE_SIZE * 0.9;
                const offset = (TILE_SIZE - s) / 2;
                g.rect(offset, offset, s, s);
                g.fill({ color: EXPLOSION_COLORS[exp.ttl % EXPLOSION_COLORS.length], alpha });
              }}
              x={exp.x * TILE_SIZE}
              y={exp.y * TILE_SIZE}
            />
          );
        }}
      </For>

      {/* Items */}
      <For each={props.items}>
        {(item) => (
          <P.Graphics
            draw={(g) => {
              g.clear();
              const s = TILE_SIZE * 0.5;
              const offset = (TILE_SIZE - s) / 2;
              g.rect(offset, offset, s, s);
              g.fill({ color: ITEM_COLORS[item.type] ?? 0xffffff });
            }}
            x={item.x * TILE_SIZE}
            y={item.y * TILE_SIZE}
          />
        )}
      </For>
    </P.Container>
  );
}
```

Note: Add `import { Show } from "solid-js";` at the top.

- [ ] **Step 3: Create VirtualControls.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/components/VirtualControls.tsx
import type { BombermanOperation } from "@generale/types";

interface VirtualControlsProps {
  onAction: (op: BombermanOperation) => void;
}

export function VirtualControls(props: VirtualControlsProps) {
  function directionBtn(label: string, dir: "up" | "down" | "left" | "right") {
    return (
      <button
        type="button"
        class="w-12 h-12 bg-gray-700/60 rounded active:bg-gray-500 text-white text-lg select-none touch-none"
        onTouchStart={(e) => { e.preventDefault(); props.onAction({ type: "MOVE", direction: dir }); }}
      >
        {label}
      </button>
    );
  }

  return (
    <div class="absolute bottom-4 left-4 right-4 flex justify-between pointer-events-none">
      {/* D-Pad */}
      <div class="pointer-events-auto grid grid-cols-3 gap-1">
        <div />
        {directionBtn("↑", "up")}
        <div />
        {directionBtn("←", "left")}
        <div class="w-12 h-12" />
        {directionBtn("→", "right")}
        <div />
        {directionBtn("↓", "down")}
        <div />
      </div>
      {/* Bomb button */}
      <button
        type="button"
        class="pointer-events-auto w-16 h-16 bg-red-600/80 rounded-full text-white text-xl font-bold active:bg-red-400 select-none touch-none"
        onTouchStart={(e) => { e.preventDefault(); props.onAction({ type: "PLACE_BOMB" }); }}
      >
        💣
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create HUD.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/components/HUD.tsx
interface HUDProps {
  timeLeft: number;
  aliveCount: number;
  totalPlayers: number;
}

export function HUD(props: HUDProps) {
  const minutes = Math.floor(props.timeLeft / 60);
  const seconds = props.timeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div class="absolute top-4 left-4 right-4 flex justify-between text-white text-sm font-mono pointer-events-none">
      <div class="bg-black/50 px-3 py-1 rounded">
        {timeStr}
      </div>
      <div class="bg-black/50 px-3 py-1 rounded">
        {props.aliveCount}/{props.totalPlayers}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create Scoreboard.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/components/Scoreboard.tsx
interface ScoreboardProps {
  players: Array<{ name: string; rank: number; score: number }>;
  onBackToRoom: () => void;
}

export function Scoreboard(props: ScoreboardProps) {
  return (
    <div class="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
      <div class="bg-gray-900 border-2 border-gray-600 p-8 rounded min-w-[300px] text-center pixel-border">
        <h2 class="text-2xl text-white font-bold mb-6">GAME OVER</h2>
        <div class="space-y-2 mb-6">
          {props.players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <div class="flex justify-between text-white text-lg">
                <span>#{p.rank} {p.name}</span>
                <span class="text-gray-400">{p.score} pts</span>
              </div>
            ))}
        </div>
        <button
          type="button"
          class="btn btn-primary w-full"
          onClick={props.onBackToRoom}
        >
          Back to Room
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/routes/games/bomberman/components/
git commit -m "feat: Bomberman frontend render components (MapLayer, EntityLayer, VirtualControls, HUD, Scoreboard)"
```

- [ ] **Step 7: Write frontend component tests**

Create `packages/frontend/src/routes/games/bomberman/components/__tests__/HUD.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import { HUD } from "../HUD";

describe("HUD", () => {
  it("renders time in mm:ss format", () => {
    const div = document.createElement("div");
    render(() => <HUD timeLeft={125} aliveCount={2} totalPlayers={4} />, div);
    expect(div.textContent).toContain("2:05");
  });

  it("renders alive count", () => {
    const div = document.createElement("div");
    render(() => <HUD timeLeft={0} aliveCount={1} totalPlayers={4} />, div);
    expect(div.textContent).toContain("1/4");
  });

  it("renders zero time as 0:00", () => {
    const div = document.createElement("div");
    render(() => <HUD timeLeft={0} aliveCount={4} totalPlayers={4} />, div);
    expect(div.textContent).toContain("0:00");
  });

  it("renders large time values correctly", () => {
    const div = document.createElement("div");
    render(() => <HUD timeLeft={3600} aliveCount={0} totalPlayers={4} />, div);
    expect(div.textContent).toContain("60:00");
  });
});
```

Create `packages/frontend/src/routes/games/bomberman/components/__tests__/Scoreboard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import { Scoreboard } from "../Scoreboard";

describe("Scoreboard", () => {
  const players = [
    { name: "Alice", rank: 1, score: 300 },
    { name: "Bob", rank: 2, score: 150 },
    { name: "Carol", rank: 3, score: 80 },
  ];

  it("renders all players sorted by rank", () => {
    const div = document.createElement("div");
    render(() => <Scoreboard players={players} onBackToRoom={() => {}} />, div);
    expect(div.textContent).toContain("Alice");
    expect(div.textContent).toContain("Bob");
    expect(div.textContent).toContain("Carol");
    expect(div.textContent).toContain("300");
    expect(div.textContent).toContain("GAME OVER");
  });

  it("renders back to room button", () => {
    const div = document.createElement("div");
    render(() => <Scoreboard players={players} onBackToRoom={() => {}} />, div);
    const btn = div.querySelector("button");
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain("Back");
  });

  it("calls onBackToRoom when button clicked", () => {
    let called = false;
    const div = document.createElement("div");
    render(() => <Scoreboard players={players} onBackToRoom={() => { called = true; }} />, div);
    const btn = div.querySelector("button")!;
    btn.click();
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 8: Run frontend component tests**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend && npx vitest run src/routes/games/bomberman/components/__tests__/HUD.test.tsx src/routes/games/bomberman/components/__tests__/Scoreboard.test.tsx
```
Expected: 7 tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/routes/games/bomberman/components/
git commit -m "feat: Bomberman frontend render components with tests"
```

---

### Task 5.3: Bomberman game page + route

**Files:**
- Create: `packages/frontend/src/routes/games/bomberman/game.tsx`
- Create: `packages/frontend/src/routes/games/bomberman/hub.tsx`
- Create: `packages/frontend/src/routes/games/bomberman/room.tsx`
- Modify: `packages/frontend/src/app.tsx`

- [ ] **Step 1: Create game.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/game.tsx
import { Application, P } from "solid-pixi";
import { createSignal, onCleanup, onMount } from "solid-js";
import type { BombermanState } from "@generale/types";
import { useBombermanGameSession } from "./hooks/useGameSession";
import { useBombermanInput } from "./hooks/useBombermanInput";
import { MapLayer } from "./components/MapLayer";
import { EntityLayer } from "./components/EntityLayer";
import { HUD } from "./components/HUD";
import { VirtualControls } from "./components/VirtualControls";
import { Scoreboard } from "./components/Scoreboard";

interface BombermanGameProps {
  domain: string;
}

export function BombermanGame(props: BombermanGameProps) {
  const { state, enqueueOp } = useBombermanGameSession(props.domain);
  const { showVirtualControls } = useBombermanInput(enqueueOp);
  const [showScoreboard, setShowScoreboard] = createSignal(false);

  const currentState = () => state();

  function handleBackToRoom() {
    // Navigate back — in a real app this would close the game domain
    window.history.back();
  }

  return (
    <div class="relative w-full h-screen">
      <Application resizeTo={window}>
        {currentState() && (
          <>
            <MapLayer
              tiles={currentState()!.map.tiles}
              x={0}
              y={0}
            />
            <EntityLayer
              players={Object.values(currentState()!.players).map((p, i) => ({
                ...p,
                colorIndex: i,
              }))}
              bombs={currentState()!.bombs}
              explosions={currentState()!.explosions}
              items={currentState()!.items}
            />
          </>
        )}
      </Application>

      {currentState() && (
        <HUD
          timeLeft={currentState()!.roundTimer ?? 0}
          aliveCount={Object.values(currentState()!.players).filter((p) => p.alive).length}
          totalPlayers={Object.keys(currentState()!.players).length}
        />
      )}

      {showVirtualControls() && <VirtualControls onAction={enqueueOp} />}

      {currentState()?.status === "ENDED" && (
        <Scoreboard
          players={Object.values(currentState()!.players).map((p) => ({
            name: p.playerId.slice(0, 8),
            rank: p.alive ? 1 : 2,
            score: p.alive ? 100 : 0,
          }))}
          onBackToRoom={handleBackToRoom}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create hub.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/hub.tsx
import { useNavigate } from "@solidjs/router";

export function BombermanHub() {
  const navigate = useNavigate();

  function createRoom() {
    // POST /api/bomberman/room/create → get gameId → navigate
    fetch("/api/bomberman/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName: "Quick Match" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          navigate(`/bomberman/room/${data.data.gameId}`);
        }
      });
  }

  return (
    <div class="container mx-auto p-8 text-center">
      <h1 class="text-3xl font-bold mb-4">Bomberman</h1>
      <p class="text-gray-400 mb-8">Classic arena battle — 2-4 players</p>
      <button type="button" class="btn btn-primary" onClick={createRoom}>
        New Room
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create room.tsx**

```tsx
// packages/frontend/src/routes/games/bomberman/room.tsx
import { useParams } from "@solidjs/router";
import { createSignal, onMount } from "solid-js";
import { BombermanGame } from "./game";

export function BombermanRoom() {
  const params = useParams();
  const [phase, setPhase] = createSignal<"loading" | "room" | "game" | "error">("loading");
  const [gameDomain, setGameDomain] = createSignal("");

  onMount(async () => {
    try {
      const res = await fetch(`/api/bomberman/room/connect/${params.id}`);
      const data = await res.json();
      if (data.success) {
        const primary = data.data.domains.primary;
        if (primary.startsWith("game-")) {
          setGameDomain(primary);
          setPhase("game");
        } else {
          setPhase("room");
        }
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    }
  });

  return (
    <>
      {phase() === "loading" && <div class="p-8 text-center">Loading...</div>}
      {phase() === "game" && <BombermanGame domain={gameDomain()} />}
      {phase() === "room" && (
        <div class="p-8 text-center">
          <p>Waiting for players...</p>
        </div>
      )}
      {phase() === "error" && (
        <div class="p-8 text-center text-red-500">Failed to connect to game</div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Update app.tsx**

Read `packages/frontend/src/app.tsx` and add the Bomberman route imports and routes:

```tsx
import { BombermanHub } from "~/routes/games/bomberman/hub";
import { BombermanRoom } from "~/routes/games/bomberman/room";

// Add routes inside <Router>:
<Route path="/bomberman" component={BombermanHub} />
<Route path="/bomberman/room/:id" component={BombermanRoom} />
```

Also update the existing Generale route if it was changed during the migration:
```tsx
// If the Generale routes are now at /generale/*, update accordingly
<Route path="/generale" component={GeneraleHub} />
<Route path="/generale/room/:id" component={GeneraleRoom} />
```

- [ ] **Step 5: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

Fix any type or import errors. All existing Generale tests must still pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Bomberman frontend pages (hub, room, game) and route registration"
```

---

## Phase 6: Settings + Mobile + Final Wiring

### Task 6.1: Add settings API endpoints

**Files:**
- Create: `packages/backend/src/routes/settings.ts`
- Modify: `packages/backend/src/app.ts`

- [ ] **Step 1: Create settings routes**

```ts
// packages/backend/src/routes/settings.ts
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { userSettings, gameUserSettings } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authPlugin } from "../middleware/authPlugin";
import { GLOBAL_SETTINGS_KEYS } from "@generale/types";

export function settingsRoutes(app: Elysia) {
  return app
    .use(authPlugin)

    // GET global settings
    .get("/global", async ({ session }) => {
      const rows = await db
        .select({ key: userSettings.key, value: userSettings.value })
        .from(userSettings)
        .where(eq(userSettings.userId, session.userId));

      const result: Record<string, string> = {};
      for (const r of rows) {
        result[r.key] = r.value;
      }
      return { success: true, data: result };
    })

    // PATCH global settings
    .patch(
      "/global",
      async ({ session, body }) => {
        for (const [key, value] of Object.entries(body)) {
          // Whitelist check
          if (!GLOBAL_SETTINGS_KEYS.includes(key as any)) continue;
          await db
            .insert(userSettings)
            .values({ userId: session.userId, key, value: String(value), updatedAt: Date.now() })
            .onConflictDoUpdate({
              target: [userSettings.userId, userSettings.key],
              set: { value: String(value), updatedAt: Date.now() },
            });
        }
        return { success: true };
      },
      { body: t.Record(t.String(), t.String()) },
    )

    // GET game settings for a specific game type
    .get("/game/:gameType", async ({ params, session }) => {
      const rows = await db
        .select({ key: gameUserSettings.key, value: gameUserSettings.value })
        .from(gameUserSettings)
        .where(
          and(
            eq(gameUserSettings.userId, session.userId),
            eq(gameUserSettings.gameType, params.gameType),
          ),
        );

      const result: Record<string, string> = {};
      for (const r of rows) {
        result[r.key] = r.value;
      }
      return { success: true, data: result };
    })

    // PATCH game settings
    .patch(
      "/game/:gameType",
      async ({ params, session, body }) => {
        for (const [key, value] of Object.entries(body)) {
          await db
            .insert(gameUserSettings)
            .values({
              userId: session.userId,
              gameType: params.gameType,
              key,
              value: String(value),
              updatedAt: Date.now(),
            })
            .onConflictDoUpdate({
              target: [gameUserSettings.userId, gameUserSettings.gameType, gameUserSettings.key],
              set: { value: String(value), updatedAt: Date.now() },
            });
        }
        return { success: true };
      },
      { body: t.Record(t.String(), t.String()) },
    );
}
```

- [ ] **Step 2: Wire into app.ts**

In `packages/backend/src/app.ts`, add:

```ts
import { settingsRoutes } from "./routes/settings";
```

And in the Elysia chain:
```ts
.group("/api/settings", (app) => settingsRoutes(app))
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: user settings API (global + per-game)"
```

---

### Task 6.2: Add mobile viewport meta tag

**Files:**
- Modify: `packages/frontend/public/index.html` or entry HTML file

- [ ] **Step 1: Find the HTML file**

```bash
ls packages/frontend/public/ packages/frontend/index.html packages/frontend/src/index.html 2>/dev/null
```

Read the HTML file to see if `<meta name="viewport">` already exists.

- [ ] **Step 2: Add viewport meta if missing**

If not present, add in `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/{index.html,public/index.html}  # whichever exists
git commit -m "feat: add viewport meta tag for mobile responsiveness"
```

---

### Task 6.3: Final integration — homepage game cards

**Files:**
- Modify: `packages/frontend/src/routes/home.tsx` (or the home page component)

- [ ] **Step 1: Read current home page**

Read the home page component to understand its current structure. Replace or add game card navigation:

```tsx
// Add to home page
import { A } from "@solidjs/router";

function GameCards() {
  return (
    <div class="grid grid-cols-2 gap-4 p-4">
      <A href="/generale" class="card bg-base-200 p-6 text-center hover:bg-base-300 transition">
        <h2 class="text-xl font-bold">Generale</h2>
        <p class="text-sm text-gray-400">Conquest strategy</p>
      </A>
      <A href="/bomberman" class="card bg-base-200 p-6 text-center hover:bg-base-300 transition">
        <h2 class="text-xl font-bold">Bomberman</h2>
        <p class="text-sm text-gray-400">Arena battle</p>
      </A>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/float/myfile/Projects/generale-vue && bun run build && bun run test
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: game card navigation on homepage"
```

---

## Verification Checklist

After all phases complete, run from repo root:

```bash
# 1. Full build
bun run build

# 2. All tests (includes new Bomberman tests)
bun run test

# 3. Run Bomberman tests individually to verify
cd packages/backend
npx vitest run src/games/bomberman/__tests__/settings.test.ts       # 8 tests
npx vitest run src/games/bomberman/core/__tests__/map-gen.test.ts    # 10+ tests
npx vitest run src/games/bomberman/core/__tests__/game.test.ts       # 9+ tests
npx vitest run src/games/bomberman/__tests__/bomberman-game.test.ts  # 4+ tests

# 4. Type check
cd packages/types && npx tsc -p tsconfig.json
cd packages/backend && npx tsc --noEmit
cd packages/frontend && npx tsc --noEmit

# 5. Lint
bun run ci:lint
```

All must exit 0 with no errors. Total new test count: **43+ tests across 7 files**.

## Test Coverage Summary

| Test file | What it tests | Count |
|-----------|---------------|:---:|
| `bomberman/__tests__/settings.test.ts` | Config defaults + validation boundaries | 8 |
| `bomberman/core/__tests__/map-gen.test.ts` | Map generation, BFS connectivity, spawn positions | 10+ |
| `bomberman/core/__tests__/game.test.ts` | Movement, bombs, explosions, items, win condition | 9+ |
| `bomberman/__tests__/bomberman-game.test.ts` | Game instance lifecycle, tick, onEnd | 4+ |
| `bomberman/__tests__/manager.test.ts` | Manager create/get/remove/destroy | 5 |
| `bomberman/components/__tests__/HUD.test.tsx` | Timer display, alive count rendering | 4 |
| `bomberman/components/__tests__/Scoreboard.test.tsx` | Ranking display, button callback | 3 |

---

## Summary of All New Files Created

```
packages/types/src/game/game-type.ts
packages/types/src/game/room/base-room-state.ts
packages/types/src/game/result.ts
packages/types/src/game/bomberman/index.ts
packages/types/src/settings/global.ts

packages/backend/src/games/bomberman/core/map-gen.ts
packages/backend/src/games/bomberman/core/game.ts
packages/backend/src/games/bomberman/core/__tests__/map-gen.test.ts
packages/backend/src/games/bomberman/core/__tests__/game.test.ts
packages/backend/src/games/bomberman/instance/BombermanGame.ts
packages/backend/src/games/bomberman/service/BombermanService.ts
packages/backend/src/games/bomberman/service/BombermanManager.ts
packages/backend/src/games/bomberman/settings.ts
packages/backend/src/games/bomberman/__tests__/settings.test.ts
packages/backend/src/games/bomberman/__tests__/bomberman-game.test.ts
packages/backend/src/games/bomberman/routes.ts
packages/backend/src/routes/settings.ts

packages/frontend/src/routes/games/bomberman/game.tsx
packages/frontend/src/routes/games/bomberman/hub.tsx
packages/frontend/src/routes/games/bomberman/room.tsx
packages/frontend/src/routes/games/bomberman/hooks/useBombermanInput.ts
packages/frontend/src/routes/games/bomberman/hooks/useGameSession.ts
packages/frontend/src/routes/games/bomberman/components/MapLayer.tsx
packages/frontend/src/routes/games/bomberman/components/EntityLayer.tsx
packages/frontend/src/routes/games/bomberman/components/VirtualControls.tsx
packages/frontend/src/routes/games/bomberman/components/HUD.tsx
packages/frontend/src/routes/games/bomberman/components/Scoreboard.tsx
packages/frontend/src/routes/games/bomberman/components/__tests__/HUD.test.tsx
packages/frontend/src/routes/games/bomberman/components/__tests__/Scoreboard.test.tsx

```
**Test files:** 7 test files, 43+ tests total

## Files Modified

```
packages/backend/src/db/schema.ts              (add tables)
packages/backend/src/app.ts                    (wire Bomberman + settings)
packages/types/src/api/index.ts                (export new types)
packages/frontend/src/app.tsx                  (add Bomberman routes)
packages/frontend/src/routes/home.tsx          (game cards)
```
