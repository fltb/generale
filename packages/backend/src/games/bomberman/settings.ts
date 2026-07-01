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
  if (c.mapWidth !== undefined && (c.mapWidth < 11 || c.mapWidth > 31)) {
    return "mapWidth must be between 11 and 31";
  }
  if (c.mapHeight !== undefined && (c.mapHeight < 11 || c.mapHeight > 31)) {
    return "mapHeight must be between 11 and 31";
  }
  if (c.playerLimit !== undefined && (c.playerLimit < 2 || c.playerLimit > 4)) {
    return "playerLimit must be between 2 and 4";
  }
  if (c.tickRate !== undefined && (c.tickRate < 2 || c.tickRate > 8)) {
    return "tickRate must be between 2 and 8";
  }
  return null;
}
