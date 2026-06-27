import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startBackend, type BackendController } from "./backend";
import { startFrontend, type FrontendController } from "./frontend";
import { PlayerSession } from "./playerSession";

export interface TestUser {
  username: string;
  password: string;
}

const DEFAULT_PASSWORD = "testpass123";
const TEST_USERS: TestUser[] = [
  { username: "test-alice", password: DEFAULT_PASSWORD },
  { username: "test-bob", password: DEFAULT_PASSWORD },
  { username: "test-charlie", password: DEFAULT_PASSWORD },
  { username: "test-diana", password: DEFAULT_PASSWORD },
];

export class TestScenario {
  private backendCtrl: BackendController | null = null;
  private frontendCtrl: FrontendController | null = null;
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  sessions: PlayerSession[] = [];

  async start(backendDir: string, frontendDir: string) {
    this.backendCtrl = await startBackend(backendDir);
    this.frontendCtrl = await startFrontend(frontendDir, this.backendCtrl.port);
    this.browser = await chromium.launch({ headless: true });
  }

  async createSession(user?: TestUser): Promise<PlayerSession> {
    const ctx = await this.browser!.newContext();
    this.contexts.push(ctx);
    const page = await ctx.newPage();
    const session = new PlayerSession(page, this.frontendCtrl!.url, user);
    this.sessions.push(session);
    return session;
  }

  get testUsers(): TestUser[] {
    return TEST_USERS;
  }

  frontendUrl(): string {
    return this.frontendCtrl!.url;
  }

  async stop() {
    for (const ctx of this.contexts) {
      await ctx.close().catch(() => {});
    }
    if (this.browser) await this.browser.close().catch(() => {});
    if (this.frontendCtrl) await this.frontendCtrl.stop().catch(() => {});
    if (this.backendCtrl) await this.backendCtrl.stop().catch(() => {});
  }
}
