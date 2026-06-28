import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

import About from "../about";

describe("About route", () => {
  it("renders about page content", () => {
    render(() => <About />);
    expect(screen.getByText("About")).toBeInTheDocument();
  });
});
