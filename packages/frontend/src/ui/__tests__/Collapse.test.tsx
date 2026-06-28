import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Collapse, CollapseContent, CollapseTitle } from "../Collapse";

describe("Collapse", () => {
  it("renders children", () => {
    render(() => <Collapse><div>content</div></Collapse>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
  it("has pixel-border class", () => {
    render(() => <Collapse><div>c</div></Collapse>);
    const div = screen.getByText("c").parentElement!;
    expect(div.className).toContain("pixel-border");
  });
  it("applies arrow class when arrow prop set", () => {
    render(() => <Collapse arrow><div>a</div></Collapse>);
    const div = screen.getByText("a").parentElement!;
    expect(div.className).toContain("collapse-arrow");
  });
  it("merges custom class", () => {
    render(() => <Collapse class="my-custom"><div>c</div></Collapse>);
    const div = screen.getByText("c").parentElement!;
    expect(div.className).toContain("my-custom");
  });
});

describe("CollapseTitle", () => {
  it("renders with collapse-title class", () => {
    render(() => <CollapseTitle>Title</CollapseTitle>);
    expect(screen.getByText("Title").className).toContain("collapse-title");
  });
});

describe("CollapseContent", () => {
  it("renders with collapse-content class", () => {
    render(() => <CollapseContent>Body</CollapseContent>);
    expect(screen.getByText("Body").className).toContain("collapse-content");
  });
});
