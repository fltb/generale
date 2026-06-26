import type { TileType, PlayerId } from '../core-type';

export interface CustomMapTile {
  /** terrain type */
  type: TileType;
  /** initial army. 0 = neutral. positive = defendable, negative = speed boost */
  army: number;
  /** ownerId for pre-placed thrones (used when type !== THRONE but pre-assigned) */
  ownerId?: PlayerId;
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
