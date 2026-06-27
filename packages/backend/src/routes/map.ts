import { Elysia, t } from 'elysia';
import sharp from 'sharp';
import { mapService } from '../services/mapService';
import { sessionService } from '../services/sessionService';
import { cookieScheme } from './user';
import {
  createMapReqSchema,
  updateMapReqSchema,
} from '@generale/types';
import type {
  CustomMapTile,
  MapListRespBody,
  MapDetailSuccessRespBody,
  MapCreateSuccessRespBody,
  MapDeleteSuccessRespBody,
} from '@generale/types';

function getSession(cookie: any) {
  const sid = cookie?.sid?.value;
  return sid ? sessionService.get(sid) : undefined;
}

export const mapRoutes = new Elysia({ prefix: '/maps' })
  // ---- serve thumbnails (binary) ----
  .get('/thumbnail/:id', async ({ params }) => {
    const file = Bun.file(`./public/maps/${params.id}.png`);
    if (!await file.exists()) return new Response('Not Found', { status: 404 });
    return new Response(file, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  })

  // ---- list (public) ----
  .get('/list', ({ query: q }): MapListRespBody | Response => {
    const limit = Math.min(parseInt(q['limit'] || '20'), 50);
    const offset = parseInt(q['offset'] || '0') || 0;
    const data = mapService.listPublic(limit, offset, q['search']);
    return { success: true, data };
  })

  // ---- my maps (auth) ----
  .get('/my', ({ query: q, cookie }): MapListRespBody | Response => {
    const session = getSession(cookie);
    if (!session) return new Response('Unauthorized', { status: 401 });
    const limit = Math.min(parseInt(q['limit'] || '50'), 100);
    const offset = parseInt(q['offset'] || '0') || 0;
    const data = mapService.listByAuthor(session.userId as string, limit, offset);
    return { success: true, data };
  }, { cookie: cookieScheme })

  // ---- detail ----
  .get('/detail/:id', async ({ params, query }): Promise<MapDetailSuccessRespBody | Response> => {
    const meta = mapService.getMeta(params.id);
    if (!meta || (!meta.isPublic && !meta.isDraft)) return new Response('Not Found', { status: 404 });
    const hasDraft = mapService.hasDraft(params.id);
    const allowDraft = (query as any)['draft'] !== '0';
    const tiles = await mapService.loadTiles(params.id, allowDraft);
    return { success: true, data: { ...meta, description: meta.description || undefined, hasDraft, tiles: tiles ?? [] } as any };
  })

  // ---- create (auth) ----
  .post('/create', async ({ body, cookie }): Promise<MapCreateSuccessRespBody | Response> => {
    const session = getSession(cookie);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const tiles = body.tiles;
    if (tiles.length !== body.height) return new Response(`tiles row count (${tiles.length}) != height (${body.height})`, { status: 400 });
    for (const row of tiles) {
      if (!Array.isArray(row) || row.length !== body.width) return new Response(`tile row length != width (${body.width})`, { status: 400 });
    }
    if ((body.minPlayers ?? 0) > (body.maxPlayers ?? Infinity)) return new Response('minPlayers > maxPlayers', { status: 400 });

    const id = `map_${Date.now()}`;
    mapService.create(session.userId as string, {
      id, name: body.name, description: body.description || '',
      width: body.width, height: body.height,
      tileCount: tiles.reduce((s, r) => s + r.length, 0),
      minPlayers: body.minPlayers ?? 2, maxPlayers: body.maxPlayers ?? 8,
      isPublic: body.isPublic ?? false, isDraft: body.isDraft ?? true,
      tags: body.tags ?? [], tiles: tiles as unknown as CustomMapTile[][],
    });
    await mapService.saveTiles(id, tiles as unknown as CustomMapTile[][]);
    return { success: true, data: { id, message: 'Map created' } };
  }, { body: createMapReqSchema, cookie: cookieScheme })

  // ---- update (auth, owner only) ----
  .patch('/update/:id', async ({ params, body, cookie }): Promise<MapCreateSuccessRespBody | Response> => {
    const session = getSession(cookie);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const meta = mapService.getMeta(params.id);
    if (!meta) return new Response('Not Found', { status: 404 });
    if (meta.authorId !== session.userId) return new Response('Forbidden', { status: 403 });

    const isPublishing = body.isPublic === true && body.isDraft === false;

    if (body.tiles !== undefined) {
      const tiles = body.tiles;
      if (tiles.length !== meta.height) return new Response(`tile rows (${tiles.length}) != height (${meta.height})`, { status: 400 });
      for (const row of tiles) {
        if (!Array.isArray(row) || row.length !== meta.width) return new Response(`tile row length != width (${meta.width})`, { status: 400 });
      }
      if (isPublishing) {
        await mapService.saveTiles(params.id, tiles as unknown as CustomMapTile[][]);
        await mapService.discardDraft(params.id);
      } else if (!meta.isDraft) {
        // draft save on published map: only save draft file, don't touch published meta
        await mapService.saveDraftTiles(params.id, tiles as unknown as CustomMapTile[][]);
        return { success: true, data: { id: params.id, message: 'Draft saved' } };
      } else {
        await mapService.saveTiles(params.id, tiles as unknown as CustomMapTile[][]);
      }
    }

    mapService.update(meta, Object.fromEntries(
      Object.entries({ name: body.name, description: body.description, isPublic: body.isPublic, isDraft: body.isDraft, minPlayers: body.minPlayers, maxPlayers: body.maxPlayers, tags: body.tags, tiles: body.tiles }).filter(([, v]) => v !== undefined)
    ) as any);

    return { success: true, data: { id: params.id, message: isPublishing ? 'Published' : 'Updated' } };
  }, { body: updateMapReqSchema, cookie: cookieScheme })

  // ---- discard draft (auth, owner only) ----
  .post('/discard-draft/:id', ({ params, cookie }): MapDeleteSuccessRespBody | Response => {
    const session = getSession(cookie);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const meta = mapService.getMeta(params.id);
    if (!meta) return new Response('Not Found', { status: 404 });
    if (meta.authorId !== session.userId) return new Response('Forbidden', { status: 403 });

    mapService.discardDraft(params.id);
    return { success: true };
  }, { cookie: cookieScheme })

  // ---- delete (auth, owner only) ----
  .delete('/delete/:id', ({ params, cookie }): MapDeleteSuccessRespBody | Response => {
    const session = getSession(cookie);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const meta = mapService.getMeta(params.id);
    if (!meta) return new Response('Not Found', { status: 404 });
    if (meta.authorId !== session.userId) return new Response('Forbidden', { status: 403 });
    if (!meta.isDraft && meta.usageCount > 0) return new Response('Map is in use', { status: 409 });

    mapService.deleteTiles(params.id);
    mapService.deleteThumbnail(params.id);
    mapService.delete(params.id);

    return { success: true };
  }, { cookie: cookieScheme })

  // ---- fork (auth) ----
  .post('/fork/:id', async ({ params, cookie }): Promise<MapCreateSuccessRespBody | Response> => {
    const session = getSession(cookie);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const meta = mapService.getMeta(params.id);
    if (!meta || (!meta.isPublic && meta.authorId !== session.userId)) return new Response('Not Found', { status: 404 });

    const newId = mapService.fork(params.id, session.userId as string);
    if (!newId) return new Response('Fork failed', { status: 500 });

    const tiles = await mapService.loadTiles(params.id);
    if (tiles) await mapService.saveTiles(newId, tiles);

    // copy thumbnail if the original has one
    const thumbFile = Bun.file(`./public/maps/${params.id}.png`);
    if (await thumbFile.exists()) {
      await Bun.write(`./public/maps/${newId}.png`, thumbFile);
    }

    return { success: true, data: { id: newId, message: 'Map forked' } };
  }, { cookie: cookieScheme })

  // ---- thumbnail upload (auth, owner only) ----
  .post('/thumbnail/:id', async ({ params, body, cookie }): Promise<MapDeleteSuccessRespBody | Response> => {
    const session = getSession(cookie);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const meta = mapService.getMeta(params.id);
    if (!meta) return new Response('Map not found', { status: 404 });
    if (meta.authorId !== session.userId) return new Response('Not owner', { status: 403 });

    const file = body.file;
    if (!file) return new Response('No file', { status: 400 });

    const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!ALLOWED.has(file.type)) return new Response(`Unsupported type: ${file.type}`, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return new Response(`File too large`, { status: 400 });

    const buf = new Uint8Array(await file.arrayBuffer());
    try {
      const resized = await sharp(Buffer.from(buf))
        .resize(400, 300, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      await mapService.saveThumbnail(params.id, resized);
      mapService.setHasCustomThumbnail(params.id, true);
    } catch {
      return new Response('Invalid image', { status: 400 });
    }

    return { success: true };
  }, {
    cookie: cookieScheme,
    body: t.Object({ file: t.File({ minSize: 1, maxSize: 2 * 1024 * 1024 }) }),
  });

export default mapRoutes;
