// frontend/src/lib/qfdraw/style.ts
// Shared drawing style model. TradingView-style defaults and palette; every
// renderer reads colour / width / dash from the drawing's own style so the
// selected-drawing toolbar can restyle existing drawings.
export type DrawingLineStyle = "solid" | "dashed" | "dotted";

export interface QfDrawingStyle {
  color?: string;
  lineWidth?: number;
  lineStyle?: DrawingLineStyle;
  text?: string;
  [key: string]: unknown;
}

/** TradingView-ish palette that stays readable on the app's light and dark
 *  themes. */
export const DRAWING_COLORS = [
  "#2962FF", // blue
  "#F23645", // red
  "#089981", // green
  "#FF9800", // orange
  "#9C27B0", // purple
  "#00BCD4", // cyan
  "#E91E63", // pink
  "#FFD600", // yellow
  "#787B86", // grey
  "#FFFFFF", // white
] as const;

export const DRAWING_WIDTHS = [1, 2, 3, 4] as const;

export const DRAWING_LINE_STYLES: DrawingLineStyle[] = ["solid", "dashed", "dotted"];

/** Types whose rendering is a single stroke (plus optional anchors/labels). */
export const LINE_FAMILY = new Set([
  "line",
  "horizontal-line",
  "vertical-line",
  "ray",
  "horizontal-ray",
  "vertical-ray",
  "extended-line",
  "cross-line",
  "arrow",
]);

const STORAGE_KEY = "cg-drawing-defaults:v1";
const DEFAULT_COLOR = "#2962FF";
const DEFAULT_WIDTH = 2;
const DEFAULT_LINE_STYLE: DrawingLineStyle = "solid";

/** Readable label for a registry key, used by the selected-drawing toolbar
 *  when a type has no explicit copy. */
export function humanizeDrawingType(type: string): string {
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export interface ResolvedDrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: DrawingLineStyle;
}

function isLineStyle(value: unknown): value is DrawingLineStyle {
  return value === "solid" || value === "dashed" || value === "dotted";
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^(#|rgb|hsl)/i.test(value.trim());
}

function readSavedStyle(): Partial<ResolvedDrawingStyle> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ResolvedDrawingStyle>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Factory default for a newly created drawing. A user can save their own
 *  default from the selected-drawing toolbar. */
export function defaultDrawingStyle(): ResolvedDrawingStyle {
  const saved = readSavedStyle();
  return {
    color: isColor(saved.color) ? saved.color : DEFAULT_COLOR,
    lineWidth:
      typeof saved.lineWidth === "number" && saved.lineWidth >= 1
        ? Math.min(4, Math.round(saved.lineWidth))
        : DEFAULT_WIDTH,
    lineStyle: isLineStyle(saved.lineStyle) ? saved.lineStyle : DEFAULT_LINE_STYLE,
  };
}

/** Persist the style used for future drawings. */
export function saveDefaultDrawingStyle(style: Partial<QfDrawingStyle>): void {
  const current = defaultDrawingStyle();
  const next: ResolvedDrawingStyle = {
    color: isColor(style.color) ? style.color : current.color,
    lineWidth:
      typeof style.lineWidth === "number" && style.lineWidth >= 1
        ? Math.min(4, Math.round(style.lineWidth))
        : current.lineWidth,
    lineStyle: isLineStyle(style.lineStyle) ? style.lineStyle : current.lineStyle,
  };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Best-effort preference; drawing must never fail because of storage.
  }
}

/** Readable foreground for text drawn on a coloured pill/swatch. */
export function contrastText(color: string): string {
  const value = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value);
  let hex = "";
  if (short) hex = short[1].split("").map((c) => c + c).join("");
  else if (long) hex = long[1];
  if (!hex) return "#FFFFFF";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#131722" : "#FFFFFF";
}

/** ECharts dash array for a drawing line style. */
export function dashForStyle(style?: { lineStyle?: DrawingLineStyle }): number[] | undefined {
  const lineStyle = style?.lineStyle;
  if (lineStyle === "dashed") return [6, 4];
  if (lineStyle === "dotted") return [2, 3];
  return undefined;
}

/** Fill gaps left by drawings saved by older tools and migrate the old
 *  QFChart built-in line default (#d1d4dc, 1px) to the current line default.
 *  Explicit user colours are preserved. */
export function normalizeDrawingStyle(
  type: string,
  style?: QfDrawingStyle,
): QfDrawingStyle {
  const fallback = defaultDrawingStyle();
  const source: QfDrawingStyle = style && typeof style === "object" ? { ...style } : {};
  const color = isColor(source.color) ? source.color : fallback.color;
  const lineWidth =
    typeof source.lineWidth === "number" && Number.isFinite(source.lineWidth) && source.lineWidth > 0
      ? source.lineWidth
      : fallback.lineWidth;
  const lineStyle = isLineStyle(source.lineStyle) ? source.lineStyle : DEFAULT_LINE_STYLE;

  const isLine = LINE_FAMILY.has(type);
  const legacyGrey = typeof color === "string" && color.toLowerCase() === "#d1d4dc";
  const legacyLine = isLine && legacyGrey;
  return {
    ...source,
    color: legacyLine ? fallback.color : color,
    lineWidth: legacyLine ? Math.max(2, fallback.lineWidth) : lineWidth,
    lineStyle,
  };
}
