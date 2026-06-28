import type {
  CustomMapTile,
  MapCreateSuccessRespBody,
  MapDeleteSuccessRespBody,
  MapDetailSuccessRespBody,
  MapListRespBody,
  MapSumaryRespBody,
} from "@generale/types";
import { createMapReqSchema, updateMapReqSchema } from "@generale/types";
import { Elysia, t as tSchema } from "elysia";
import { mapService } from "../services/mapService";
import { sessionService } from "../services/sessionService";
import { cookieScheme } from "./user";
import { tForRequest } from "../services/i18n";

function getSession(cookie: unknown) {
  const c = cookie as { sid?: { value?: string } };
  const sid = c?.sid?.value;
  return sid ? sessionService.get(sid) : undefined;
}

export const mapRoutes = new Elysia({ prefix: "/maps" })
  .get("/thumbnail/:id", async ({ params }) => {
    const file = Bun.file(`./public/maps/${params.id}.png`);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return new Response(file, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
    });
  })

  .get("/list", ({ query: q }): MapListRespBody | Response => {
    const limit = Math.min(parseInt(q["limit"] ?? "20", 10), 50);
    const offset = parseInt(q["offset"] ?? "0", 10) || 0;
    const data = mapService.listPublic(limit, offset, q["search"]) as MapSumaryRespBody[];
    return { success: true, data };
  })

  .get(
    "/my",
    ({ query: q, cookie, request }): MapListRespBody | Response => {
      const t = tForRequest({ cookie, request });
      const session = getSession(cookie);
      if (!session) return new Response(t("Unauthorized"), { status: 401 });
      const limit = Math.min(parseInt(q["limit"] ?? "50", 10), 100);
      const offset = parseInt(q["offset"] ?? "0", 10) || 0;
      const data = mapService.listByAuthor(session.userId as string, limit, offset) as MapSumaryRespBody[];
      return { success: true, data };
    },
    { cookie: cookieScheme },
  )

  .get("/detail/:id", async ({ params, query, request }): Promise<MapDetailSuccessRespBody | Response> => {
    const t = tForRequest({ request });
    const meta = mapService.getMeta(params.id);
    if (!(meta && (meta.isPublic || meta.isDraft))) return new Response(t("Not Found"), { status: 404 });
    const hasDraft = mapService.hasDraft(params.id);
    const allowDraft = (query as Record<string, unknown>)["draft"] !== "0";
    const tiles = await mapService.loadTiles(params.id, allowDraft);
    const detailData = {
      ...meta,
      description: meta.description || undefined,
      hasDraft,
      tiles: tiles ?? [],
    } as unknown as MapDetailSuccessRespBody["data"];
    return {
      success: true,
      data: detailData,
    };
  })

  .post(
    "/create",
    async ({ body, cookie, request }): Promise<MapCreateSuccessRespBody | Response> => {
      const t = tForRequest({ cookie, request });
      const session = getSession(cookie);
      if (!session) return new Response(t("Unauthorized"), { status: 401 });

      const tiles = body.tiles;
      if (tiles.length !== body.height)
        return new Response(t("Server error"), { status: 400 });
      for (const row of tiles) {
        if (!Array.isArray(row) || row.length !== body.width)
          return new Response(t("Server error"), { status: 400 });
      }
      if ((body.minPlayers ?? 0) > (body.maxPlayers ?? Infinity))
        return new Response(t("minPlayers > maxPlayers"), { status: 400 });

      const id = `map_${Date.now()}`;
      mapService.create(session.userId as string, {
        id,
        name: body.name,
        description: body.description || "",
        width: body.width,
        height: body.height,
        tileCount: tiles.reduce((s, r) => s + r.length, 0),
        minPlayers: body.minPlayers ?? 2,
        maxPlayers: body.maxPlayers ?? 8,
        isPublic: body.isPublic ?? false,
        isDraft: body.isDraft ?? true,
        tags: body.tags ?? [],
        tiles: tiles as unknown as CustomMapTile[][],
      });
      await mapService.saveTiles(id, tiles as unknown as CustomMapTile[][]);
      return { success: true, data: { id, message: t("Map created") } };
    },
    { body: createMapReqSchema, cookie: cookieScheme },
  )

  .patch(
    "/update/:id",
    async ({ params, body, cookie, request }): Promise<MapCreateSuccessRespBody | Response> => {
      const t = tForRequest({ cookie, request });
      const session = getSession(cookie);
      if (!session) return new Response(t("Unauthorized"), { status: 401 });

      const meta = mapService.getMeta(params.id);
      if (!meta) return new Response(t("Not Found"), { status: 404 });
      if (meta.authorId !== session.userId) return new Response(t("Forbidden"), { status: 403 });

      const isPublishing = body.isPublic === true && body.isDraft === false;

      if (body.tiles !== undefined) {
        const tiles = body.tiles;
        if (tiles.length !== meta.height)
          return new Response(t("Server error"), { status: 400 });
        for (const row of tiles) {
          if (!Array.isArray(row) || row.length !== meta.width)
            return new Response(t("Server error"), { status: 400 });
        }
        if (isPublishing) {
          await mapService.saveTiles(params.id, tiles as unknown as CustomMapTile[][]);
          await mapService.discardDraft(params.id);
        } else if (!meta.isDraft) {
          await mapService.saveDraftTiles(params.id, tiles as unknown as CustomMapTile[][]);
          return { success: true, data: { id: params.id, message: t("Draft saved") } };
        } else {
          await mapService.saveTiles(params.id, tiles as unknown as CustomMapTile[][]);
        }
      }

      mapService.update(
        meta,
        Object.fromEntries(
          Object.entries({
            name: body.name,
            description: body.description,
            isPublic: body.isPublic,
            isDraft: body.isDraft,
            minPlayers: body.minPlayers,
            maxPlayers: body.maxPlayers,
            tags: body.tags,
            tiles: body.tiles,
          }).filter(([, v]) => v !== undefined),
        ) as Partial<Parameters<typeof mapService.update>[1]>,
      );

      return { success: true, data: { id: params.id, message: t(isPublishing ? "Published" : "Updated") } };
    },
    { body: updateMapReqSchema, cookie: cookieScheme },
  )

  .post(
    "/discard-draft/:id",
    ({ params, cookie, request }): MapDeleteSuccessRespBody | Response => {
      const t = tForRequest({ cookie, request });
      const session = getSession(cookie);
      if (!session) return new Response(t("Unauthorized"), { status: 401 });

      const meta = mapService.getMeta(params.id);
      if (!meta) return new Response(t("Not Found"), { status: 404 });
      if (meta.authorId !== session.userId) return new Response(t("Forbidden"), { status: 403 });

      mapService.discardDraft(params.id);
      return { success: true };
    },
    { cookie: cookieScheme },
  )

  .delete(
    "/delete/:id",
    ({ params, cookie, request }): MapDeleteSuccessRespBody | Response => {
      const t = tForRequest({ cookie, request });
      const session = getSession(cookie);
      if (!session) return new Response(t("Unauthorized"), { status: 401 });

      const meta = mapService.getMeta(params.id);
      if (!meta) return new Response(t("Not Found"), { status: 404 });
      if (meta.authorId !== session.userId) return new Response(t("Forbidden"), { status: 403 });
      if (!meta.isDraft && meta.usageCount > 0) return new Response(t("Map is in use"), { status: 409 });

      mapService.deleteTiles(params.id);
      mapService.deleteThumbnail(params.id);
      mapService.delete(params.id);

      return { success: true };
    },
    { cookie: cookieScheme },
  )

  .post(
    "/fork/:id",
    async ({ params, cookie, request }): Promise<MapCreateSuccessRespBody | Response> => {
      const t = tForRequest({ cookie, request });
      const session = getSession(cookie);
      if (!session) return new Response(t("Unauthorized"), { status: 401 });

      const meta = mapService.getMeta(params.id);
      if (!meta || (!meta.isPublic && meta.authorId !== session.userId))
        return new Response(t("Not Found"), { status: 404 });

      const newId = mapService.fork(params.id, session.userId as string);
      if (!newId) return new Response(t("Fork failed"), { status: 500 });

      const tiles = await mapService.loadTiles(params.id);
      if (tiles) await mapService.saveTiles(newId, tiles);

      const thumbFile = Bun.file(`./public/maps/${params.id}.png`);
      if (await thumbFile.exists()) {
        await Bun.write(`./public/maps/${newId}.png`, thumbFile);
      }

      return { success: true, data: { id: newId, message: t("Map forked") } };
    },
    { cookie: cookieScheme },
  )

  .post(
    "/thumbnail/:id",
    async ({ params, body, cookie, request }): Promise<MapDeleteSuccessRespBody | Response> => {
      const t = tForRequest({ cookie, request });
      const session = getSession(cookie);
      if (!session) return new Response(t("Unauthorized"), { status: 401 });

      const meta = mapService.getMeta(params.id);
      if (!meta) return new Response(t("Map not found"), { status: 404 });
      if (meta.authorId !== session.userId) return new Response(t("Not owner"), { status: 403 });

      const file = body.file;
      if (!file) return new Response(t("No file"), { status: 400 });

      const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
      if (!ALLOWED.has(file.type)) return new Response(t("Unsupported file type"), { status: 400 });
      if (file.size > 2 * 1024 * 1024) return new Response(t("File too large"), { status: 400 });

      const buf = new Uint8Array(await file.arrayBuffer());
      try {
        const resized = await new Bun.Image(buf)
          .resize(400, 300, { fit: "inside", withoutEnlargement: true })
          .png()
          .buffer();
        await mapService.saveThumbnail(params.id, resized);
        mapService.setHasCustomThumbnail(params.id, true);
      } catch {
        return new Response(t("Invalid image"), { status: 400 });
      }

      return { success: true };
    },
    {
      cookie: cookieScheme,
      body: tSchema.Object({ file: tSchema.File({ minSize: 1, maxSize: 2 * 1024 * 1024 }) }),
    },
  );

export default mapRoutes;
