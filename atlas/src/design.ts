/**
 * Design tokens, derived from nanohype.dev.
 *
 * The site's palette is the source — `docs/tokens.json` in `nanohype.dev`. Its
 * hues are used verbatim for strokes, so a diagram and the site read as one
 * system; fills are light tints of those same hues, because the site is a
 * dark-ground surface and a README is not.
 *
 *   ground         #0c1226   the site background — reused as ink here, and as
 *                            the page colour in the dark export
 *   accent.primary #3b82f6
 *   beam-cyan      #06b6d4
 *   signal-purple  #8b5cf6
 *   signal-amber   #f59e0b
 *   signal-green   #10b981
 *   muted-fg       #94a3b8
 *
 * Each semantic role gets a stroke/fill pair at a fixed contrast relationship,
 * so the mapping is learned once on the legend page and holds on all eleven.
 */
import type { Color } from "./model.ts";

export interface Swatch {
  /** Border and heading colour — a nanohype.dev brand hue, unmodified. */
  stroke: string;
  /** Interior at rest: the same hue as a light tint. */
  fill: string;
  /** Interior when the node is the point of the page. */
  accent: string;
}

/**
 * Keyed by the colour names the perspective data already uses, so the model
 * files did not have to change when the palette did.
 */
export const SWATCH: Record<Color, Swatch> = {
  // signal-amber — AWS substrate
  orange: { stroke: "#f59e0b", fill: "#fef3e2", accent: "#fbc26a" },
  // accent.primary — Kubernetes
  blue: { stroke: "#3b82f6", fill: "#e5eefe", accent: "#93bbfb" },
  // signal-purple — the agent platform
  violet: { stroke: "#8b5cf6", fill: "#eee9fe", accent: "#bfa6fa" },
  // beam-cyan — tenant workloads
  "light-blue": { stroke: "#06b6d4", fill: "#e0f7fb", accent: "#6ad9ea" },
  // red — identity, policy, encryption
  red: { stroke: "#ef4444", fill: "#fdeaea", accent: "#f79999" },
  // signal-green — telemetry
  green: { stroke: "#10b981", fill: "#e2f7f1", accent: "#6ed7bd" },
  // muted-foreground — git and declared state
  grey: { stroke: "#94a3b8", fill: "#eef1f5", accent: "#c2cbd7" },
  // Indigo for the model plane — deliberately not amber. Bedrock is AWS, the
  // two sit side by side on several pages, and they have to stay tellable
  // apart at a glance.
  yellow: { stroke: "#5457d6", fill: "#e8e9fa", accent: "#a3a5ec" },
  // ground — annotation
  black: { stroke: "#0c1226", fill: "#eef1f7", accent: "#8e96b3" },

  // Retained so the Color union stays total; unused by the current pages.
  "light-violet": { stroke: "#9a9bf0", fill: "#f0f0fd", accent: "#c5c6f6" },
  "light-green": { stroke: "#35e07a", fill: "#e6fbee", accent: "#8fefb6" },
  "light-red": { stroke: "#f87171", fill: "#fef0f0", accent: "#fbb4b4" },
  white: { stroke: "#94a3b8", fill: "#ffffff", accent: "#e2e8f0" },
};

export const INK = {
  /** The site's ground colour, used as ink on a light surface. */
  title: "#0c1226",
  body: "#334155",
  muted: "#94a3b8",
  hairline: "#cbd5e1",
} as const;

/** Page background per export theme. Dark is the site's own ground colour. */
export const PAGE_BG = {
  light: "#ffffff",
  dark: "#0c1226",
} as const;

/**
 * Type scale. A node is a container plus a separate caption rather than one
 * two-line label, because a label carries only one size and one colour — and
 * the size difference between a name and its qualifier is most of what makes a
 * dense page scannable.
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

export const LINE_HEIGHT = 1.25;
