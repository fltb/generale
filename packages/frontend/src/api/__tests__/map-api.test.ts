import { describe, it, expect, vi, beforeEach } from "vitest";
import { listMapsApi, myMapsApi, mapDetailApi, createMapApi, updateMapApi, deleteMapApi, forkMapApi, discardDraftApi } from "../mapApi";

function mockFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

beforeEach(() => vi.restoreAllMocks());

describe("listMapsApi", () => {
  it("GET /api/maps/list", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { maps: [] } }));
    const res = await listMapsApi();
    expect(Array.isArray((res as any).data.maps)).toBe(true);
  });
});

describe("myMapsApi", () => {
  it("GET /api/maps/my", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { maps: [] } }));
    const res = await myMapsApi();
    expect(Array.isArray((res as any).data.maps)).toBe(true);
  });
});

describe("mapDetailApi", () => {
  it("GET /api/maps/detail/:id", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { id: "m1", name: "My Map" } }));
    const res = await mapDetailApi("m1");
    expect((res as any).data.id).toBe("m1");
  });

  it("passes draft=0 when draft=false", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ data: { id: "m1" } })),
    });
    vi.stubGlobal("fetch", fn);
    await mapDetailApi("m1", false);
    expect(fn.mock.calls[0][0]).toContain("draft=0");
  });
});

describe("createMapApi", () => {
  it("POST /api/maps/create", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { message: "ok", id: "m1" } }));
    const res = await createMapApi({ name: "New Map" } as any);
    expect((res as any).data.id).toBe("m1");
  });
});

describe("updateMapApi", () => {
  it("PATCH /api/maps/update/:id", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { message: "ok", id: "m1" } }));
    const res = await updateMapApi("m1", { name: "Updated" } as any);
    expect((res as any).data.id).toBe("m1");
  });
});

describe("deleteMapApi", () => {
  it("DELETE /api/maps/delete/:id", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true }));
    const res = await deleteMapApi("m1");
    expect((res as any).success).toBe(true);
  });
});

describe("forkMapApi", () => {
  it("POST /api/maps/fork/:id", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { message: "ok", id: "m1" } }));
    const res = await forkMapApi("m1");
    expect((res as any).data.id).toBe("m1");
  });
});

describe("discardDraftApi", () => {
  it("POST /api/maps/discard-draft/:id", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true }));
    const res = await discardDraftApi("m1");
    expect((res as any).success).toBe(true);
  });
});
