import type { GameStatus } from "../core-type";

export type ItemType = "BOMB_UP" | "FIRE_UP" | "SPEED_UP" | "KICK" | "GLOVE" | "PUNCH" | "REMOTE" | "PIERCE" | "SPIRIT";

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
  playerId: string;
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
  playerId: string;
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
  players: Record<string, BombermanPlayer>;
  bombs: Bomb[];
  explosions: Explosion[];
  items: Item[];
  config: BombermanConfig;
  roundTimer?: number;
  shrinkBoundary?: number;
  round?: number;
  totalRounds?: number;
  scores?: Record<string, number>;
}

export type BombermanOperation =
  | { type: "MOVE"; direction: "up" | "down" | "left" | "right" }
  | { type: "PLACE_BOMB" }
  | { type: "KICK_BOMB"; direction: string }
  | { type: "THROW_BOMB"; direction: string }
  | { type: "DETONATE" }
  | { type: "NOOP" };

export interface BombermanBotConfig {
  playerId: string;
  spawnX: number;
  spawnY: number;
  ai: "random" | "chase" | "patrol" | "boss_charge" | "boss_teleport";
}
