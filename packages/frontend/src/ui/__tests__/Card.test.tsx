import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Card } from "../Card";

describe("Card", () => {
  it("renders children", () => {
    render(() => <Card>Content</Card>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("has pixel-border by default", () => {
    render(() => <Card>Border</Card>);
    expect(screen.getByText("Border").className).toContain("pixel-border");
  });

  it("merges custom class", () => {
    render(() => <Card class="my-card">Custom</Card>);
    expect(screen.getByText("Custom").className).toContain("my-card");
  });

  it("renders as div element", () => {
    render(() => <Card>Div</Card>);
    expect(screen.getByText("Div").tagName).toBe("DIV");
  });
});
