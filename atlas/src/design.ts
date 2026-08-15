/**
 * Design tokens, derived from nanohype.dev.
 *
 * The site's palette is the source — `docs/tokens.json` in `nanohype.dev`. Its
 * hues are used verbatim for strokes, so a diagram and the site read as one
 * system; fills are light tints of those same hues, because the site is a
 * dark-ground surface and a README is not.
 *
 *   ground         #0c1226   the site background — reused as ink on light paper
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

export const SKIN = {
  paper: "#f4f2ee",
  paper2: "#eceae4",
  ink: "#0c1226",
  muted: "#4f5d75",
  soft: "#7a8399",
  rule: "rgba(12,18,38,0.12)",
  accent: "#3b82f6",
  accentTint: "rgba(59,130,246,0.08)",
  link: "#2563eb",
  sans: "'Geist', ui-sans-serif, system-ui, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
  mono: "'Geist Mono', ui-monospace, monospace",
} as const;

/**
 * Diagram-design type ramp. Every size is on the 4px grid.
 *
 * Names are Geist sans. Technical sublabels and arrow chips are Geist Mono.
 * The page title and callout titles are Instrument Serif.
 */
export const TYPE = {
  pageTitle: 28,
  pageBlurb: 12,
  zoneTitle: 8,
  zoneNote: 12,
  nodeLabel: 12,
  nodeSub: 8,
  edgeLabel: 8,
  calloutTitle: 16,
  calloutBody: 12,
} as const;
