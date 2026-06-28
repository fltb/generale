import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null }));
vi.mock("@solidjs/start", () => ({ HttpStatusCode: () => null }));

import NotFound from "../[...404]";

describe("404 route", () => {
  it("renders not found heading", () => {
    render(() => <NotFound />);
    expect(screen.getByText("Page Not Found")).toBeInTheDocument();
  });

  it("renders link to solid start", () => {
    render(() => <NotFound />);
    const link = screen.getByText("start.solidjs.com");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://start.solidjs.com");
  });
});
