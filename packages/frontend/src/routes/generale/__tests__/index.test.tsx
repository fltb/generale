import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  A: (p: any) => <a href={p.href}>{p.children}</a>,
}));

vi.mock("~/components/roomlist", () => ({
  default: () => <div data-testid="roomlist">Active Rooms</div>,
}));

import GeneraleHub from "../index";

describe("GeneraleHub", () => {
  it("renders GENERAL E title", () => {
    render(() => <GeneraleHub />);
    expect(screen.getByText("GENERAL E")).toBeInTheDocument();
  });

  it("renders Rooms tab (active) and Maps tab linking to /maps", () => {
    render(() => <GeneraleHub />);
    const rooms = screen.getByText("Rooms");
    expect(rooms).toBeInTheDocument();

    const maps = screen.getByText("Maps");
    expect(maps).toBeInTheDocument();
    expect(maps.closest("a")).toHaveAttribute("href", "/maps");
  });

  it("renders RoomList component", () => {
    render(() => <GeneraleHub />);
    expect(screen.getByTestId("roomlist")).toBeInTheDocument();
    expect(screen.getByText("Active Rooms")).toBeInTheDocument();
  });
});
