import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Modal } from "../Modal";

describe("Modal", () => {
  it("renders children", () => {
    render(() => <Modal><div>Hello Modal</div></Modal>);
    expect(screen.getByText("Hello Modal")).toBeInTheDocument();
  });

  it("renders with modal-open class", () => {
    render(() => <Modal>Content</Modal>);
    const modalBox = screen.getByText("Content");
    expect(modalBox.parentElement?.className).toContain("modal-open");
  });

  it("applies boxClass to the modal-box", () => {
    render(() => <Modal boxClass="max-w-2xl">Content</Modal>);
    const modalBox = screen.getByText("Content");
    expect(modalBox.className).toContain("max-w-2xl");
  });

  it("renders pixel-border on modal-box", () => {
    render(() => <Modal>Content</Modal>);
    const modalBox = screen.getByText("Content");
    expect(modalBox.className).toContain("pixel-border");
  });
});
