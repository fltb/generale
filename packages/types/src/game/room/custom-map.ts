import type { TileType } from '../core-type';

export interface CustomMapTile {
  /** terrain type */
  type: TileType;
  /** initial army. 0 = neutral. positive = defendable. (Mountain/Fog tiles ignore this) */
  army: number;
}

/**
 * Full custom map definition, stored as JSON file on disk (not in DB).
 * DB only stores metadata; tiles loaded from ./public/maps/<id>.json
 */
export interface CustomMapData {
  id: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  width: number;
  height: number;
  tiles: CustomMapTile[][]; // [y][x]
  minPlayers: number;
  maxPlayers: number;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  isDraft: boolean;
  usageCount: number;
  tags: string[];
}
