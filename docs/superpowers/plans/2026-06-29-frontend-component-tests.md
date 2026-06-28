# 前端组件测试实现计划

**Goal:** 用 vitest 给 frontend package 添加组件/API/工具函数/钩子的自动化测试，覆盖 ui/ components/ api/ hooks/ utils/ 五个模块。

**Architecture:** 安装 vitest + happy-dom + @solidjs/testing-library，与现有 bun:test 共存。采用 vitest 配置将已有 bun:test 测试排除在外，新测试放在 `src/**/__tests__/*.test.tsx`。

**Tech Stack:** vitest, happy-dom, @solidjs/testing-library, @testing-library/jest-dom

**执行方式:** 手动执行（不派发 subagent），每个 task 写测试 → 运行看失败 → 写源码（如需要 mock 则 mock）→ 运行看通过 → commit。

## Global Constraints

- 使用 vitest（不是 bun:test）编写新测试
- 不修改现有 bun:test 测试文件
- path alias `~/*` → `src/*` 在 vitest 中通过 `resolve.alias` 配置
- 测试文件命名: `*.test.ts`（纯逻辑）/ `*.test.tsx`（组件）
- 质量 > 数量，每个类型选代表性组件/函数写少量但值得维护的测试

---

### Task 1: vitest 配置与安装

**Files:**
- Modify: `packages/frontend/package.json` — 添加 vitest devDep
- Create: `packages/frontend/vitest.config.ts`
- Create: `packages/frontend/src/__tests__/setup.ts`

- [ ] **Step 1: 安装依赖**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend
bun add -d vitest@^3 happy-dom@^16
bun add -d @solidjs/testing-library@^0.8 @testing-library/jest-dom@^6
```

- [ ] **Step 2: 创建 vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // 不跑 bun:test 已有的测试文件
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
```

- [ ] **Step 3: 创建 setup 文件**

```ts
// src/__tests__/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: 验证配置 —— 写一个 smoke test**

```ts
// src/__tests__/vitest-smoke.test.ts
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 运行验证**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend
npx vitest run --reporter verbose
```

Expected: 1 pass (smoke test only)

- [ ] **Step 6: 添加 npm script**

在 `package.json` 的 scripts 加一行：

```json
"test:vitest": "vitest run --reporter verbose"
```

删除 smoke test:

```bash
rm src/__tests__/vitest-smoke.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/package.json packages/frontend/vitest.config.ts packages/frontend/src/__tests__/
git commit -m "test(frontend): add vitest config with happy-dom + testing-library"
```

---

### Task 2: Utils 纯函数测试

**Files:**
- Create: `src/utils/__tests__/playerColor.test.ts`
- Create: `src/utils/__tests__/playerDisplay.test.ts`

这些是纯函数，最简单，零依赖。

- [ ] **Step 1: 写 playerColor 测试**

```ts
// src/utils/__tests__/playerColor.test.ts
import { describe, it, expect } from "vitest";
import { tileColorNumber, playerColorCss, DEFAULT_TILE_COLOR_NUMBER, DEFAULT_PLAYER_COLOR_CSS } from "../playerColor";

describe("tileColorNumber", () => {
  it("returns number as-is", () => {
    expect(tileColorNumber(0xff0000)).toBe(0xff0000);
  });

  it("resolves string enum name to number", () => {
    // "Red" should map to PlayerColor.Red (which is a number)
    const result = tileColorNumber("Red");
    expect(typeof result).toBe("number");
    expect(result).not.toBe(DEFAULT_TILE_COLOR_NUMBER);
  });

  it("returns fallback for unknown string", () => {
    expect(tileColorNumber("HotPink" as any, 0xcccccc)).toBe(0xcccccc);
  });

  it("returns fallback for undefined", () => {
    expect(tileColorNumber(undefined)).toBe(DEFAULT_TILE_COLOR_NUMBER);
  });

  it("returns custom fallback when provided", () => {
    expect(tileColorNumber(undefined, 0x123456)).toBe(0x123456);
  });
});

describe("playerColorCss", () => {
  it("formats number to #rrggbb", () => {
    expect(playerColorCss(0xff0000)).toBe("#ff0000");
  });

  it("resolves string enum to css", () => {
    const css = playerColorCss("Red");
    expect(css).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns fallback for null/undefined", () => {
    expect(playerColorCss(null as any)).toBe(DEFAULT_PLAYER_COLOR_CSS);
    expect(playerColorCss(undefined)).toBe(DEFAULT_PLAYER_COLOR_CSS);
  });

  it("returns custom fallback", () => {
    expect(playerColorCss(undefined, "#123456")).toBe("#123456");
  });
});
```

- [ ] **Step 2: 运行看失败（文件引用不存在）**

```bash
npx vitest run src/utils/__tests__/playerColor.test.ts --reporter verbose
```

Expected: 不存在的 import 错误（没关系，src 文件已在）

- [ ] **Step 3: 写 playerDisplay 测试**

```ts
// src/utils/__tests__/playerDisplay.test.ts
import { describe, it, expect } from "vitest";
import { resolveDisplayNames } from "../playerDisplay";

describe("resolveDisplayNames", () => {
  it("uses displayName when unique", () => {
    const players = [
      { id: "p1", name: "alice", displayName: "Alice" },
      { id: "p2", name: "bob", displayName: "Bob" },
    ];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("Alice");
    expect(map.get("p2")).toBe("Bob");
  });

  it("disambiguates duplicate displayNames with #username", () => {
    const players = [
      { id: "p1", name: "alice", displayName: "Player" },
      { id: "p2", name: "bob", displayName: "Player" },
    ];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("Player#alice");
    expect(map.get("p2")).toBe("Player#bob");
  });

  it("falls back to name when displayName is null", () => {
    const players = [
      { id: "p1", name: "alice", displayName: null },
      { id: "p2", name: "bob", displayName: "Bob" },
    ];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("alice");
    expect(map.get("p2")).toBe("Bob");
  });

  it("handles empty array", () => {
    const map = resolveDisplayNames([]);
    expect(map.size).toBe(0);
  });

  it("single player does not self-disambiguate", () => {
    const players = [{ id: "p1", name: "alice", displayName: "Alice" }];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("Alice");
  });
});
```

- [ ] **Step 4: 运行两个测试**

```bash
npx vitest run src/utils/__tests__/playerColor.test.ts src/utils/__tests__/playerDisplay.test.ts --reporter verbose
```

Expected: 2 suites, both pass

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/utils/__tests__/
git commit -m "test(frontend): add util function tests (playerColor + playerDisplay)"
```

---

### Task 3: API 客户端测试

**Files:**
- Create: `src/api/__tests__/api-base.test.ts`
- Create: `src/api/__tests__/auth-api.test.ts`
- Create: `src/api/__tests__/account-api.test.ts`

API 函数是 fetch 的薄封装。用 `vi.stubGlobal('fetch', mockFn)` mock 网络层。

- [ ] **Step 1: 写 base.test.ts**

```ts
// src/api/__tests__/api-base.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../base";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api()", () => {
  it("sends credentials:include and json headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    });
    vi.stubGlobal("fetch", mockFetch);

    await api("/api/test", { method: "POST", body: JSON.stringify({ foo: 1 }) });

    expect(mockFetch).toHaveBeenCalledWith("/api/test", {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ foo: 1 }),
    });
  });

  it("returns parsed JSON on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ user: { id: "u1" } })),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await api("/api/me");
    expect(result).toEqual({ user: { id: "u1" } });
  });

  it("throws ApiError on non-ok status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable",
      text: () => Promise.resolve(JSON.stringify({ error: "Validation failed" })),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      await api("/api/test");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).message).toBe("Validation failed");
    }
  });

  it("handles non-json response gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve("plain text"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await api("/api/test");
    expect(result).toBe("plain text");
  });

  it("allows overriding headers via opts", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await api("/api/test", { headers: { Authorization: "Bearer x" } });

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders).toHaveProperty("Content-Type", "application/json");
    expect(callHeaders).toHaveProperty("Authorization", "Bearer x");
  });
});
```

- [ ] **Step 2: 运行验证**

```bash
npx vitest run src/api/__tests__/api-base.test.ts --reporter verbose
```

Expected: 5 pass

- [ ] **Step 3: 写 auth-api.test.ts**

```ts
// src/api/__tests__/auth-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { meApi, loginApi, registerApi, logoutApi, verifyApi, patchProfileApi } from "../auth";

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("meApi", () => {
  it("GET /api/me", async () => {
    vi.stubGlobal("fetch", mockFetch({ user: { id: "u1", username: "alice" } }));
    const res = await meApi();
    expect(res.user.id).toBe("u1");
  });
});

describe("loginApi", () => {
  it("POST /api/login with payload", async () => {
    vi.stubGlobal("fetch", mockFetch({ user: { id: "u1" } }));
    const res = await loginApi({ username: "alice", password: "pass" });
    expect(res.user.id).toBe("u1");
  });
});

describe("registerApi", () => {
  it("POST /api/register", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "registered" }));
    const res = await registerApi({ username: "bob", password: "pass", email: "b@b.com" });
    expect(res.message).toBe("registered");
  });
});

describe("logoutApi", () => {
  it("POST /api/logout", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true }));
    const res = await logoutApi();
    expect(res.ok).toBe(true);
  });
});

describe("verifyApi", () => {
  it("POST /api/verify", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "verified" }));
    const res = await verifyApi({ token: "abc" });
    expect(res.message).toBe("verified");
  });
});

describe("patchProfileApi", () => {
  it("PATCH /api/me", async () => {
    vi.stubGlobal("fetch", mockFetch({ user: { id: "u1", email: "new@b.com" } }));
    const res = await patchProfileApi({ email: "new@b.com" });
    expect(res.user.email).toBe("new@b.com");
  });
});
```

- [ ] **Step 4: 运行验证**

```bash
npx vitest run src/api/__tests__/auth-api.test.ts --reporter verbose
```

Expected: 6 pass

- [ ] **Step 5: 写 account-api.test.ts**

```ts
// src/api/__tests__/account-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { forgotPasswordApi, resetPasswordApi, changePasswordApi, changeEmailApi, confirmEmailChangeApi, changeUsernameApi } from "../accountApi";

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("accountApi", () => {
  it("forgotPasswordApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "email sent" }));
    const res = await forgotPasswordApi({ email: "a@b.com" });
    expect(res.message).toBe("email sent");
  });

  it("resetPasswordApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ token: "reset-token" }));
    const res = await resetPasswordApi({ token: "t", password: "new" });
    expect(res.token).toBe("reset-token");
  });

  it("changePasswordApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "changed" }));
    const res = await changePasswordApi({ currentPassword: "old", newPassword: "new" });
    expect(res.message).toBe("changed");
  });

  it("changeEmailApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "confirmation sent" }));
    const res = await changeEmailApi({ newEmail: "new@b.com", password: "pass" });
    expect(res.message).toBe("confirmation sent");
  });

  it("confirmEmailChangeApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "email changed" }));
    const res = await confirmEmailChangeApi({ token: "abc" });
    expect(res.message).toBe("email changed");
  });

  it("changeUsernameApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ username: "newname" }));
    const res = await changeUsernameApi({ username: "newname", password: "pass" });
    expect(res.username).toBe("newname");
  });
});
```

- [ ] **Step 6: 运行验证**

```bash
npx vitest run src/api/__tests__/ --reporter verbose
```

Expected: 3 suites, ~17 tests, all pass

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/api/__tests__/
git commit -m "test(frontend): add API client tests (base + auth + account)"
```

---

### Task 4: UI 组件基础测试

**Files:**
- Create: `src/ui/__tests__/Button.test.tsx`
- Create: `src/ui/__tests__/Modal.test.tsx`
- Create: `src/ui/__tests__/Input.test.tsx`

UI 组件是 daisyUI 的薄封装，测试渲染 + props。

- [ ] **Step 1: 写 Button 测试**

```tsx
// src/ui/__tests__/Button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Button } from "../Button";

// mock sound.ts so AudioContext isn't needed in tests
vi.mock("../sound", () => ({
  sfx: { click: vi.fn() },
}));

describe("Button", () => {
  it("renders children text", () => {
    render(() => <Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("applies variant class", () => {
    render(() => <Button variant="primary">Primary</Button>);
    const btn = screen.getByText("Primary");
    expect(btn.className).toContain("btn-primary");
  });

  it("applies size class", () => {
    render(() => <Button size="sm">Small</Button>);
    const btn = screen.getByText("Small");
    expect(btn.className).toContain("btn-sm");
  });

  it("applies active class", () => {
    render(() => <Button active>Active</Button>);
    const btn = screen.getByText("Active");
    expect(btn.className).toContain("btn-active");
  });

  it("applies outline class", () => {
    render(() => <Button outline>Outline</Button>);
    const btn = screen.getByText("Outline");
    expect(btn.className).toContain("btn-outline");
  });

  it("applies circle class", () => {
    render(() => <Button circle>Circle</Button>);
    const btn = screen.getByText("Circle");
    expect(btn.className).toContain("btn-circle");
  });

  it("applies block class", () => {
    render(() => <Button block>Block</Button>);
    const btn = screen.getByText("Block");
    expect(btn.className).toContain("btn-block");
  });

  it("merges custom class", () => {
    render(() => <Button class="my-custom">Custom</Button>);
    const btn = screen.getByText("Custom");
    expect(btn.className).toContain("my-custom");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(() => <Button onClick={onClick}>Clickable</Button>);
    fireEvent.click(screen.getByText("Clickable"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled button", () => {
    render(() => <Button disabled>Disabled</Button>);
    const btn = screen.getByText("Disabled");
    expect(btn).toBeDisabled();
  });

  it("renders default variant (neutral) when variant not specified", () => {
    render(() => <Button>No Variant</Button>);
    const btn = screen.getByText("No Variant");
    // neutral variant has no class suffix
    expect(btn.className).toContain("btn");
  });
});
```

- [ ] **Step 2: 运行验证**

```bash
npx vitest run src/ui/__tests__/Button.test.tsx --reporter verbose
```

Expected: 10 pass

- [ ] **Step 3: 写 Modal 测试**

```tsx
// src/ui/__tests__/Modal.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Modal } from "../Modal";

describe("Modal", () => {
  it("renders children", () => {
    render(() => <Modal><div>Hello Modal</div></Modal>);
    expect(screen.getByText("Hello Modal")).toBeInTheDocument();
  });

  it("renders with modal-open class", () => {
    render(() => <Modal>Content</Modal>);
    const overlay = screen.getByText("Content").parentElement?.parentElement;
    expect(overlay?.className).toContain("modal-open");
  });

  it("applies boxClass to the modal-box", () => {
    render(() => <Modal boxClass="max-w-2xl">Content</Modal>);
    const box = screen.getByText("Content").parentElement;
    expect(box?.className).toContain("max-w-2xl");
  });

  it("renders pixel-border on modal-box", () => {
    render(() => <Modal>Content</Modal>);
    const box = screen.getByText("Content").parentElement;
    expect(box?.className).toContain("pixel-border");
  });
});
```

- [ ] **Step 4: 运行验证**

```bash
npx vitest run src/ui/__tests__/Modal.test.tsx --reporter verbose
```

Expected: 4 pass

- [ ] **Step 5: 写 Input 测试**

```tsx
// src/ui/__tests__/Input.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Input } from "../Input";

describe("Input", () => {
  it("renders with placeholder", () => {
    render(() => <Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("applies size class", () => {
    render(() => <Input size="sm" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("input-sm");
  });

  it("applies bordered class", () => {
    render(() => <Input bordered />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("input-bordered");
  });

  it("merges custom class", () => {
    render(() => <Input class="my-input" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("my-input");
  });

  it("forwards value and onInput", () => {
    const handleInput = vi.fn();
    render(() => <Input value="hello" onInput={handleInput} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("hello");
    fireEvent.input(input, { target: { value: "world" } });
    expect(handleInput).toHaveBeenCalled();
  });

  it("renders disabled input", () => {
    render(() => <Input disabled />);
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });

  it("has pixel-border class by default", () => {
    render(() => <Input />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("pixel-border");
  });
});
```

- [ ] **Step 6: 运行验证**

```bash
npx vitest run src/ui/__tests__/Input.test.tsx --reporter verbose
```

Expected: 7 pass

- [ ] **Step 7: 整体运行 UI 测试**

```bash
npx vitest run src/ui/__tests__/ --reporter verbose
```

Expected: 3 suites, ~21 tests, all pass

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/ui/__tests__/
git commit -m "test(frontend): add UI primitive tests (Button, Modal, Input)"
```

---

### Task 5: 业务组件测试

**Files:**
- Create: `src/components/__tests__/Avatar.test.tsx`

Avatar 是最简单的业务组件（纯 presentation，无外部依赖）。

- [ ] **Step 1: 写 Avatar 测试**

```tsx
// src/components/__tests__/Avatar.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
  it("renders img with src", () => {
    render(() => <Avatar src="/avatar.png" alt="Alice" />);
    const img = screen.getByAltText("Alice") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("/avatar.png");
  });

  it("uses default size 40 when size not provided", () => {
    render(() => <Avatar src="/a.png" />);
    const container = screen.getByAltText("avatar").parentElement!;
    expect(container.style.width).toBe("40px");
    expect(container.style.height).toBe("40px");
  });

  it("uses custom size", () => {
    render(() => <Avatar src="/a.png" size={64} />);
    const container = screen.getByAltText("avatar").parentElement!;
    expect(container.style.width).toBe("64px");
    expect(container.style.height).toBe("64px");
  });

  it("applies custom class", () => {
    render(() => <Avatar src="/a.png" class="ring-2" />);
    const container = screen.getByAltText("avatar").parentElement!;
    expect(container.className).toContain("ring-2");
  });

  it("renders with rounded-full class", () => {
    render(() => <Avatar src="/a.png" alt="Bob" />);
    const container = screen.getByAltText("Bob").parentElement!;
    expect(container.className).toContain("rounded-full");
  });

  it("has object-cover on img", () => {
    render(() => <Avatar src="/a.png" />);
    const img = screen.getByAltText("avatar");
    expect(img.className).toContain("object-cover");
  });
});
```

- [ ] **Step 2: 运行验证**

```bash
npx vitest run src/components/__tests__/Avatar.test.tsx --reporter verbose
```

Expected: 6 pass

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/__tests__/
git commit -m "test(frontend): add Avatar component tests"
```

---

### Task 6: Hook 测试（useAuth）

**Files:**
- Create: `src/hooks/__tests__/useAuth.test.tsx`

useAuth 依赖 TanStack Query 的 Context。需要提供 QueryClientProvider 包装。

- [ ] **Step 1: 写 useAuth 测试**

```tsx
// src/hooks/__tests__/useAuth.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { AuthProvider, useAuth } from "../useAuth";

// mock the api modules
vi.mock("~/api/auth", () => ({
  meApi: vi.fn(),
  loginApi: vi.fn(),
  registerApi: vi.fn(),
  logoutApi: vi.fn(),
  verifyApi: vi.fn(),
  patchProfileApi: vi.fn(),
}));

import * as authApi from "~/api/auth";

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="user">{auth.user?.username ?? "null"}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <button data-testid="login-btn" onClick={() => auth.login({ username: "test", password: "pass" })}>
        Login
      </button>
      <button data-testid="logout-btn" onClick={() => auth.logout()}>
        Logout
      </button>
    </div>
  );
}

function renderWithProviders() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(() => (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </QueryClientProvider>
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAuth", () => {
  it("shows null user initially when meApi returns no data", async () => {
    vi.mocked(authApi.meApi).mockResolvedValue({ user: undefined as any });
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });

  it("shows user after successful login", async () => {
    vi.mocked(authApi.meApi).mockResolvedValue({ user: undefined as any });
    vi.mocked(authApi.loginApi).mockResolvedValue({ user: { id: "u1", username: "alice" } as any });

    renderWithProviders();

    // wait for initial query
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });

    // click login
    fireEvent.click(screen.getByTestId("login-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("alice");
    });
  });

  it("shows null user after logout", async () => {
    vi.mocked(authApi.meApi).mockResolvedValue({ user: undefined as any });
    vi.mocked(authApi.loginApi).mockResolvedValue({ user: { id: "u1", username: "alice" } as any });
    vi.mocked(authApi.logoutApi).mockResolvedValue({ ok: true } as any);

    renderWithProviders();

    // login first
    fireEvent.click(screen.getByTestId("login-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("alice");
    });

    // logout
    fireEvent.click(screen.getByTestId("logout-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });

  it("throws error if used outside AuthProvider", () => {
    // suppress console.error from the error boundary
    const orig = console.error;
    console.error = vi.fn();
    expect(() => render(() => {
      const Test = () => { useAuth(); return <div />; };
      return <Test />;
    })).toThrow("useAuth must be used inside AuthProvider");
    console.error = orig;
  });
});
```

- [ ] **Step 2: 运行验证**

```bash
npx vitest run src/hooks/__tests__/useAuth.test.tsx --reporter verbose
```

Expected: 4 pass

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/hooks/__tests__/
git commit -m "test(frontend): add useAuth hook tests"
```

---

### Task 7: 最终验证

- [ ] **Step 1: 运行全部 vitest 测试**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend
npx vitest run --reporter verbose
```

Expected: 所有新测试通过（utils + api + ui + components + hooks），旧的 bun:test 测试不被影响

- [ ] **Step 2: 确认现有 bun:test 仍可运行**

```bash
cd /home/float/myfile/Projects/generale-vue/packages/frontend
bun test
```

Expected: 原有的 30 个 bun:test 用例仍正常通过

- [ ] **Step 3: 最终 commit（如有未 commit 的内容）**

```bash
git add -A
git status
```
