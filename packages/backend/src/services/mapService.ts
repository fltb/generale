import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import type { CustomMapTile } from "@generale/types";
import { and, desc, eq, like, type InferSelectModel } from "drizzle-orm";
import path from "path";
import { db } from "../db/client";
import { customMaps, profiles, users } from "../db/schema";

const MAPS_DIR = "./public/maps";

async function ensureDir() {
  if (!existsSync(MAPS_DIR)) {
    await mkdir(MAPS_DIR, { recursive: true });
  }
}

export function parseTags(tagsRaw: string | undefined): string[] {
  if (!tagsRaw) return [];
  try {
    return JSON.parse(tagsRaw);
  } catch {
    return tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function resolveDisplayName(authorId: string): string {
  const row = db
    .select({ displayName: profiles.displayName, username: users.username })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, authorId))
    .get();
  if (!row) return authorId;
  return row.displayName || row.username || authorId;
}

function mapRowToSummary(r: InferSelectModel<typeof customMaps>) {
  return {
    id: r.id,
    name: r.name,
    ...(r.description ? { description: r.description } : {}),
    authorId: r.authorId,
    authorName: resolveDisplayName(r.authorId),
    width: r.width,
    height: r.height,
    minPlayers: r.minPlayers,
    maxPlayers: r.maxPlayers,
    isPublic: r.isPublic,
    isDraft: r.isDraft,
    hasCustomThumbnail: r.hasCustomThumbnail,
    usageCount: r.usageCount,
    tags: parseTags(r.tags ?? undefined),
    ...(r.createdAt ? { createdAt: r.createdAt.toISOString() } : {}),
    ...(r.updatedAt ? { updatedAt: r.updatedAt.toISOString() } : {}),
  };
}

export class MapService {
  // ---- tile file storage ----

  private draftPath(id: string): string {
    return path.join(MAPS_DIR, `${id}.draft.json`);
  }

  private mainPath(id: string): string {
    return path.join(MAPS_DIR, `${id}.json`);
  }

  async saveTiles(id: string, tiles: CustomMapTile[][]): Promise<void> {
    await ensureDir();
    await Bun.write(this.mainPath(id), JSON.stringify(tiles));
  }

  async loadTiles(id: string, allowDraft = false): Promise<CustomMapTile[][] | null> {
    if (allowDraft) {
      const draft = this.draftPath(id);
      if (existsSync(draft)) return await Bun.file(draft).json();
    }
    const filepath = this.mainPath(id);
    if (!existsSync(filepath)) return null;
    return await Bun.file(filepath).json();
  }

  hasDraft(id: string): boolean {
    return existsSync(this.draftPath(id));
  }

  async saveDraftTiles(id: string, tiles: CustomMapTile[][]): Promise<void> {
    await ensureDir();
    await Bun.write(this.draftPath(id), JSON.stringify(tiles));
  }

  async publishDraft(id: string): Promise<void> {
    const draft = this.draftPath(id);
    if (!existsSync(draft)) return;
    const tiles = await Bun.file(draft).json();
    await Bun.write(this.mainPath(id), JSON.stringify(tiles));
    await rm(draft, { force: true });
  }

  async discardDraft(id: string): Promise<void> {
    const draft = this.draftPath(id);
    if (existsSync(draft)) await rm(draft, { force: true });
  }

  async deleteTiles(id: string): Promise<void> {
    const main = this.mainPath(id);
    if (existsSync(main)) await rm(main, { force: true });
    const draft = this.draftPath(id);
    if (existsSync(draft)) await rm(draft, { force: true });
  }

  async deleteThumbnail(id: string): Promise<void> {
    const filepath = path.join(MAPS_DIR, `${id}.png`);
    if (existsSync(filepath)) await rm(filepath, { force: true });
  }

  async saveThumbnail(id: string, buf: Uint8Array): Promise<void> {
    await ensureDir();
    const filepath = path.join(MAPS_DIR, `${id}.png`);
    await Bun.write(filepath, buf);
  }

  setHasCustomThumbnail(id: string, val: boolean): void {
    db.update(customMaps).set({ hasCustomThumbnail: val }).where(eq(customMaps.id, id)).run();
  }

  thumbnailUrl(id: string): string {
    const filepath = path.join(MAPS_DIR, `${id}.png`);
    return existsSync(filepath) ? `/api/maps/thumbnail/${id}` : "";
  }

  // ---- DB CRUD ----

  listPublic(limit: number, offset: number, search?: string) {
    const conditions = [eq(customMaps.isPublic, true), eq(customMaps.isDraft, false)];
    if (search) {
      conditions.push(like(customMaps.name, `%${search}%`));
    }
    const rows = db
      .select()
      .from(customMaps)
      .where(and(...conditions))
      .orderBy(desc(customMaps.updatedAt))
      .limit(limit)
      .offset(offset)
      .all();
    return rows.map(mapRowToSummary);
  }

  listByAuthor(authorId: string, limit: number, offset: number) {
    const rows = db
      .select()
      .from(customMaps)
      .where(eq(customMaps.authorId, authorId))
      .orderBy(desc(customMaps.updatedAt))
      .limit(limit)
      .offset(offset)
      .all();
    return rows.map(mapRowToSummary);
  }

  getMeta(id: string) {
    return db.select().from(customMaps).where(eq(customMaps.id, id)).get();
  }

  getMetaOrThrow(id: string): NonNullable<ReturnType<typeof this.getMeta>> {
    const meta = this.getMeta(id);
    if (!meta) throw new Response("Not Found", { status: 404 });
    return meta;
  }

  create(
    authorId: string,
    data: {
      id: string;
      name: string;
      description: string;
      width: number;
      height: number;
      tileCount: number;
      minPlayers: number;
      maxPlayers: number;
      isPublic: boolean;
      isDraft: boolean;
      tags?: string[];
      tiles: CustomMapTile[][];
    },
  ) {
    const now = new Date();
    db.insert(customMaps)
      .values({
        id: data.id,
        name: data.name,
        description: data.description,
        authorId,
        authorName: "",
        width: data.width,
        height: data.height,
        tileCount: data.tileCount,
        minPlayers: data.minPlayers,
        maxPlayers: data.maxPlayers,
        isPublic: data.isPublic,
        isDraft: data.isDraft,
        usageCount: 0,
        tags: JSON.stringify(data.tags ?? []),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id: data.id, tiles: data.tiles };
  }

  update(
    meta: NonNullable<ReturnType<typeof this.getMeta>>,
    updates: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      isDraft?: boolean;
      minPlayers?: number;
      maxPlayers?: number;
      tags?: string[];
      tiles?: CustomMapTile[][];
    },
  ) {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates["name"] = updates.name;
    if (updates.description !== undefined) dbUpdates["description"] = updates.description;
    if (updates.isPublic !== undefined) dbUpdates["isPublic"] = updates.isPublic;
    if (updates.isDraft !== undefined) dbUpdates["isDraft"] = updates.isDraft;
    if (updates.minPlayers !== undefined) dbUpdates["minPlayers"] = updates.minPlayers;
    if (updates.maxPlayers !== undefined) dbUpdates["maxPlayers"] = updates.maxPlayers;
    if (updates.tags !== undefined) dbUpdates["tags"] = JSON.stringify(updates.tags);
    if (updates.tiles !== undefined) dbUpdates["tileCount"] = updates.tiles.reduce((s, r) => s + r.length, 0);
    dbUpdates["updatedAt"] = new Date();
    db.update(customMaps).set(dbUpdates).where(eq(customMaps.id, meta.id)).run();
  }

  delete(id: string) {
    if (!db.select().from(customMaps).where(eq(customMaps.id, id)).get()) return false;
    db.delete(customMaps).where(eq(customMaps.id, id)).run();
    return true;
  }

  fork(originalId: string, authorId: string): string | null {
    const meta = this.getMeta(originalId);
    if (!meta) return null;
    const newId = `map_${Date.now()}`;
    const now = new Date();
    db.insert(customMaps)
      .values({
        id: newId,
        name: `${meta.name} (fork)`,
        description: meta.description || "",
        authorId,
        authorName: "",
        width: meta.width,
        height: meta.height,
        tileCount: meta.tileCount,
        minPlayers: meta.minPlayers,
        maxPlayers: meta.maxPlayers,
        isPublic: false,
        isDraft: true,
        usageCount: 0,
        tags: meta.tags,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return newId;
  }
}

export const mapService = new MapService();
