import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { TestScenario } from "../src/testScenario";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_DIR = resolve(__dirname, "../../packages/backend");
const FRONTEND_DIR = resolve(__dirname, "../../packages/frontend");

test.describe("Kick & Transfer Host", () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = new TestScenario();
    await scenario.start(BACKEND_DIR, FRONTEND_DIR);
  });

  test.afterEach(async () => {
    await scenario.stop();
  });

  test("host transfers to p2, then p2 kicks p1", async () => {
    const [p1, p2] = await Promise.all([
      scenario.createSession(scenario.testUsers[0]),
      scenario.createSession(scenario.testUsers[1]),
    ]);

    await p1.login();
    await p2.login();

    // p1 creates room
    await p1.createRoom({ roomName: "kick-test" });
    const roomId = await p1.getRoomId();
    expect(roomId).toBeTruthy();

    // p2 joins
    await p2.page.goto(`${scenario.frontendUrl()}/game/${roomId}?__test__=1`);
    await p2.page.waitForURL(/\/game\//);
    await expect(p2.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });

    // p1 transfers host to p2
    const transferBtn = p1.page.locator('[data-testid="transfer-host"]').first();
    await expect(transferBtn).toBeVisible({ timeout: 5000 });
    await transferBtn.click();

    // Wait a moment for the transfer to propagate
    await new Promise((r) => setTimeout(r, 1000));

    // p2 (now host) kicks p1
    await p2.page.goto(`${scenario.frontendUrl()}/game/${roomId}?__test__=1`);
    await p2.page.waitForURL(/\/game\//);
    await expect(p2.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });

    const kickBtn = p2.page.locator('[data-testid="kick-player"]').first();
    await expect(kickBtn).toBeVisible({ timeout: 5000 });
    await kickBtn.click();

    // p1 should be redirected to lobby
    await p1.page.waitForURL(/\//, { timeout: 10000 });
  });
});
