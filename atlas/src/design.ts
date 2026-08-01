/**
 * Design tokens.
 *
 * Excalidraw takes literal colours rather than a fixed palette, which is the
 * main reason it can carry a designed look that tldraw's thirteen named colours
 * could not. The palette below is drawn from Open Color — the same family
 * Excalidraw's own defaults come from — so hand-edits made in the app land on
 * neighbouring swatches instead of clashing.
 *
 * Each semantic role gets a stroke/fill pair at a fixed contrast relationship,
 * so a reader learns the mapping once on the legend page and it holds on all
 * ten.
 */
import type { Color } from "./model.ts";

export interface Swatch {
  /** Border and text colour. */
  stroke: string;
  /** Interior at rest. */
  fill: string;
  /** Interior when the node is the point of the page. */
  accent: string;
}

/**
 * Keyed by the tldraw-era colour names the perspective data already uses, so
 * the model files did not have to change when the renderer did.
 */
export const SWATCH: Record<Color, Swatch> = {
  orange: { stroke: "#e8590c", fill: "#ffe8cc", accent: "#ffa94d" },
  blue: { stroke: "#1971c2", fill: "#d0ebff", accent: "#74c0fc" },
  violet: { stroke: "#6741d9", fill: "#e5dbff", accent: "#b197fc" },
  "light-blue": { stroke: "#0c8599", fill: "#c5f6fa", accent: "#66d9e8" },
  red: { stroke: "#c92a2a", fill: "#ffe3e3", accent: "#ff8787" },
  green: { stroke: "#2f9e44", fill: "#d3f9d8", accent: "#69db7c" },
  grey: { stroke: "#495057", fill: "#e9ecef", accent: "#adb5bd" },
  yellow: { stroke: "#f08c00", fill: "#fff3bf", accent: "#ffd43b" },
  black: { stroke: "#1e1e1e", fill: "#f1f3f5", accent: "#868e96" },
  // Retained so the Color union stays total; unused by the current pages.
  "light-violet": { stroke: "#7048e8", fill: "#eee5ff", accent: "#b197fc" },
  "light-green": { stroke: "#37b24d", fill: "#ebfbee", accent: "#8ce99a" },
  "light-red": { stroke: "#e03131", fill: "#fff5f5", accent: "#ffa8a8" },
  white: { stroke: "#868e96", fill: "#ffffff", accent: "#dee2e6" },
};

export const INK = {
  title: "#1e1e1e",
  body: "#343a40",
  muted: "#868e96",
  hairline: "#ced4da",
} as const;

/**
 * Type scale. The whole reason a node is drawn as a container plus a separate
 * caption element rather than one two-line label: a label can only carry one
 * size and one colour, and a diagram with no type hierarchy reads as a wall.
 */
export const TYPE = {
  pageTitle: 36,
  pageBlurb: 16,
  zoneTitle: 18,
  zoneNote: 12,
  nodeLabel: 16,
  nodeSub: 12,
  edgeLabel: 12,
  calloutTitle: 15,
  calloutBody: 13,
} as const;

/**
 * Excalidraw measures text itself; these are the ratios it lands on for the
 * bundled fonts, used only to centre free-standing captions. Anything relying
 * on exact metrics uses a container label instead.
 */
export const CHAR_WIDTH_RATIO = 0.52;
export const LINE_HEIGHT = 1.25;

export function estimateTextWidth(text: string, fontSize: number): number {
  const longest = text.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
  return longest * fontSize * CHAR_WIDTH_RATIO;
}
