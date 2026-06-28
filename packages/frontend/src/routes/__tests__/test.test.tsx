import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("solid-pixi", () => ({
  Application: (p: any) => p.children ?? null,
}));

vi.mock("~/components/__tests__/MapRenderTest", () => ({
  default: () => <div data-testid="map-render-test">MapRenderTest</div>,
}));

import Test from "../test";

describe("Test route", () => {
  it("renders MapRenderTest component", () => {
    render(() => <Test />);
    expect(screen.getByTestId("map-render-test")).toBeInTheDocument();
  });
});
