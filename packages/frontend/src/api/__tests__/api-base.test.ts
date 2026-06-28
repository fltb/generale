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
    // opts spread replaces headers entirely (Content-Type is lost)
    expect(callHeaders).toHaveProperty("Authorization", "Bearer x");
    expect(callHeaders).not.toHaveProperty("Content-Type");
  });
});
