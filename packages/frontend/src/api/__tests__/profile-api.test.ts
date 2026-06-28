import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProfileApi, patchMyProfileApi } from "../profileApi";

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status, statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

beforeEach(() => vi.restoreAllMocks());

describe("getProfileApi", () => {
  it("GET /api/profile/:userId", async () => {
    vi.stubGlobal("fetch", mockFetch({ userId: "u1", username: "alice" }));
    const res = await getProfileApi("u1");
    expect((res as any).username).toBe("alice");
  });
});

describe("patchMyProfileApi", () => {
  it("PATCH /api/profile/me", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "Profile updated" }));
    const res = await patchMyProfileApi({ bio: "Hello" } as any);
    expect((res as any).message).toBe("Profile updated");
  });
});
