import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { TestScenario } from "../src/testScenario";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_DIR = resolve(__dirname, "../../packages/backend");
const FRONTEND_DIR = resolve(__dirname, "../../packages/frontend");

test.describe("In-Game Interaction", () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = new TestScenario();
    await scenario.start(BACKEND_DIR, FRONTEND_DIR);
  });

  test.afterEach(async () => {
    await scenario.stop();
  });

  test("2 players: click tile, surrender, verify game end", async () => {
    const [p1, p2] = await Promise.all([
      scenario.createSession(scenario.testUsers[0]),
      scenario.createSession(scenario.testUsers[1]),
    ]);

    // Both login
    await p1.login();
    await p2.login();

    // p1 creates room
    await p1.createRoom({ roomName: "interaction-test" });
    const roomId = await p1.getRoomId();
    expect(roomId).toBeTruthy();

    // p2 joins
    await p2.page.goto(`${scenario.frontendUrl()}/game/${roomId}?__test__=1`);
    await p2.page.waitForURL(/\/game\//);
    await expect(p2.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });

    // p2 readies up
    await p2.readyUp();

    // p1 (host) starts game
    await p1.page.click('[data-testid="start-game"]');

    // Wait for game phase
    await p1.waitForStatus("PLAYING");
    await p2.waitForStatus("PLAYING");

    await expect(p1.page.locator('[data-testid="game-hud"]')).toBeVisible({ timeout: 10000 });

    // Try clicking a tile on the map (via escape hatch)
    const stateBefore = await p1.getGameState();
    expect(stateBefore).toBeTruthy();
    expect(stateBefore.status).toBe("PLAYING");

    // Click a tile (0, 0) — may be owned by p1 or neutral; should not crash
    await p1.clickTile(0, 0);

    // Small delay for any state update
    await new Promise((r) => setTimeout(r, 500));

    // p1 surrenders
    await p1.surrender();

    // With only 2 players, when p1 surrenders the game should end
    // p2 should see the game-end overlay
    await p2.expectGameEndVisible();
  });
});
