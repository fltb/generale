import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(() => <Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("applies variant class", () => {
    render(() => <Badge variant="success">OK</Badge>);
    expect(screen.getByText("OK").className).toContain("badge-success");
  });

  it("has pixel-border by default", () => {
    render(() => <Badge>Border</Badge>);
    expect(screen.getByText("Border").className).toContain("pixel-border");
  });

  it("applies outline variant", () => {
    render(() => <Badge variant="outline">Outline</Badge>);
    expect(screen.getByText("Outline").className).toContain("badge-outline");
  });
});
