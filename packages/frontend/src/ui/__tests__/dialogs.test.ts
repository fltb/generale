import { describe, it, expect, vi } from "vitest";
import { confirmDialog, alertDialog } from "../dialogs";

describe("dialogs", () => {
  it("confirmDialog calls window.confirm", () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const result = confirmDialog("Are you sure?");
    expect(spy).toHaveBeenCalledWith("Are you sure?");
    expect(result).toBe(true);
    spy.mockRestore();
  });
  it("alertDialog calls window.alert", () => {
    const spy = vi.spyOn(window, "alert").mockImplementation(() => {});
    alertDialog("Hello");
    expect(spy).toHaveBeenCalledWith("Hello");
    spy.mockRestore();
  });
});
