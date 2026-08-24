/**
 * The composer.
 *
 * A perspective is data and a Scene is that data placed: every zone and node
 * given a box, every edge given a route, every label given an anchor. Nothing
 * downstream lays out or routes again. That matters because routing is not a
 * pure function of the nodes — it is a function of the obstacle set — and a
 * caller free to choose its own obstacles is a caller free to draw a different
 * diagram from the same model. One composer means one route per edge, and
 * every surface reads the same geometry rather than recomputing a variant.
 *
 * A Scene is data too: no functions, no cycles, coordinates at two decimal
 * places, `format` an integer. It survives `JSON.parse(JSON.stringify(scene))`
 * unchanged, so a build that never sees a `Perspective` can still draw one.
 */
import { SWATCH } from "./design.ts";
import {
  type Box,
  type Cell,
  type PlacedNode as LaidNode,
  type PlacedZone,
  SPACING,
  type Spacing,
  layout,
} from "./layout.ts";
import {
  type Callout,
  type Perspective,
  type Role,
  type Edge,
  roleOf,
} from "./model.ts";
import { type Point, routeEdges } from "./routing.ts";

export type { Cell, PlacedZone, Spacing };
export { SPACING };

/**
 * The Scene shape. It is on the Scene rather than implied by it so a reader can
 * refuse a payload whose fields it does not know, instead of drawing half of it.
 */
export const SCENE_FORMAT = 1;

export interface PlacedNode extends LaidNode {
  /** Resolved from `node.color`, never authored. */
  role: Role;
  /** The shortest token that names this node uniquely within its Scene. */
  chip: string;
}

export interface PlacedCallout {
  index: number;
  callout: Callout;
  box: Box;
  titleLines: string[];
  bodyLines: string[];
  /** Baseline of the body block, relative to the box's top. */
  bodyY: number;
}

export interface RoutedEdge {
  /** `from~to`. `check-model` rejects a perspective where that repeats. */
  id: string;
  edge: Edge;
  /** The full orthogonal polyline, absolute scene coordinates. */
  path: Point[];
  /** Where the label chip parks. `null` on an edge that carries no label. */
  labelAnchor: Point | null;
}

export interface Frame {
  width: number;
  height: number;
  /** Margin around the drawing, and the title block that sits inside the top one. */
  pad: number;
  header: number;
}

export interface Scene {
  format: number;
  perspective: { id: string; name: string; blurb: string };
  frame: Frame;
  /** One box per lane, so a callout's lead knows what it points back at. */
  lanes: Box[];
  zones: PlacedZone[];
  nodes: PlacedNode[];
  callouts: PlacedCallout[];
  edges: RoutedEdge[];
  fingerprint: string;
}

/** Two decimal places, so a Scene serialises and reloads as the same numbers. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundBox(b: Box): Box {
  return { x: round2(b.x), y: round2(b.y), w: round2(b.w), h: round2(b.h) };
}

export function snap(n: number): number {
  return Math.round(n / 4) * 4;
}

/**
 * A polyline on the 4px grid, with the duplicates snapping creates collapsed.
 *
 * The drawn line is this list, not the router's own: a packet walking the raw
 * route floats beside the wire it is supposed to be on.
 */
export function snappedPolyline(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const q = { x: snap(p.x), y: snap(p.y) };
    const prev = out[out.length - 1];
    if (!prev || prev.x !== q.x || prev.y !== q.y) out.push(q);
  }
  return out;
}

export function wrap(text: string, cols: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length > 0 && line.length + 1 + word.length > cols) {
      lines.push(line);
      line = word;
    } else {
      line = line.length > 0 ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The chip is a name, so it has to survive being read at 8px beside a box.
 *
 * Candidates run from one initial per id part upward, and each node takes the
 * shortest not already spoken for. A fixed prefix of the id collapses whole
 * families — the eight `org-*` nodes on the substrate page all reduce to `OR` —
 * so uniqueness is constructed here rather than asserted by a gate that can
 * only report the collision after the fact.
 */
function chipLadder(id: string): string[] {
  const parts = id.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return [id.toUpperCase()];
  const longest = Math.max(...parts.map((p) => p.length));
  const out: string[] = [];
  for (let k = 1; k <= longest; k++) {
    const candidate = parts.map((p) => p.slice(0, k)).join("");
    if (out[out.length - 1] !== candidate) out.push(candidate);
  }
  return out;
}

function assignChips(ids: string[]): string[] {
  const taken = new Set<string>();
  return ids.map((id) => {
    const ladder = chipLadder(id);
    for (const candidate of ladder) {
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
    // Two ids that differ only in their separators exhaust the ladder together.
    const stem = ladder[ladder.length - 1];
    for (let n = 2; ; n++) {
      const candidate = `${stem}${n}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  });
}

/** The box a label chip occupies, which is also the obstacle it must clear. */
export function chipBox(text: string, s: Spacing = SPACING): { w: number; h: number } {
  return { w: snap(text.length * s.EDGE_LABEL * 0.62 + 16), h: 12 };
}

/**
 * Place a label chip off its connector, never on it.
 *
 * Prefer the midpoint of the longest segment, offset perpendicular so the
 * mask clears the stroke by LABEL_GAP. Overlapping a node is a badge and is
 * allowed. Only other chips and elbow corners are avoided.
 */
const LABEL_GAP = 12;

export function labelAnchor(path: Point[], size: { w: number; h: number }, obstacles: Box[]): Point {
  let longest = 0;
  let segA = path[0];
  let segB = path[1] ?? path[0];
  for (let i = 1; i < path.length; i++) {
    const len = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (len > longest) {
      longest = len;
      segA = path[i - 1];
      segB = path[i];
    }
  }

  const mid = { x: (segA.x + segB.x) / 2, y: (segA.y + segB.y) / 2 };
  const horizontal = Math.abs(segB.x - segA.x) >= Math.abs(segB.y - segA.y);
  const normal = horizontal ? { x: 0, y: -1 } : { x: -1, y: 0 };
  // Short corridors are mostly arrowhead. Push the chip further off the
  // stroke so it still reads as "above the line" at README scale.
  const offset = size.h / 2 + (longest < 48 ? 28 : LABEL_GAP);
  const primary = { x: mid.x + normal.x * offset, y: mid.y + normal.y * offset };
  const flip = { x: mid.x - normal.x * offset, y: mid.y - normal.y * offset };

  const overlaps = (at: Point, boxes: Box[]) => {
    const x0 = at.x - size.w / 2;
    const x1 = at.x + size.w / 2;
    const y0 = at.y - size.h / 2;
    const y1 = at.y + size.h / 2;
    return boxes.some((o) => x1 > o.x && x0 < o.x + o.w && y1 > o.y && y0 < o.y + o.h);
  };

  if (!overlaps(primary, obstacles)) return primary;
  if (!overlaps(flip, obstacles)) return flip;
  return primary;
}

/**
 * Callout boxes, sized from the wrapped copy.
 *
 * These are obstacles, not decoration: a callout occupies a column beside its
 * lane, and an edge routed without knowing that is an edge drawn through a
 * paragraph.
 */
export function calloutGeometry(
  perspective: Perspective,
  laneBounds: Box[],
  s: Spacing = SPACING,
): PlacedCallout[] {
  return (perspective.callouts ?? []).flatMap((callout, index) => {
    const lane = laneBounds[callout.lane];
    if (!lane) return [];
    const x = lane.x + lane.w + s.CALLOUT_GAP;
    const titleLines = wrap(callout.title, 28);
    const bodyLines = wrap(callout.body, 36);
    const titleH = titleLines.length * 20;
    const bodyY = 8 + titleH + 12;
    const height = bodyY + bodyLines.length * 16 + 8;
    const box = roundBox({ x, y: lane.y, w: s.CALLOUT_W, h: height });
    return [{ index, callout, box, titleLines, bodyLines, bodyY }];
  });
}

/**
 * The only function that calls `layout()`, `calloutGeometry()`, `labelAnchor()`
 * or `routeEdges()`.
 */
export function compose(perspective: Perspective, s: Spacing = SPACING): Scene {
  const placed = layout(perspective, s);
  const callouts = calloutGeometry(perspective, placed.laneBounds, s);
  const calloutBoxes = callouts.map((c) => c.box);

  const obstacles: Box[] = [
    ...placed.nodes.map(({ x, y, w, h }) => ({ x, y, w, h })),
    ...calloutBoxes,
  ];

  const routed = routeEdges(
    perspective.edges,
    placed.nodes,
    placed.gutters,
    obstacles,
    placed.bounds,
    [...placed.titleBoxes, ...placed.zoneBands],
    placed.zones.map(({ x, y, w, h }) => ({ x, y, w, h })),
  );

  // Elbow corners are obstacles for every chip, so they are all collected
  // before any chip is placed. A route too short to survive snapping draws no
  // line and contributes no corner.
  const corners: Box[] = [];
  for (const { path } of routed) {
    if (snappedPolyline(path).length < 2) continue;
    for (const point of path.slice(1, -1)) {
      corners.push({ x: point.x - 12, y: point.y - 12, w: 24, h: 24 });
    }
  }

  const taken: Box[] = [];
  const edges: RoutedEdge[] = routed.map(({ edge, path }) => {
    const text = edge.label;
    let anchor: Point | null = null;
    if (text) {
      const size = chipBox(text, s);
      const at = labelAnchor(path, size, [...corners, ...taken]);
      taken.push({ x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h });
      anchor = { x: round2(at.x), y: round2(at.y) };
    }
    return {
      id: `${edge.from}~${edge.to}`,
      edge,
      path: path.map((p) => ({ x: round2(p.x), y: round2(p.y) })),
      labelAnchor: anchor,
    };
  });

  const chips = assignChips(placed.nodes.map((n) => n.node.id));
  const nodes: PlacedNode[] = placed.nodes.map((n, i) => ({
    ...n,
    ...roundBox(n),
    role: roleOf(n.node.color),
    chip: chips[i],
  }));
  const zones: PlacedZone[] = placed.zones.map((z) => ({ ...z, ...roundBox(z) }));

  const contentRight = Math.max(placed.bounds.w, ...calloutBoxes.map((b) => b.x + b.w), 840);
  const contentBottom = Math.max(placed.bounds.h, ...calloutBoxes.map((b) => b.y + b.h), 200);
  const frame: Frame = {
    width: snap(contentRight + s.PAD * 2),
    height: snap(contentBottom + s.PAD + s.HEADER + s.PAD),
    pad: s.PAD,
    header: s.HEADER,
  };

  const scene: Scene = {
    format: SCENE_FORMAT,
    perspective: { id: perspective.id, name: perspective.name, blurb: perspective.blurb },
    frame,
    lanes: placed.laneBounds.map(roundBox),
    zones,
    nodes,
    callouts,
    edges,
    fingerprint: "",
  };
  scene.fingerprint = fingerprintScene(scene);
  return scene;
}

/**
 * Model-derived fingerprint — geometry and copy, never measured text.
 *
 * Rows rather than a digest, because the gate this feeds has to say *what*
 * moved. It covers every string the drawing prints, which is the property that
 * makes it a gate rather than a sample: a `step` prefix, a callout paragraph
 * and a zone note all reach the SVG, so all three are here.
 */
export function fingerprintRows(scene: Scene): unknown[] {
  const rows: unknown[] = [
    { type: "title", text: scene.perspective.name },
    { type: "blurb", text: scene.perspective.blurb },
  ];
  for (const z of scene.zones) {
    rows.push({
      type: "zone",
      id: z.zone.id,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      stroke: SWATCH[z.zone.color ?? "grey"].stroke,
      text: z.zone.title,
      note: z.zone.note ?? "",
    });
  }
  for (const n of scene.nodes) {
    rows.push({
      type: "node",
      id: n.node.id,
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      stroke: SWATCH[n.node.color ?? "black"].stroke,
      text: n.node.label,
      sub: n.node.sub ?? "",
      accent: Boolean(n.node.accent),
      step: n.node.step ?? null,
    });
  }
  for (const e of scene.edges) {
    rows.push({
      type: "edge",
      from: e.edge.from,
      to: e.edge.to,
      text: e.edge.label ?? "",
      dashed: Boolean(e.edge.dashed),
      stroke: SWATCH[e.edge.color ?? "black"].stroke,
    });
  }
  for (const c of scene.callouts) {
    rows.push({
      type: "callout",
      lane: c.callout.lane,
      x: c.box.x,
      y: c.box.y,
      w: c.box.w,
      h: c.box.h,
      title: c.callout.title,
      body: c.callout.body,
    });
  }
  return rows;
}

/** The rows as one stable string, for a Scene to carry and a reader to compare. */
export function fingerprintScene(scene: Scene): string {
  return JSON.stringify(fingerprintRows(scene));
}
