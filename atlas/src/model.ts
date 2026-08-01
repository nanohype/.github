/**
 * The diagram model.
 *
 * A perspective is data, not drawing. Everything below describes *what relates
 * to what*; `build.ts` is the only place that knows about tldraw shapes, and
 * `layout.ts` is the only place that knows about coordinates. That split is
 * what makes a perspective reviewable — a wrong arrow is a wrong line in a data
 * file, not a wrong number in a canvas.
 */

/** The tldraw default palette. Anything outside this list fails schema validation. */
export type Color =
  | "black"
  | "grey"
  | "light-violet"
  | "violet"
  | "blue"
  | "light-blue"
  | "yellow"
  | "orange"
  | "green"
  | "light-green"
  | "light-red"
  | "red"
  | "white";

/**
 * Colour carries meaning across every perspective, so the same subsystem reads
 * the same way whichever page you are on. Deviating from this map is how a
 * legend stops being true.
 */
export const SEMANTIC = {
  aws: "orange", // AWS-side substrate — anything landing-zone provisions
  k8s: "blue", // Kubernetes primitives and cluster addons
  platform: "violet", // eks-agent-platform control plane — CRDs and reconcilers
  tenant: "light-blue", // tenant-owned workloads and their namespace
  security: "red", // identity, policy, encryption, admission
  telemetry: "green", // signals, collectors, dashboards
  gitops: "grey", // repos, ApplicationSets, git as source of truth
  model: "yellow", // the model plane — Bedrock and what reaches it
  note: "black", // annotation, not a component
} as const satisfies Record<string, Color>;

export interface Node {
  id: string;
  label: string;
  /** Second line — the concrete thing: a resource kind, a chart, an ARN shape. */
  sub?: string;
  color?: Color;
  /** Where this lives on disk, so a reader can go read the real thing. */
  src?: string;
  /** Renders as a wide node spanning two grid columns. */
  wide?: boolean;
  /**
   * Emphasis. A page where everything is emphasised has no emphasis, so this is
   * for the two or three boxes that carry the page's actual point.
   */
  accent?: boolean;
  /** Ordinal for sequenced pages — rendered as a prefix on the label. */
  step?: number;
}

export interface Zone {
  id: string;
  title: string;
  /** One line under the zone title — the boundary this zone represents. */
  note?: string;
  color?: Color;
  /** Grid columns for this zone's nodes. Defaults to the node count (one row). */
  cols?: number;
  nodes: Node[];
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
  color?: Color;
  /** Dashed reads as "references / derives from" rather than "flows into". */
  dashed?: boolean;
  /** Draw the arrow bowing by this many pixels — separates parallel edges. */
  bend?: number;
  /** Anchor overrides, 0..1 within the node box, when the default centres cross. */
  fromAnchor?: { x: number; y: number };
  toAnchor?: { x: number; y: number };
}

/**
 * A free-floating annotation beside a lane. This is where a page says the thing
 * a box-and-arrow diagram structurally cannot — the trade that was made, the
 * failure mode the shape prevents, the reason an edge points the way it does.
 */
export interface Callout {
  /** Index into `lanes` — the callout sits to the right of that lane. */
  lane: number;
  title: string;
  body: string;
  color?: Color;
}

export interface Perspective {
  id: string;
  name: string;
  /** The question this page answers. Shown in the switcher and as page text. */
  blurb: string;
  /** Rows of zones, laid out top to bottom; zones within a row run left to right. */
  lanes: Zone[][];
  edges: Edge[];
  callouts?: Callout[];
}

/**
 * Two visual registers for the same model.
 *
 * `clean` is the register a CNCF reviewer expects; `sketch` is tldraw's
 * hand-drawn default, which reads as a whiteboard someone actually thought at.
 * Both are one style-prop swap, so this is a toggle rather than a fork.
 */
export type Theme = "clean" | "sketch";

export interface ThemeTokens {
  font: "sans" | "draw";
  nodeDash: "solid" | "draw";
  zoneDash: "dashed" | "draw";
  edgeDash: "solid" | "draw";
}

export const THEMES: Record<Theme, ThemeTokens> = {
  clean: { font: "sans", nodeDash: "solid", zoneDash: "dashed", edgeDash: "solid" },
  sketch: { font: "draw", nodeDash: "draw", zoneDash: "draw", edgeDash: "draw" },
};
