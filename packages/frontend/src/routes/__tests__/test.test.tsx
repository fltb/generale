import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(), A: (p: any) => <a href={p.href}>{p.children}</a>,
}));

import Test from "../test";

describe("Test route", () => {
  it("renders placeholder", () => {
    render(() => <Test />);
    expect(screen.getByText("Test page placeholder")).toBeInTheDocument();
  });
});
