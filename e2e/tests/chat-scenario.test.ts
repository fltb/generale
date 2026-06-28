import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { TestScenario } from "../src/testScenario";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_DIR = resolve(__dirname, "../../packages/backend");
const FRONTEND_DIR = resolve(__dirname, "../../packages/frontend");

test.describe("Chat", () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = new TestScenario();
    await scenario.start(BACKEND_DIR, FRONTEND_DIR);
  });

  test.afterEach(async () => {
    await scenario.stop();
  });

  test("two players exchange messages in room", async () => {
    const [p1, p2] = await Promise.all([
      scenario.createSession(scenario.testUsers[0]),
      scenario.createSession(scenario.testUsers[1]),
    ]);

    await p1.login();
    await p2.login();

    // p1 creates room
    await p1.createRoom({ roomName: "chat-test" });
    const roomId = await p1.getRoomId();
    expect(roomId).toBeTruthy();

    // p2 joins room
    await p2.page.goto(`${scenario.frontendUrl()}/game/${roomId}?__test__=1`);
    await p2.page.waitForURL(/\/game\//);
    await expect(p2.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });

    // Wait for chat to be available
    await expect(p1.page.locator('[data-testid="chat-messages"]')).toBeVisible({ timeout: 10000 });

    // p1 sends a message
    await p1.sendChat("hello from p1");

    // p2 sends a message
    await p2.sendChat("hello from p2");

    // Both players should see both messages
    await expect(p1.page.locator('[data-testid="chat-messages"]')).toContainText("hello from p1");
    await expect(p1.page.locator('[data-testid="chat-messages"]')).toContainText("hello from p2");
    await expect(p2.page.locator('[data-testid="chat-messages"]')).toContainText("hello from p2");
    await expect(p2.page.locator('[data-testid="chat-messages"]')).toContainText("hello from p1");
  });
});
