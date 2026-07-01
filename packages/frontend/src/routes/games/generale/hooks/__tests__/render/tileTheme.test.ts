import { describe, it, expect } from "vitest";
import { DEFAULT_TILE_THEME, DIRECTION_ICON } from "../../render/tileTheme";

describe("DEFAULT_TILE_THEME", () => {
  it("has tileSize 36", () => {
    expect(DEFAULT_TILE_THEME.tileSize).toBe(36);
  });

  it("has all expected color keys", () => {
    const colors = DEFAULT_TILE_THEME.colors;
    expect(colors).toHaveProperty("fog");
    expect(colors).toHaveProperty("unowned");
    expect(colors).toHaveProperty("gridStroke");
    expect(colors).toHaveProperty("gridStrokeAlpha");
    expect(colors).toHaveProperty("tileIcon");
    expect(colors).toHaveProperty("cursor");
    expect(colors).toHaveProperty("arrow");
    expect(colors).toHaveProperty("appBackground");
  });

  it("has fog color 0x444444", () => {
    expect(DEFAULT_TILE_THEME.colors.fog).toBe(0x444444);
  });

  it("has unowned color 0xffffff", () => {
    expect(DEFAULT_TILE_THEME.colors.unowned).toBe(0xffffff);
  });

  it("has cursor color 0xffd34d", () => {
    expect(DEFAULT_TILE_THEME.colors.cursor).toBe(0xffd34d);
  });

  it("has appBackground #1099bb", () => {
    expect(DEFAULT_TILE_THEME.colors.appBackground).toBe("#1099bb");
  });

  it("has gridStrokeAlpha 0.15", () => {
    expect(DEFAULT_TILE_THEME.colors.gridStrokeAlpha).toBe(0.15);
  });

  it("has tileIcon mappings for all tile types", () => {
    const tileIcon = DEFAULT_TILE_THEME.tileIcon;
    expect(tileIcon).toHaveProperty("PLAIN");
    expect(tileIcon).toHaveProperty("FOG");
    expect(tileIcon).toHaveProperty("THRONE");
    expect(tileIcon).toHaveProperty("BARRACKS");
    expect(tileIcon).toHaveProperty("MOUNTAIN");
    expect(tileIcon).toHaveProperty("SWAMP");
  });

  it("maps Throne to faCrown", () => {
    expect(DEFAULT_TILE_THEME.tileIcon.THRONE).toBe("faCrown");
  });

  it("maps Barracks to faHelmetSafety", () => {
    expect(DEFAULT_TILE_THEME.tileIcon.BARRACKS).toBe("faHelmetSafety");
  });

  it("maps Mountain to faMountain", () => {
    expect(DEFAULT_TILE_THEME.tileIcon.MOUNTAIN).toBe("faMountain");
  });

  it("maps Swamp to faWater", () => {
    expect(DEFAULT_TILE_THEME.tileIcon.SWAMP).toBe("faWater");
  });

  it("maps Plain and Fog to null", () => {
    expect(DEFAULT_TILE_THEME.tileIcon.PLAIN).toBeNull();
    expect(DEFAULT_TILE_THEME.tileIcon.FOG).toBeNull();
  });
});

describe("DIRECTION_ICON", () => {
  it("has all four directions", () => {
    expect(DIRECTION_ICON).toHaveProperty("right");
    expect(DIRECTION_ICON).toHaveProperty("left");
    expect(DIRECTION_ICON).toHaveProperty("up");
    expect(DIRECTION_ICON).toHaveProperty("down");
  });

  it("maps right to faArrowRight", () => {
    expect(DIRECTION_ICON.right).toBe("faArrowRight");
  });

  it("maps left to faArrowLeft", () => {
    expect(DIRECTION_ICON.left).toBe("faArrowLeft");
  });

  it("maps up to faArrowUp", () => {
    expect(DIRECTION_ICON.up).toBe("faArrowUp");
  });

  it("maps down to faArrowDown", () => {
    expect(DIRECTION_ICON.down).toBe("faArrowDown");
  });
});
