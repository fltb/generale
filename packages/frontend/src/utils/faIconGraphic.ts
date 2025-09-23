import { icon as faIcon, type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faArrowRight,
    faArrowLeft,
    faArrowUp,
    faArrowDown,
    faCrown,
    faHelmetSafety,
    faMountain,
    faWater,
} from "@fortawesome/free-solid-svg-icons";

import { Graphics, GraphicsContext } from "pixi.js";

export const FA_ICON_MAP = {
    faArrowRight,
    faArrowLeft,
    faArrowUp,
    faArrowDown,
    faCrown,
    faHelmetSafety,
    faMountain,
    faWater
} as const;

export type FaIconKey = keyof typeof FA_ICON_MAP;

// --- helpers ---
function colorHexToCss(hex: number) {
    return `#${hex.toString(16).padStart(6, "0")}`;
}

/** normalize SVG: set width/height and replace currentColor or missing fills */
function normalizeSvg(svgRaw: string, sizePx: number, colorHex: number) {
    const color = colorHexToCss(colorHex);
    const doc = new DOMParser().parseFromString(svgRaw, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return svgRaw;

    svgEl.setAttribute("width", String(Math.round(sizePx)));
    svgEl.setAttribute("height", String(Math.round(sizePx)));
    // replace currentColor or missing fills on common shape elements
    svgEl.querySelectorAll("path, rect, circle, ellipse, polygon, polyline").forEach((el) => {
        const f = el.getAttribute("fill");
        if (!f || f === "currentColor") el.setAttribute("fill", color);
    });
    svgEl.querySelectorAll("[style]").forEach((el) => {
        const s = el.getAttribute("style") || "";
        if (s.includes("currentColor")) el.setAttribute("style", s.replace(/currentColor/g, color));
    });
    return new XMLSerializer().serializeToString(svgEl);
}

const gcCache = new Map<string, GraphicsContext>(); // GraphicsContext cache

function makeGcKey(key: FaIconKey, px: number, colorHex: number) {
    return `gc:${key}:${px}:${colorHex.toString(16)}`;
}

/**
 * 返回 GraphicsContext 缓存，强制缩放到 px × px
 */


export function getGraphicsContextFromFa(
    key: FaIconKey,
    px: number = 32,
    colorHex: number = 0x000000
): GraphicsContext {
    const cacheKey = makeGcKey(key, px, colorHex);
    const hit = gcCache.get(cacheKey);
    if (hit) return hit;

    const iconDef: IconDefinition = FA_ICON_MAP[key];
    if (!iconDef) throw new Error(`Unknown FaIconKey: ${String(key)}`);

    const svgRaw: string = faIcon(iconDef).html[0];
    const svg = normalizeSvg(svgRaw, px, colorHex);

    const ctx = new GraphicsContext().svg(svg);

    // 计算缩放比例使其适配目标尺寸
    const maxSize = Math.max(ctx.bounds.width, ctx.bounds.height);
    if (maxSize > 0) {
        const scale = px / maxSize;
        ctx.scale(scale);
    }

    gcCache.set(cacheKey, ctx);
    return ctx;
}

export function createScaledFaIcon(
    key: FaIconKey,
    sizePx: number = 32,
    colorHex: number = 0x000000
): Graphics {
    const ctx = getGraphicsContextFromFa(key, colorHex);
    const graphics = new Graphics(ctx);

    // 计算缩放比例
    const bounds = graphics.getBounds();
    const maxSize = Math.max(bounds.width, bounds.height);
    if (maxSize > 0) {
        const scale = sizePx / maxSize;
        graphics.scale.set(scale);

        // 设置锚点到中心
        graphics.pivot.set(bounds.width / 2, bounds.height / 2);
    }

    return graphics;
}

/** destroy helpers */
export function destroyGcCache() {
    gcCache.clear();
}
