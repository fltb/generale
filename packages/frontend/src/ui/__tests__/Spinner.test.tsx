import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import Spinner from "../Spinner";

describe("Spinner", () => {
  it("renders with spinner class", () => {
    const { container } = render(() => <Spinner />);
    expect(container.firstElementChild!.className).toContain("loading");
    expect(container.firstElementChild!.className).toContain("loading-spinner");
  });
  it("applies size class", () => {
    const { container } = render(() => <Spinner size="lg" />);
    expect(container.firstElementChild!.className).toContain("loading-lg");
  });
  it("defaults to md if no size", () => {
    const { container } = render(() => <Spinner />);
    expect(container.firstElementChild!.className).toContain("loading-md");
  });
  it("merges custom class", () => {
    const { container } = render(() => <Spinner class="my-spinner" />);
    expect(container.firstElementChild!.className).toContain("my-spinner");
  });
});
