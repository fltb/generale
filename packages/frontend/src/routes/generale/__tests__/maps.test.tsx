import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

vi.mock("~/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));

vi.mock("@solidjs/router", () => ({
  A: (props: any) => <a href={props.href}>{props.children}</a>,
  useLocation: () => ({ pathname: "/maps" }),
  useSearchParams: () => [() => ({}), vi.fn()],
  useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/solid-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("~/api/gameApi", () => ({
  createGameApi: vi.fn(),
}));

vi.mock("~/components/map-editor/MapSelector", () => ({
  MapSelector: (p: any) => (
    <select data-testid="map-selector" value={p.value} onChange={(e) => p.onChange(e.currentTarget.value)}>
      <option value="">{p.placeholder}</option>
    </select>
  ),
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
