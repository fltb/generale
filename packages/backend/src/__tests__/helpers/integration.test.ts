import { describe, it, expect } from "bun:test";
import { createTestApp, seedUser, loginAs } from "./integration";

describe("helpers smoke", () => {
  it("creates app, seeds user, logs in", async () => {
    const { app, rawDb } = await createTestApp();
    const user = await seedUser(rawDb);
    const { sid, status } = await loginAs(app, user.username, "testpass123");
    expect(status).toBe(200);
    expect(sid).toBeTruthy();
  });
});
