import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

vi.mock("~/components/roomlist", () => ({
  default: () => <div data-testid="roomlist">Active Rooms</div>,
}));

import GeneraleHub from "../index";

describe("GeneraleHub", () => {
  it("renders RoomList component", () => {
    render(() => <GeneraleHub />);
    expect(screen.getByTestId("roomlist")).toBeInTheDocument();
    expect(screen.getByText("Active Rooms")).toBeInTheDocument();
  });
});
