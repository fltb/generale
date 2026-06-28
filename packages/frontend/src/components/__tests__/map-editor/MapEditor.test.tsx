import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("solid-pixi", () => ({
  Application: (p: any) => p.children ?? null,
  Container: (p: any) => p.children ?? null,
  Graphics: () => null,
  Text: () => null,
  Show: (p: any) => (p.when ? p.children : null),
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
  Application: vi.fn(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    render: vi.fn(),
    destroy: vi.fn(),
    stage: { addChild: vi.fn() },
    canvas: document.createElement("canvas"),
  })),
  TextStyle: vi.fn(() => ({})),
  Container: vi.fn(() => ({
    addChild: vi.fn(),
  })),
  Text: vi.fn(() => ({ anchor: { set: vi.fn() }, x: 0, y: 0 })),
}));

vi.mock("~/api/mapApi", () => ({
  createMapApi: vi.fn().mockResolvedValue({ data: { id: "new-id" } }),
  updateMapApi: vi.fn().mockResolvedValue({}),
  mapDetailApi: vi.fn().mockRejectedValue(new Error("not found")),
  discardDraftApi: vi.fn().mockResolvedValue({}),
  mapThumbnailUrl: vi.fn(() => "/api/maps/thumbnail/test"),
  uploadMapThumbnailApi: vi.fn().mockResolvedValue({}),
}));

vi.mock("~/utils/faIconGraphic", () => ({
  createIconFactory: () => ({
    createScaledIcon: vi.fn(() => ({ x: 0, y: 0 })),
    destroy: vi.fn(),
  }),
}));

vi.mock("~/components/MapTile", () => ({
  MapTile: () => null,
}));

vi.mock("~/ui", () => ({
  Button: (p: any) => <button {...p}>{p.children}</button>,
  Input: (p: any) => <input {...p} />,
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

import MapEditor from "~/components/map-editor/MapEditor";

describe("MapEditor", () => {
  it("renders editor with sidebar", () => {
    render(() => <MapEditor />);
    expect(screen.getByText("← 返回地图工坊")).toBeInTheDocument();
  });

  it("renders map name input", () => {
    render(() => <MapEditor />);
    expect(screen.getByPlaceholderText("输入地图名称")).toBeInTheDocument();
  });

  it("renders terrain type buttons", () => {
    render(() => <MapEditor />);
    expect(screen.getByText("平原")).toBeInTheDocument();
    expect(screen.getByText("王座")).toBeInTheDocument();
    expect(screen.getByText("兵营")).toBeInTheDocument();
  });

  it("renders save draft button", () => {
    render(() => <MapEditor />);
    expect(screen.getByText("保存草稿")).toBeInTheDocument();
  });

  it("renders publish button", () => {
    render(() => <MapEditor />);
    expect(screen.getByText("发布地图")).toBeInTheDocument();
  });

  it("renders width and height inputs", () => {
    render(() => <MapEditor />);
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });
});
