import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import Panel from "../Panel";

describe("Panel", () => {
  it("renders children", () => {
    render(() => <Panel><div>body</div></Panel>);
    expect(screen.getByText("body")).toBeInTheDocument();
  });
  it("renders title when provided", () => {
    render(() => <Panel title="My Panel">body</Panel>);
    expect(screen.getByText("My Panel")).toBeInTheDocument();
  });
  it("applies tone class", () => {
    render(() => <Panel tone="base-300">body</Panel>);
    expect(screen.getByText("body").className).toContain("bg-base-300");
  });
  it("defaults to base-200 tone", () => {
    render(() => <Panel>body</Panel>);
    expect(screen.getByText("body").className).toContain("bg-base-200");
  });
  it("applies titleClass to title", () => {
    render(() => <Panel title="Title" titleClass="text-lg">body</Panel>);
    expect(screen.getByText("Title").className).toContain("text-lg");
  });
  it("merges custom class", () => {
    render(() => <Panel class="my-panel">body</Panel>);
    expect(screen.getByText("body").className).toContain("my-panel");
  });
});
