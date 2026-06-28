import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  useParams: () => ({ id: "preview-456" }),
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
