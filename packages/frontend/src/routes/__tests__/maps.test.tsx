import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  useSearchParams: () => [() => ({}), vi.fn()],
  A: (p: any) => <a href={p.href}>{p.children}</a>,
}));

vi.mock("~/api/mapApi", () => ({
  listMapsApi: vi.fn(() => Promise.resolve({ data: [] })),
  myMapsApi: vi.fn(() => Promise.resolve({ data: [] })),
  deleteMapApi: vi.fn(),
  forkMapApi: vi.fn(),
  mapThumbnailUrl: (id: string) => `/api/maps/${id}/thumbnail`,
}));

// mock createResource to return empty data
vi.mock("solid-js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createResource: () => [() => [], { refetch: vi.fn(), loading: false }],
  };
});

import MapsPage from "../maps";

describe("Maps route", () => {
  it("renders heading and create button", () => {
    render(() => <MapsPage />);
    expect(screen.getByText("地图工坊")).toBeInTheDocument();
    expect(screen.getByText("创建地图")).toBeInTheDocument();
  });

  it("renders tabs", () => {
    render(() => <MapsPage />);
    expect(screen.getByText("公开地图")).toBeInTheDocument();
    expect(screen.getByText("我的地图")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(() => <MapsPage />);
    expect(screen.getByPlaceholderText("搜索名称或标签...")).toBeInTheDocument();
  });
});
