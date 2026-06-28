import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";

vi.mock("solid-pixi", () => ({
  Application: (p: any) => p.children ?? null,
  Container: (p: any) => p.children ?? null,
  Graphics: () => null,
  Text: () => null,
}));

vi.mock("pixi.js", () => ({
  Graphics: vi.fn(() => ({
    clear: vi.fn(),
    removeChildren: vi.fn(),
    addChild: vi.fn(() => ({ x: 0, y: 0 })),
    rect: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
  })),
  TextStyle: vi.fn(() => ({})),
}));

vi.mock("~/utils/faIconGraphic", () => ({
  createIconFactory: () => ({
    createScaledIcon: vi.fn(() => ({ x: 0, y: 0 })),
    destroy: vi.fn(),
  }),
}));

vi.mock("~/api/mapApi", () => ({
  mapDetailApi: vi.fn().mockResolvedValue({
    data: {
      id: "map1",
      name: "Test Map",
      width: 10,
      height: 10,
      tiles: Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({ type: "PLAIN", army: 0 })),
      ),
    },
  }),
  mapThumbnailUrl: vi.fn(() => ""),
}));

vi.mock("~/components/MapTile", () => ({
  MapTile: () => null,
}));

vi.mock("@solidjs/router", () => ({
  A: (p: any) => <a {...p}>{p.children}</a>,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({}), vi.fn()],
}));

vi.mock("solid-js", async () => {
  const actual = await vi.importActual("solid-js");
  return {
    ...actual as any,
    onMount: (fn: () => any) => {
      if (typeof fn === "function") {
        const r = fn();
        if (r && typeof r.then === "function") {
          return r;
        }
      }
    },
  };
});

import MapPreview from "~/components/map-editor/MapPreview";

describe("MapPreview", () => {
  it("shows loading state initially", () => {
    render(() => <MapPreview mapId="map1" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders map name after loading", async () => {
    render(() => <MapPreview mapId="map1" />);
    await waitFor(() => {
      expect(screen.getByText("Test Map")).toBeInTheDocument();
    });
  });

  it("renders dimensions after loading", async () => {
    render(() => <MapPreview mapId="map1" />);
    await waitFor(() => {
      expect(screen.getByText("10×10")).toBeInTheDocument();
    });
  });

  it("renders back link", () => {
    render(() => <MapPreview mapId="map1" />);
    expect(screen.getByText("← Back")).toBeInTheDocument();
  });
});
