import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("~/api/mapApi", () => ({
  listMapsApi: vi.fn().mockResolvedValue({
    data: [
      { id: "m1", name: "Alpha", authorName: "User1", width: 20, height: 20, minPlayers: 2, maxPlayers: 4 },
      { id: "m2", name: "Beta", authorName: "User2", width: 30, height: 30, minPlayers: 2, maxPlayers: 6 },
    ],
  }),
  mapThumbnailUrl: vi.fn((id: string) => `/api/maps/thumbnail/${id}`),
}));

vi.mock("~/ui", () => ({
  Collapse: (p: any) => <div {...p} />,
  CollapseContent: (p: any) => <div {...p} />,
  CollapseTitle: (p: any) => <div {...p} />,
  Checkbox: () => null,
  Input: (p: any) => <input {...p} />,
  Button: (p: any) => <button {...p}>{p.children}</button>,
  Spinner: () => <div>Loading...</div>,
}));

import { MapSelector } from "~/components/map-editor/MapSelector";

describe("MapSelector", () => {
  it("renders placeholder when no map selected", () => {
    render(() => <MapSelector value="" onChange={vi.fn()} />);
    expect(screen.getByText("Select a map…")).toBeInTheDocument();
  });

  it("renders placeholder text", () => {
    render(() => <MapSelector value="" onChange={vi.fn()} placeholder="Pick a map" />);
    expect(screen.getByText("Pick a map")).toBeInTheDocument();
  });

  it("renders clear button", () => {
    render(() => <MapSelector value="m1" onChange={vi.fn()} />);
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(() => <MapSelector value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });
});
