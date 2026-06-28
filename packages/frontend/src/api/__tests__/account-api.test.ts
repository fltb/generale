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
    vi.stubGlobal("fetch", mockFetch({ success: true, valid: true }));
    const res = await resetPasswordApi({ token: "t", newPassword: "new" });
    expect(res.valid).toBe(true);
  });

  it("changePasswordApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "changed" }));
    const res = await changePasswordApi({ currentPassword: "old", newPassword: "new" });
    expect(res.message).toBe("changed");
  });

  it("changeEmailApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "confirmation sent" }));
    const res = await changeEmailApi({ newEmail: "new@b.com", currentPassword: "pass" });
    expect(res.message).toBe("confirmation sent");
  });

  it("confirmEmailChangeApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "email changed" }));
    const res = await confirmEmailChangeApi({ token: "abc" });
    expect(res.message).toBe("email changed");
  });

  it("changeUsernameApi", async () => {
    vi.stubGlobal("fetch", mockFetch({ username: "newname" }));
    const res = await changeUsernameApi({ username: "newname" });
    expect(res.username).toBe("newname");
  });
});
