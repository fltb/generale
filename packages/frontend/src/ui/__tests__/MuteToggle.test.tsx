import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import MuteToggle from "../MuteToggle";

vi.mock("../sound", () => ({
  isMuted: () => false,
  toggleMuted: vi.fn(),
}));

describe("MuteToggle", () => {
  it("renders speaker button", () => {
    render(() => <MuteToggle />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
  it("applies custom class", () => {
    render(() => <MuteToggle class="my-btn" />);
    expect(screen.getByRole("button").className).toContain("my-btn");
  });
});
