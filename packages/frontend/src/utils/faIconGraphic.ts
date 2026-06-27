import { icon as faIcon, type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faArrowRight, faArrowLeft, faArrowUp, faArrowDown,
    faCrown, faHelmetSafety, faMountain, faWater,
} from "@fortawesome/free-solid-svg-icons";

import { Graphics, GraphicsContext } from "pixi.js";

export const FA_ICON_MAP = {
    faArrowRight, faArrowLeft, faArrowUp, faArrowDown,
    faCrown, faHelmetSafety, faMountain, faWater
} as const;

export type FaIconKey = keyof typeof FA_ICON_MAP;

function colorHexToCss(hex: number) {
    return `#${hex.toString(16).padStart(6, "0")}`;
}

function normalizeSvg(svgRaw: string, sizePx: number, colorHex: number) {
    const color = colorHexToCss(colorHex);
    const doc = new DOMParser().parseFromString(svgRaw, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return svgRaw;
    svgEl.setAttribute("width", String(Math.round(sizePx)));
    svgEl.setAttribute("height", String(Math.round(sizePx)));
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

function makeGcKey(key: FaIconKey, px: number, colorHex: number) {
    return `gc:${key}:${px}:${colorHex.toString(16)}`;
}

/** 图标工厂 — 每个 PixiJS Application 实例应持有独立的工厂，避免跨会话缓存污染 */
export function createIconFactory() {
    const gcCache = new Map<string, GraphicsContext>();

    function getGraphicsContext(key: FaIconKey, px: number, colorHex: number): GraphicsContext {
        const cacheKey = makeGcKey(key, px, colorHex);
        const hit = gcCache.get(cacheKey);
        if (hit) return hit;

        const iconDef: IconDefinition = FA_ICON_MAP[key];
        if (!iconDef) throw new Error(`Unknown FaIconKey: ${String(key)}`);

        const svgRaw: string = faIcon(iconDef).html[0];
        const svg = normalizeSvg(svgRaw, px, colorHex);
        const ctx = new GraphicsContext().svg(svg);
        const maxSize = Math.max(ctx.bounds.width, ctx.bounds.height);
        if (maxSize > 0) ctx.scale(px / maxSize);
        gcCache.set(cacheKey, ctx);
        return ctx;
    }

    function createScaledIcon(key: FaIconKey, sizePx: number, colorHex: number): Graphics {
        const ctx = getGraphicsContext(key, sizePx, colorHex);
        const graphics = new Graphics(ctx);
        const bounds = graphics.getBounds();
        const maxSize = Math.max(bounds.width, bounds.height);
        if (maxSize > 0) {
            graphics.scale.set(sizePx / maxSize);
            graphics.pivot.set(bounds.width / 2, bounds.height / 2);
        }
        return graphics;
    }

    function destroy() { gcCache.clear(); }

    return { createScaledIcon, destroy };
}

export type IconFactory = ReturnType<typeof createIconFactory>;
