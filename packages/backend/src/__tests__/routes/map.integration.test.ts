import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp, seedUser, loginAs } from "../helpers/integration";
import type { SeedUser } from "../helpers/integration";
import type { Database } from "bun:sqlite";
import type { Elysia } from "elysia";

function makeTiles(w: number, h: number) {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ type: "0", army: 0 })),
  );
}

describe("Map Routes", () => {
  let app: Elysia; let rawDb: Database; let user: SeedUser; let sid: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app; rawDb = ctx.rawDb;
    user = seedUser(rawDb);
    ({ sid } = await loginAs(app, user.username, "testpass123"));
  });
  afterAll(() => rawDb.close());

  it("GET /maps/list — returns list", async () => {
    const r = await app.handle(new Request("http://localhost/api/maps/list"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("POST /maps/create — creates a map", async () => {
    const body = { name: "Test Map", width: 10, height: 10, tiles: makeTiles(10, 10) };
    const r = await app.handle(new Request("http://localhost/api/maps/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sid}` },
      body: JSON.stringify(body),
    }));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeTruthy();
  });

  it("POST /maps/create — 401 without auth", async () => {
    const r = await app.handle(new Request("http://localhost/api/maps/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", width: 10, height: 10, tiles: makeTiles(10, 10) }),
    }));
    expect(r.status).toBe(401);
  });

  it("GET /maps/detail/:id — returns map detail", async () => {
    const body = { name: "Detail Map", width: 10, height: 10, tiles: makeTiles(10, 10) };
    const createRes = await app.handle(new Request("http://localhost/api/maps/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sid}` },
      body: JSON.stringify(body),
    }));
    const { data } = await createRes.json();
    const mapId = data.id;

    const r = await app.handle(new Request(`http://localhost/api/maps/detail/${mapId}`));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.data.name).toBe("Detail Map");
  });

  it("PATCH /maps/update/:id — updates map name", async () => {
    const body = { name: "Update Test", width: 10, height: 10, tiles: makeTiles(10, 10) };
    const createRes = await app.handle(new Request("http://localhost/api/maps/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sid}` },
      body: JSON.stringify(body),
    }));
    const { data } = await createRes.json();

    const r = await app.handle(new Request(`http://localhost/api/maps/update/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sid}` },
      body: JSON.stringify({ name: "Updated Name" }),
    }));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.data.message).toBeTruthy();
    expect(json.data.id).toBeTruthy();
  });

  it("PATCH /maps/update/:id — 401 without auth", async () => {
    const r = await app.handle(new Request("http://localhost/api/maps/update/some-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    }));
    expect(r.status).toBe(401);
  });

  it("DELETE /maps/delete/:id — 401 without auth", async () => {
    const r = await app.handle(new Request("http://localhost/api/maps/delete/some-id", { method: "DELETE" }));
    expect(r.status).toBe(401);
  });

  it("DELETE /maps/delete/:id — deletes own map", async () => {
    const body = { name: "Delete Me", width: 10, height: 10, tiles: makeTiles(10, 10) };
    const createRes = await app.handle(new Request("http://localhost/api/maps/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sid}` },
      body: JSON.stringify(body),
    }));
    const { data } = await createRes.json();

    const r = await app.handle(new Request(`http://localhost/api/maps/delete/${data.id}`, {
      method: "DELETE",
      headers: { Cookie: `sid=${sid}` },
    }));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.success).toBe(true);
  });

  it("GET /maps/my — returns own maps", async () => {
    const r = await app.handle(new Request("http://localhost/api/maps/my", {
      headers: { Cookie: `sid=${sid}` },
    }));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.success).toBe(true);
  });

  it("GET /maps/my — 401 without auth", async () => {
    const r = await app.handle(new Request("http://localhost/api/maps/my"));
    expect(r.status).toBe(401);
  });
});
