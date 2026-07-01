import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("~/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "1" }, isLoading: false }) }));

vi.mock("~/routes/games/generale/components/roomlist", () => ({
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
