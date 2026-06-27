import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { TestScenario } from "../src/testScenario";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BACKEND_DIR = resolve(__dirname, "../../packages/backend");
const FRONTEND_DIR = resolve(__dirname, "../../packages/frontend");

test.describe("Game Flow E2E", () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = new TestScenario();
    await scenario.start(BACKEND_DIR, FRONTEND_DIR);
  });

  test.afterEach(async () => {
    await scenario.stop();
  });

  test("4 players login, create room, ready up, start game, surrender", async () => {
    const users = scenario.testUsers;

    // create all sessions
    const p1 = await scenario.createSession(users[0]);
    const p2 = await scenario.createSession(users[1]);
    const p3 = await scenario.createSession(users[2]);
    const p4 = await scenario.createSession(users[3]);

    // all login
    await p1.login();
    await p2.login();
    await p3.login();
    await p4.login();

    // p1 creates room
    await p1.createRoom({ roomName: "e2e-test-room" });
    const roomId = await p1.getRoomId();
    expect(roomId).toBeTruthy();

    // others join
    await p2.page.goto(`${scenario.frontendUrl()}/game/${roomId}?__test__=1`);
    await p2.page.waitForURL(/\/game\//);
    await expect(p2.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });

    await p3.page.goto(`${scenario.frontendUrl()}/game/${roomId}?__test__=1`);
    await p3.page.waitForURL(/\/game\//);
    await expect(p3.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });

    await p4.page.goto(`${scenario.frontendUrl()}/game/${roomId}?__test__=1`);
    await p4.page.waitForURL(/\/game\//);
    await expect(p4.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });

    // verify 4 players in room
    await p1.expectPlayerCount(4);

    // p1 is host -> start game (other players need to ready first)
    // non-host players ready up
    await p2.readyUp();
    await p3.readyUp();
    await p4.readyUp();

    // p1 (host) clicks start game
    await p1.page.click('[data-testid="start-game"]');

    // wait for all players to enter game phase
    await p1.waitForStatus("PLAYING");
    await p2.waitForStatus("PLAYING");
    await p3.waitForStatus("PLAYING");
    await p4.waitForStatus("PLAYING");

    // verify game HUD is visible
    await expect(p1.page.locator('[data-testid="game-hud"]')).toBeVisible({ timeout: 10000 });

    // 3 players surrender -> only 1 (p4) remains -> game ends
    await p1.surrender();
    await p2.surrender();
    await p3.surrender();

    // verify game end overlay on last surrendering player and on the winner
    await p3.expectGameEndVisible();
    await p4.expectGameEndVisible();
  });
});
