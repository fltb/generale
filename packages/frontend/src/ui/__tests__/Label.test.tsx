import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Label, LabelText, LabelTextAlt } from "../Label";

describe("Label", () => {
  it("renders children via spread", () => {
    render(() => <Label><span>child</span></Label>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });
  it("renders text via text prop", () => {
    render(() => <Label text="Email" />);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });
  it("renders alt text via alt prop", () => {
    render(() => <Label alt="Optional" />);
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });
  it("has label class", () => {
    render(() => <Label text="X" />);
    expect(screen.getByText("X").parentElement!.className).toContain("label");
  });
});

describe("LabelText", () => {
  it("renders with label-text class", () => {
    render(() => <LabelText>Text</LabelText>);
    expect(screen.getByText("Text").className).toContain("label-text");
  });
});

describe("LabelTextAlt", () => {
  it("renders with label-text-alt class", () => {
    render(() => <LabelTextAlt>Alt</LabelTextAlt>);
    expect(screen.getByText("Alt").className).toContain("label-text-alt");
  });
});
