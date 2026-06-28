import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp, seedUser, loginAs } from "../helpers/integration";
import type { SeedUser } from "../helpers/integration";
import type { Database } from "bun:sqlite";
import type { Elysia } from "elysia";

describe("Auth Routes", () => {
  let app: Elysia;
  let rawDb: Database;
  let user: SeedUser;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app; rawDb = ctx.rawDb;
    user = seedUser(rawDb);
  });
  afterAll(() => rawDb.close());

  it("POST /register — creates user", async () => {
    const r = await app.handle(new Request("http://localhost/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "newuser", email: "n@t.com", password: "secret123", confirmPassword: "secret123" }) }));
    expect(r.status).toBe(200);
    expect((await r.json()).success).toBe(true);
  });
  it("POST /register — rejects duplicate username", async () => {
    const r = await app.handle(new Request("http://localhost/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user.username, email: "d@t.com", password: "secret123", confirmPassword: "secret123" }) }));
    expect(r.status).toBe(409);
  });
  it("POST /register — rejects short password", async () => {
    const r = await app.handle(new Request("http://localhost/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "shortpw", email: "s@t.com", password: "12", confirmPassword: "12" }) }));
    expect(r.status).toBe(422);
  });
  it("POST /login — returns sid cookie", async () => {
    const { sid: s } = await loginAs(app, user.username, "testpass123");
    expect(s).toBeTruthy();
  });
  it("POST /login — rejects wrong password", async () => {
    const { status } = await loginAs(app, user.username, "wrongpw");
    expect(status).toBe(401);
  });
  it("GET /me — returns current user", async () => {
    const { sid: freshSid } = await loginAs(app, user.username, "testpass123");
    const r = await app.handle(new Request("http://localhost/api/me", { headers: { Cookie: `sid=${freshSid}` } }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.user.username).toBe(user.username);
  });
  it("GET /me — 401 without auth", async () => {
    const r = await app.handle(new Request("http://localhost/api/me"));
    expect(r.status).toBe(401);
  });
  it("POST /logout — clears session", async () => {
    const { sid: freshSid } = await loginAs(app, user.username, "testpass123");
    await app.handle(new Request("http://localhost/api/logout", { method: "POST", headers: { Cookie: `sid=${freshSid}` } }));
    const r = await app.handle(new Request("http://localhost/api/me", { headers: { Cookie: `sid=${freshSid}` } }));
    expect(r.status).toBe(401);
  });
});
