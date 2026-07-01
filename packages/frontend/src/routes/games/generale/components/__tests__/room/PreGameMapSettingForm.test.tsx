import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { PreGameMapType } from "@generale/types";
import type { PreGameCustomMapSetting, PreGameMapSetting, PreGameRandomMapSetting } from "@generale/types";

vi.mock("~/components/map-editor/MapSelector", () => ({
  MapSelector: (p: any) => <div data-testid="map-selector">{p.placeholder}</div>,
}));

import { PreGameMapSettingForm } from "~/routes/games/generale/components/room/PreGameMapSettingForm";

function randomSetting(overrides?: Partial<PreGameRandomMapSetting>): PreGameMapSetting {
  return {
    type: PreGameMapType.Random,
    width: 32,
    height: 24,
    tileFrequency: {},
    ...overrides,
  } as PreGameMapSetting;
}

function customSetting(overrides?: Partial<PreGameCustomMapSetting>): PreGameMapSetting {
  return {
    type: PreGameMapType.Custom,
    width: 32,
    height: 24,
    tileFrequency: {},
    customData: "",
    ...overrides,
  } as PreGameMapSetting;
}

function importedSetting(mapId?: string): PreGameMapSetting {
  return { type: PreGameMapType.Imported, customMapId: mapId ?? "map1" } as PreGameMapSetting;
}

describe("PreGameMapSettingForm", () => {
  it("shows preset buttons for standard roomType", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting()} roomType="standard" onChange={vi.fn()} />);
    expect(screen.getByText("Preset Size")).toBeInTheDocument();
    expect(screen.getByText("Small (10×10)")).toBeInTheDocument();
    expect(screen.getByText("Medium (20×20)")).toBeInTheDocument();
    expect(screen.getByText("Large (40×40)")).toBeInTheDocument();
  });

  it("does not show preset buttons for non-standard roomType", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={vi.fn()} />);
    expect(screen.queryByText("Preset Size")).not.toBeInTheDocument();
  });

  it("shows random/custom toggle buttons", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={vi.fn()} />);
    expect(screen.getByText("Random")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("shows width and height inputs", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting({ width: 40, height: 30 })} onChange={vi.fn()} />);
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onChange with standard preset when Small clicked", () => {
    const onChange = vi.fn();
    render(() => <PreGameMapSettingForm setting={randomSetting()} roomType="standard" onChange={onChange} />);
    fireEvent.click(screen.getByText("Small (10×10)"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: PreGameMapType.Random, width: 10, height: 10, sizeLabel: "small" }),
    );
  });

  it("calls onChange with standard preset when Large clicked", () => {
    const onChange = vi.fn();
    render(() => <PreGameMapSettingForm setting={randomSetting()} roomType="standard" onChange={onChange} />);
    fireEvent.click(screen.getByText("Large (40×40)"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: PreGameMapType.Random, width: 40, height: 40, sizeLabel: "large" }),
    );
  });

  it("switches to custom mode when custom button clicked", () => {
    const onChange = vi.fn();
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={onChange} />);
    fireEvent.click(screen.getByText("Custom"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: PreGameMapType.Custom }),
    );
  });

  it("switches to random mode when random button clicked", () => {
    const onChange = vi.fn();
    render(() => <PreGameMapSettingForm setting={customSetting()} onChange={onChange} />);
    fireEvent.click(screen.getByText("Random"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: PreGameMapType.Random }),
    );
  });

  it("shows advanced settings toggle", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={vi.fn()} />);
    expect(screen.getByText("Advanced Generation Settings")).toBeInTheDocument();
  });

  it("shows tile frequency inputs when advanced opened", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Advanced Generation Settings"));
    expect(screen.getByText("Tile Frequency")).toBeInTheDocument();
  });

  it("shows custom data textarea in custom mode when advanced opened", () => {
    render(() => <PreGameMapSettingForm setting={customSetting()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Advanced Generation Settings"));
    expect(screen.getByText("Custom Data")).toBeInTheDocument();
  });

  it("does not show custom data textarea in random mode even when advanced opened", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Advanced Generation Settings"));
    expect(screen.queryByText("Custom Data")).not.toBeInTheDocument();
  });

  it("shows imported mode alert when setting is imported", () => {
    render(() => <PreGameMapSettingForm setting={importedSetting("map1")} onChange={vi.fn()} />);
    expect(screen.getByText("Custom map selected. Random generation parameters disabled.")).toBeInTheDocument();
  });

  it("shows MapSelector in imported mode", () => {
    render(() => <PreGameMapSettingForm setting={importedSetting("map1")} onChange={vi.fn()} />);
    expect(screen.getByTestId("map-selector")).toBeInTheDocument();
  });

  it("shows MapSelector even when not imported (for preset selection)", () => {
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={vi.fn()} />);
    // The non-imported mode also has a MapSelector for "自定义地图"
    const selectors = screen.getAllByTestId("map-selector");
    // One for the "自定义地图" section
    expect(selectors.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show random/custom toggle when imported", () => {
    render(() => <PreGameMapSettingForm setting={importedSetting("map1")} onChange={vi.fn()} />);
    expect(screen.queryByText("Random")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  });

  it("calls onChange with width clamped between 10 and 500", () => {
    const onChange = vi.fn();
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={onChange} />);
    const inputs = screen.getAllByRole("spinbutton");
    // First spinbutton should be width
    fireEvent.input(inputs[0], { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ width: 10 }),
    );
  });

  it("calls onChange with height clamped between 10 and 500", () => {
    const onChange = vi.fn();
    render(() => <PreGameMapSettingForm setting={randomSetting()} onChange={onChange} />);
    const inputs = screen.getAllByRole("spinbutton");
    // Second spinbutton should be height
    fireEvent.input(inputs[1], { target: { value: "600" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ height: 500 }),
    );
  });
});
