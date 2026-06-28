import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import Select from "../Select";

describe("Select", () => {
  it("renders select element", () => {
    render(() => <Select><option>a</option></Select>);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("applies size class", () => {
    render(() => <Select size="sm"><option>a</option></Select>);
    expect(screen.getByRole("combobox").className).toContain("select-sm");
  });
  it("applies bordered class", () => {
    render(() => <Select bordered><option>a</option></Select>);
    expect(screen.getByRole("combobox").className).toContain("select-bordered");
  });
  it("forwards onChange", () => {
    const handle = vi.fn();
    render(() => <Select onChange={handle}><option value="a">A</option></Select>);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "a" } });
    expect(handle).toHaveBeenCalled();
  });
  it("renders children options", () => {
    render(() => <Select><option value="1">One</option><option value="2">Two</option></Select>);
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });
});
