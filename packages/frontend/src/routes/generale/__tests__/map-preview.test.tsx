import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

vi.mock("~/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "1" }, isLoading: false }) }));

vi.mock("@solidjs/router", () => ({
  A: (props: any) => <a href={props.href}>{props.children}</a>,
  useLocation: () => ({ pathname: "/maps/preview" }),
  useParams: () => ({ id: "preview-456" }),
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

vi.mock("~/components/map-editor/MapPreview", () => ({
  default: (p: any) => <div data-testid="map-preview">MapPreview mapId={p.mapId}</div>,
}));

import MapPreviewPage from "../map-preview";

describe("MapPreview route", () => {
  it("renders MapPreview component", () => {
    render(() => <MapPreviewPage />);
    expect(screen.getByTestId("map-preview")).toBeInTheDocument();
    expect(screen.getByText(/preview-456/)).toBeInTheDocument();
  });
});
