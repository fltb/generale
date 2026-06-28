import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Tabs, Tab } from "../Tabs";

describe("Tabs", () => {
  it("renders children tabs", () => {
    render(() => <Tabs><Tab>One</Tab><Tab>Two</Tab></Tabs>);
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });
  it("applies bordered class", () => {
    render(() => <Tabs bordered><Tab>X</Tab></Tabs>);
    const container = screen.getByText("X").parentElement!;
    expect(container.className).toContain("tabs-bordered");
  });
  it("has tabs class", () => {
    render(() => <Tabs><Tab>X</Tab></Tabs>);
    const container = screen.getByText("X").parentElement!;
    expect(container.className).toContain("tabs");
  });
});

describe("Tab", () => {
  it("renders with tab class", () => {
    render(() => <Tab href="/test">Link</Tab>);
    expect(screen.getByText("Link").className).toContain("tab");
  });
  it("applies active class", () => {
    render(() => <Tab active href="/">Active</Tab>);
    expect(screen.getByText("Active").className).toContain("tab-active");
  });
  it("calls onClick", () => {
    const handle = vi.fn((e) => e.preventDefault());
    render(() => <Tab href="#" onClick={handle}>Click</Tab>);
    fireEvent.click(screen.getByText("Click"));
    expect(handle).toHaveBeenCalled();
  });
});
