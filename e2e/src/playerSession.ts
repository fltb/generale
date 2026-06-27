import { expect, type Page } from "@playwright/test";
import type { TestUser } from "./testScenario";

/**
 * PlayerSession —— DOM 优先，仅必要时用 window.__test__ escape hatch.
 *
 * DOM 操作：100% Playwright 模拟真实用户（click, fill, keyboard）
 * Escape hatch（window.__test__）：仅用于 PixiJS canvas 无法可靠模拟的交互
 *   和游戏内部状态断言。
 */
export class PlayerSession {
  constructor(
    public readonly page: Page,
    private readonly baseUrl: string,
    private readonly user?: TestUser,
  ) {
    // auto-dismiss dialogs (confirm/alert) to prevent blocking
    this.page.on("dialog", async (d) => {
      await d.accept();
    });
  }

  /** ── DOM 操作 ── */

  async login(username?: string, password?: string) {
    const u = username ?? this.user?.username;
    const p = password ?? this.user?.password;
    if (!u || !p) throw new Error("login: username and password required");

    await this.page.goto(`${this.baseUrl}/login?__test__=1`);
    await this.page.fill('[data-testid="login-username"]', u);
    await this.page.fill('[data-testid="login-password"]', p);
    await this.page.click('[data-testid="login-submit"]');

    await expect(this.page.getByText(u)).toBeVisible({ timeout: 10000 });
  }

  async createRoom(opts?: { roomName?: string; password?: string }) {
    await this.page.goto(`${this.baseUrl}/?__test__=1`);
    await this.page.click('[data-testid="create-room"]');

    const name = opts?.roomName ?? `room-${Date.now()}`;
    await this.page.fill('[data-testid="create-room-name"]', name);
    if (opts?.password) {
      await this.page.fill('[data-testid="create-room-password"]', opts.password);
    }
    await this.page.click('[data-testid="create-room-submit"]');

    // wait for navigation to room page
    await this.page.waitForURL(/\/game\//, { timeout: 15000 });
    // wait for player list to appear
    await expect(this.page.locator('[data-testid="player-list"]')).toBeVisible({ timeout: 10000 });
  }

  async readyUp() {
    await this.page.click('[data-testid="ready-toggle"]');
  }

  async unready() {
    await this.page.click('[data-testid="ready-toggle"]');
  }

  async sendChat(message: string) {
    await this.page.fill('textarea', message);
    await this.page.keyboard.press("Enter");
    await expect(this.page.locator('[data-testid="chat-messages"]')).toContainText(message, { timeout: 5000 });
  }

  async surrender() {
    await this.page.click('[data-testid="surrender"]', { force: true });
  }

  async expectPlayerCount(count: number) {
    await expect(this.page.locator('[data-testid="player-list"] [data-player-id]')).toHaveCount(count);
  }

  async expectGameEndVisible() {
    await expect(this.page.locator('[data-testid="game-end-overlay"]')).toBeVisible({ timeout: 15000 });
  }

  /** ── Escape hatch（window.__test__） ── */

  async clickTile(x: number, y: number) {
    await this.page.evaluate(([cx, cy]) => window.__test__?.clickTile(cx, cy), [x, y]);
  }

  async getGameState() {
    return this.page.evaluate(() => window.__test__?.getGameState());
  }

  async getTileOwner(x: number, y: number): Promise<string | null> {
    return this.page.evaluate(([cx, cy]) => window.__test__?.getTileOwner(cx, cy) ?? null, [x, y]);
  }

  async waitForStatus(status: string, timeout = 30000) {
    await this.page.waitForFunction(
      (s) => window.__test__?.waitForStatus?.(s).then(() => true).catch(() => false),
      status,
      { timeout },
    );
  }

  async waitForWSConnected(timeout = 15000) {
    await this.page.waitForFunction(
      (t) => window.__test__?.waitForWSConnected(t).then(() => true).catch(() => false),
      timeout,
      { timeout: timeout + 5000 },
    );
  }

  async waitForTileOwner(x: number, y: number, owner: string, timeout = 10000) {
    await this.page.waitForFunction(
      ([cx, cy, o]) => window.__test__?.waitForTileOwner(cx, cy, o).then(() => true).catch(() => false),
      [x, y, owner],
      { timeout },
    );
  }

  /** ── 获取 roomId（从 URL 或 window.__test__） ── */
  async getRoomId(): Promise<string> {
    const url = this.page.url();
    const match = url.match(/\/game\/([^/?]+)/);
    if (match) return match[1];
    return this.page.evaluate(() => window.__test__?.roomId ?? "");
  }
}
