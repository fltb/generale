import { TileType } from "@generale/types";
import type { FaIconKey } from "~/utils/faIconGraphic";

/**
 * 地图渲染主题：把原先散落在 MapRender / MapTile / Game 里的尺寸、颜色、
 * 瓦片→图标映射等渲染常量统一收口到一处。
 *
 * 像素风改造时，重写这个文件（颜色 / 尺寸 / 贴图集）即可，渲染组件无需改动。
 */
export interface TileTheme {
  /** 单个瓦片的像素边长 */
  tileSize: number;
  colors: {
    /** 迷雾瓦片底色 */
    fog: number;
    /** 无主瓦片底色 */
    unowned: number;
    /** 瓦片网格描边色 + 透明度 */
    gridStroke: number;
    gridStrokeAlpha: number;
    /** 瓦片地形图标颜色 */
    tileIcon: number;
    /** 选中光标颜色 */
    cursor: number;
    /** 操作箭头颜色 */
    arrow: number;
    /** pixi Application 画布背景色（css 字符串） */
    appBackground: string;
  };
  /** 瓦片类型 → FontAwesome 图标 key（Plain / Fog 无图标） */
  tileIcon: Record<TileType, FaIconKey | null>;
}

export const DEFAULT_TILE_THEME: TileTheme = {
  tileSize: 36,
  colors: {
    fog: 0x444444,
    unowned: 0xffffff,
    gridStroke: 0x000000,
    gridStrokeAlpha: 0.15,
    tileIcon: 0x222222,
    cursor: 0xffd34d,
    arrow: 0x222222,
    appBackground: "#1099bb",
  },
  tileIcon: {
    [TileType.Plain]: null,
    [TileType.Fog]: null,
    [TileType.Throne]: "faCrown",
    [TileType.Barracks]: "faHelmetSafety",
    [TileType.Mountain]: "faMountain",
    [TileType.Swamp]: "faWater",
  },
};

/** 移动方向 → 箭头图标 key */
export const DIRECTION_ICON: Record<"right" | "left" | "up" | "down", FaIconKey> = {
  right: "faArrowRight",
  left: "faArrowLeft",
  up: "faArrowUp",
  down: "faArrowDown",
};
