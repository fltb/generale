import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp, seedUser, loginAs } from "../helpers/integration";
import type { SeedUser } from "../helpers/integration";
import type { Database } from "bun:sqlite";
import type { Elysia } from "elysia";

describe("Settings Routes", () => {
  let app: Elysia;
  let rawDb: Database;
  let user: SeedUser;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app; rawDb = ctx.rawDb;
    user = seedUser(rawDb);
  });
  afterAll(() => rawDb.close());

  it("GET /profile/settings — returns empty object for new user", async () => {
    const { sid } = await loginAs(app, user.username, "testpass123");
    const r = await app.handle(new Request("http://localhost/api/profile/settings", { headers: { Cookie: `sid=${sid}` } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
  });

  it("GET /profile/settings — 401 without auth", async () => {
    const r = await app.handle(new Request("http://localhost/api/profile/settings"));
    expect(r.status).toBe(401);
  });

  it("PATCH /profile/settings — sets a setting", async () => {
    const { sid } = await loginAs(app, user.username, "testpass123");
    const r = await app.handle(new Request("http://localhost/api/profile/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sid}` },
      body: JSON.stringify({ key: "lang", value: "zh-CN" }),
    }));
    expect(r.status).toBe(200);
    expect((await r.json()).success).toBe(true);
  });

  it("GET /profile/settings — returns saved setting", async () => {
    const { sid } = await loginAs(app, user.username, "testpass123");
    const r = await app.handle(new Request("http://localhost/api/profile/settings", { headers: { Cookie: `sid=${sid}` } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ lang: "zh-CN" });
  });

  it("PATCH /profile/settings — overwrites existing setting", async () => {
    const { sid } = await loginAs(app, user.username, "testpass123");
    await app.handle(new Request("http://localhost/api/profile/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sid}` },
      body: JSON.stringify({ key: "lang", value: "en" }),
    }));
    const r = await app.handle(new Request("http://localhost/api/profile/settings", { headers: { Cookie: `sid=${sid}` } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ lang: "en" });
  });

  it("PATCH /profile/settings — 401 without auth", async () => {
    const r = await app.handle(new Request("http://localhost/api/profile/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "lang", value: "en" }),
    }));
    expect(r.status).toBe(401);
  });
});
