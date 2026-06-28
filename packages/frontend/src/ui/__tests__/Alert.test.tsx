import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Alert } from "../Alert";

describe("Alert", () => {
  it("renders children", () => {
    render(() => <Alert>Hello</Alert>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies variant class", () => {
    render(() => <Alert variant="error">Error</Alert>);
    expect(screen.getByText("Error").className).toContain("alert-error");
  });

  it("has pixel-border by default", () => {
    render(() => <Alert>Border</Alert>);
    expect(screen.getByText("Border").className).toContain("pixel-border");
  });

  it("merges custom class", () => {
    render(() => <Alert class="my-alert">Custom</Alert>);
    expect(screen.getByText("Custom").className).toContain("my-alert");
  });
});
