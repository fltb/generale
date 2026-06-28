import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  useParams: () => ({ id: "map-123" }),
}));

vi.mock("~/components/map-editor/MapEditor", () => ({
  default: (p: any) => <div data-testid="map-editor">MapEditor mapId={p.mapId}</div>,
}));

import MapEditorPage from "../map-editor";

describe("MapEditor route", () => {
  it("renders MapEditor component", () => {
    render(() => <MapEditorPage />);
    expect(screen.getByTestId("map-editor")).toBeInTheDocument();
    expect(screen.getByText(/map-123/)).toBeInTheDocument();
  });
});
