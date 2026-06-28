import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

vi.mock("~/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "1" }, isLoading: false }) }));

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
    expect(screen.getByText("Map Workshop")).toBeInTheDocument();
    expect(screen.getByText("Create map")).toBeInTheDocument();
  });

  it("renders tabs", () => {
    render(() => <MapsPage />);
    expect(screen.getByText("Public maps")).toBeInTheDocument();
    expect(screen.getByText("My maps")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(() => <MapsPage />);
    expect(screen.getByPlaceholderText("Search by name or tag...")).toBeInTheDocument();
  });
});
