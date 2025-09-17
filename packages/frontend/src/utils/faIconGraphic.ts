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

import { GraphicsContext } from "pixi.js";

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
    try {
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
    } catch {
        // fallback regex-ish replacements
        let svg = svgRaw.replace(/^<svg\b([^>]*)>/, `<svg width="${Math.round(sizePx)}" height="${Math.round(sizePx)}" $1>`);
        svg = svg.replace(/currentColor/g, color);
        svg = svg.replace(/<path([^>]*?)\/?>/g, (m, attrs) => {
            if (/fill=/.test(attrs)) return `<path${attrs}/>`;
            return `<path${attrs} fill="${color}" />`;
        });
        return svg;
    }
}

const gcCache = new Map<string, GraphicsContext>(); // GraphicsContext cache

function makeGcKey(key: FaIconKey, px: number, colorHex: number) {
    return `gc:${key}:${px}:${colorHex.toString(16)}`;
}

/**
 * 返回 GraphicsContext 缓存
 */
export function getGraphicsContextFromFa(key: FaIconKey, px: number = 32, colorHex: number = 0x000000): GraphicsContext {
    const cacheKey = makeGcKey(key, px, colorHex);
    const hit = gcCache.get(cacheKey);
    if (hit) return hit;

    const iconDef: IconDefinition = (FA_ICON_MAP)[key];
    if (!iconDef) throw new Error(`Unknown FaIconKey: ${String(key)}`);

    const svgRaw: string = faIcon(iconDef).html[0];
    const svg = normalizeSvg(svgRaw, px, colorHex);

    const ctx = new GraphicsContext().svg(svg);
    gcCache.set(cacheKey, ctx);
    return ctx;
}


/** destroy helpers */
export function destroyGcCache() {
    gcCache.clear();
}
