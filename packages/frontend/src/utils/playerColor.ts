import { PlayerColor } from "@generale/types";

/**
 * 玩家颜色归一化工具。
 *
 * 历史背景：服务端曾有 bug 把 PlayerColor 的 enum 字符串名（如 "DarkSlateGray"）
 * 当作 tileColor 落库，因此前端拿到的颜色可能是 number 也可能是 string。
 * 这里统一兼容：string 反查回对应数字，再按需转成 css。
 *
 * 之前这套逻辑在 MapTile / game/PlayerList / room/PlayerList 三处各复制了一份，
 * 现收口到此模块。
 */

/** 兜底颜色（数字形式），用于地图瓦片填充 */
export const DEFAULT_TILE_COLOR_NUMBER = 0xffffff;
/** 兜底颜色（css 形式），用于玩家列表色块 */
export const DEFAULT_PLAYER_COLOR_CSS = "#cccccc";

/** 把可能为 number / 历史字符串 enum 名 / undefined 的颜色归一化为数字 */
export function tileColorNumber(c: number | string | undefined, fallback = DEFAULT_TILE_COLOR_NUMBER): number {
  if (typeof c === "number") return c;
  if (typeof c === "string") {
    const num = (PlayerColor as unknown as Record<string, number>)[c];
    if (typeof num === "number") return num;
  }
  return fallback;
}

/** 把颜色归一化为 css `#rrggbb` 字符串（玩家列表色块用） */
export function playerColorCss(c: number | string | undefined, fallback = DEFAULT_PLAYER_COLOR_CSS): string {
  if (c == null) return fallback;
  if (typeof c === "number") return `#${c.toString(16).padStart(6, "0")}`;
  const num = (PlayerColor as unknown as Record<string, number>)[c];
  if (typeof num === "number") return `#${num.toString(16).padStart(6, "0")}`;
  return fallback;
}
