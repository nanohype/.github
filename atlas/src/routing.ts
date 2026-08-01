/**
 * Edge routing.
 *
 * The naive binding — anchor both ends at the shape centre and let tldraw's
 * elbow router figure it out — produces the mess this module exists to replace.
 * Two things go wrong at once. Every edge leaving a node departs from the same
 * point, so ten arrows out of one box become one thick smear; and the elbow
 * router, given two centres, routes *around* whatever sits between them, which
 * on a packed grid is most of the diagram.
 *
 * So anchors are computed instead of defaulted:
 *
 *   1. Pick the pair of facing sides from the boxes' actual geometry, not from
 *      the order the edge was declared in.
 *   2. Aim both ends of an edge at one shared line, so a route between facing
 *      boxes is straight rather than stepped.
 *   3. Separate the anchors that still collide on a side, so parallel
 *      relationships stay legible as separate lines.
 *
 * Step 2 is what keeps short edges clean, and it is the step that is easy to
 * leave out. Choosing each end independently — fanning one side across its
 * edges while the other end takes its centre — asks the route to make a lateral
 * move that neither end agreed on, inside whatever gap happens to separate the
 * boxes. Between neighbours that gap is NODE_GAP, so a 90px offset gets folded
 * into 32px of corridor and the arrow comes out as a hook.
 *
 * The result is that an arrow leaves the side of the box nearest its target and
 * arrives on the side nearest its source, on the same line where the geometry
 * allows one, which is what makes a dense diagram readable.
 */
import type { Box, PlacedNode } from "./layout.ts";
import { RouteGrid } from "./router.ts";
import type { Edge } from "./model.ts";

export type Side = "top" | "right" | "bottom" | "left";

export interface Anchor {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RoutedEdge {
  edge: Edge;
  index: number;
  /** Normalized anchors, for the binding. */
  from: Anchor;
  to: Anchor;
  /** Absolute scene coordinates, for the arrow's own geometry. */
  fromPoint: Point;
  toPoint: Point;
  fromSide: Side;
  toSide: Side;
  /** The full orthogonal polyline, absolute scene coordinates. */
  path: Point[];
}

function isVertical(side: Side): boolean {
  return side === "top" || side === "bottom";
}

/**
 * Empty corridors in the layout: the gaps between lanes, and between the zones
 * within a lane. Routing a turn through one of these is what keeps an arrow
 * from being drawn across the middle of an unrelated box.
 */
export interface Gutters {
  /** Y coordinates of the horizontal corridors between lanes. */
  horizontal: number[];
  /** X coordinates of the vertical corridors between zones. */
  vertical: number[];
}

/**
 * The gutter closest to `preferred` that lies between the two endpoints.
 *
 * Falls back to `preferred` when no gutter separates them — two boxes inside
 * one zone have nothing between them to route through, and forcing a detour to
 * a distant corridor would look far stranger than a short direct turn.
 */
function nearestGutter(gutters: number[], preferred: number, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const between = gutters.filter((g) => g > lo + 4 && g < hi - 4);
  if (between.length === 0) return preferred;
  return between.reduce((best, g) =>
    Math.abs(g - preferred) < Math.abs(best - preferred) ? g : best,
  );
}

/**
 * An orthogonal route between two anchors, as a polyline.
 *
 * Setting `elbowed: true` on the element is not enough on its own: the flag
 * survives `convertToExcalidrawElements` but Excalidraw's router only runs
 * inside the editor's own update path, so a generated scene keeps whatever
 * points it was given — two, in a straight diagonal. Computing the path here
 * means the geometry is right in the scene *and* in the exported SVG, which
 * never goes near the editor at all.
 *
 * Three shapes cover every pair of facing sides:
 *
 *   both vertical    ┐ down, across at the midpoint, down again
 *   both horizontal  ┐ across, down at the midpoint, across again
 *   mixed            └ a single corner
 */
export function orthogonalPath(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  gutters: Gutters = { horizontal: [], vertical: [] },
): Point[] {
  const vFrom = isVertical(fromSide);
  const vTo = isVertical(toSide);

  let path: Point[];
  if (vFrom && vTo) {
    // Cross between the lanes, not at the arithmetic midpoint. The midpoint of
    // two boxes in different lanes usually lands inside a third box, so the
    // arrow is drawn straight through it; a lane gutter is empty by
    // construction, which is the whole reason the layout leaves one.
    const mid = nearestGutter(gutters.horizontal, (from.y + to.y) / 2, from.y, to.y);
    path = [from, { x: from.x, y: mid }, { x: to.x, y: mid }, to];
  } else if (!vFrom && !vTo) {
    const mid = nearestGutter(gutters.vertical, (from.x + to.x) / 2, from.x, to.x);
    path = [from, { x: mid, y: from.y }, { x: mid, y: to.y }, to];
  } else if (vFrom) {
    path = [from, { x: from.x, y: to.y }, to];
  } else {
    path = [from, { x: to.x, y: from.y }, to];
  }

  // Collapse points that coincide, so a route that is already straight does not
  // carry a redundant vertex — Excalidraw draws a visible kink at one.
  return path.filter((p, i) => {
    if (i === 0) return true;
    const prev = path[i - 1];
    return Math.abs(p.x - prev.x) > 0.5 || Math.abs(p.y - prev.y) > 0.5;
  });
}

/** Distance an arrow stops short of the box it points at. */
const GAP = 11;

function outward(side: Side): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

/**
 * Absolute scene position of a normalized anchor, pushed clear of the box.
 *
 * The gap is not cosmetic. An arrowhead that terminates exactly on the border
 * is drawn half inside the fill, which at these stroke weights reads as the
 * arrow passing through the box rather than arriving at it.
 */
function absolute(box: PlacedNode, anchor: Anchor, side: Side): Point {
  const n = outward(side);
  return {
    x: box.x + anchor.x * box.w + n.x * GAP,
    y: box.y + anchor.y * box.h + n.y * GAP,
  };
}

/** Do two 1-D intervals overlap by at least `slack` pixels? */
function overlaps(aMin: number, aMax: number, bMin: number, bMax: number, slack: number): boolean {
  return Math.min(aMax, bMax) - Math.max(aMin, bMin) >= slack;
}

/**
 * Which side of `from` faces `to`, and which side of `to` faces back.
 *
 * Column and row alignment win over raw distance: two boxes stacked in the same
 * column should connect bottom-to-top even when the horizontal offset between
 * their centres is technically larger, because that is how a reader expects a
 * vertical relationship to be drawn.
 */
export function facingSides(from: PlacedNode, to: PlacedNode): [Side, Side] {
  const sameColumn = overlaps(from.x, from.x + from.w, to.x, to.x + to.w, 40);
  const sameRow = overlaps(from.y, from.y + from.h, to.y, to.y + to.h, 30);

  if (sameColumn && !sameRow) {
    return to.y > from.y ? ["bottom", "top"] : ["top", "bottom"];
  }
  if (sameRow && !sameColumn) {
    return to.x > from.x ? ["right", "left"] : ["left", "right"];
  }

  // Neither aligned: fall back to the dominant delta between centres, with a
  // bias toward vertical, since the lanes stack vertically and most edges in
  // this atlas cross lanes rather than run along one.
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);

  if (Math.abs(dy) * 1.35 >= Math.abs(dx)) {
    return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
  }
  return dx > 0 ? ["right", "left"] : ["left", "right"];
}

/**
 * Anchors use the middle 70% of a side, never its whole width. An arrow landing
 * on a corner reads as belonging to the adjacent side, and the label centred on
 * it ends up over the box.
 */
const SPREAD = 0.7;

/**
 * Closest two anchors may sit on one side before their arrowheads merge.
 *
 * Only an upper bound: a crowded side falls back to spreading its edges evenly,
 * which is always narrower than this and always fits.
 */
const MIN_SEPARATION = 26;

/**
 * The usable stretch of one side, in absolute scene coordinates.
 *
 * Facing sides are always an opposite pair, so both ends of an edge vary along
 * the same axis — x for a top/bottom pair, y for a left/right one. That shared
 * axis is what makes a single agreed coordinate possible.
 */
function usableSpan(box: PlacedNode, side: Side): { lo: number; hi: number } {
  const start = isVertical(side) ? box.x : box.y;
  const length = isVertical(side) ? box.w : box.h;
  const inset = ((1 - SPREAD) / 2) * length;
  return { lo: start + inset, hi: start + length - inset };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The coordinate each end of an edge would attach at if it were the only edge.
 *
 * Where the two usable spans overlap there is a line both ends can sit on, and
 * the route between them is straight. The midpoint of the two centres is the
 * point on that line closest to what each end would have picked alone, so it is
 * the least surprising place to put it.
 *
 * Spans that do not overlap have no such line — a narrow box beside a wide one,
 * offset past its edge. Each end then aims at the other's centre and the route
 * takes the corner the geometry genuinely calls for, rather than a corner an
 * arbitrary choice created.
 */
function aim(from: PlacedNode, fromSide: Side, to: PlacedNode, toSide: Side): [number, number] {
  const a = usableSpan(from, fromSide);
  const b = usableSpan(to, toSide);
  const centreA = (a.lo + a.hi) / 2;
  const centreB = (b.lo + b.hi) / 2;

  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  if (lo <= hi) {
    const shared = clamp((centreA + centreB) / 2, lo, hi);
    return [shared, shared];
  }
  return [clamp(centreB, a.lo, a.hi), clamp(centreA, b.lo, b.hi)];
}

/**
 * Push apart anchors that want the same place on a side, keeping their order.
 *
 * Order is what stops siblings crossing, so the passes only ever move an anchor
 * along the side, never past its neighbour. `separation` is capped at what an
 * even spread would give, so the chain always fits between `lo` and `hi` and a
 * crowded side degrades to that even spread rather than overflowing the box.
 */
function separate(desired: number[], span: { lo: number; hi: number }): number[] {
  const count = desired.length;
  const out = desired.map((d) => clamp(d, span.lo, span.hi));
  if (count <= 1) return out;

  const separation = Math.min(MIN_SEPARATION, (span.hi - span.lo) / (count - 1));
  for (let i = 1; i < count; i++) out[i] = Math.max(out[i], out[i - 1] + separation);

  // The forward pass can run the last anchor off the end of the side; sliding
  // the whole chain back preserves every gap it just opened.
  const overflow = out[count - 1] - span.hi;
  if (overflow > 0) for (let i = 0; i < count; i++) out[i] -= overflow;
  for (let i = count - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - separation);

  return out.map((d) => clamp(d, span.lo, span.hi));
}

/** An absolute coordinate along a side, back as a normalized anchor. */
function anchorAt(side: Side, coord: number, box: PlacedNode): Anchor {
  const t = isVertical(side) ? (coord - box.x) / box.w : (coord - box.y) / box.h;
  switch (side) {
    case "top":
      return { x: t, y: 0 };
    case "bottom":
      return { x: t, y: 1 };
    case "left":
      return { x: 0, y: t };
    case "right":
      return { x: 1, y: t };
  }
}

/**
 * Sort key that keeps fanned arrows from crossing each other.
 *
 * Within one side, arrows are ordered by where their *other* end sits along the
 * perpendicular axis. Without this the fan positions get assigned in
 * declaration order, so an edge to a far-left target can be handed the
 * rightmost slot and cross every one of its siblings on the way out.
 */
function crossingOrderKey(side: Side, other: PlacedNode): number {
  return side === "top" || side === "bottom" ? other.x + other.w / 2 : other.y + other.h / 2;
}

export function routeEdges(
  edges: Edge[],
  nodes: PlacedNode[],
  gutters: Gutters = { horizontal: [], vertical: [] },
  obstacles: Box[] = [],
  bounds?: Box,
  soft: Box[] = [],
  zones: Box[] = [],
): RoutedEdge[] {
  const byId = new Map(nodes.map((n) => [n.node.id, n]));

  // First pass: decide the side each end uses.
  const sided = edges.map((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return null;
    const [fromSide, toSide] = facingSides(from, to);
    const [aimFrom, aimTo] = aim(from, fromSide, to, toSide);
    return { edge, index, from, to, fromSide, toSide, aimFrom, aimTo };
  });

  // Second pass: bucket by (node, side) so we know how many share each side.
  type Bucket = { key: string; entries: NonNullable<(typeof sided)[number]>[] };
  const buckets = new Map<string, Bucket>();

  const push = (key: string, entry: NonNullable<(typeof sided)[number]>) => {
    const bucket = buckets.get(key) ?? { key, entries: [] };
    bucket.entries.push(entry);
    buckets.set(key, bucket);
  };

  for (const entry of sided) {
    if (!entry) continue;
    push(`${entry.edge.from}|out|${entry.fromSide}`, entry);
    push(`${entry.edge.to}|in|${entry.toSide}`, entry);
  }

  const fromAnchors = new Map<number, Anchor>();
  const toAnchors = new Map<number, Anchor>();

  for (const bucket of buckets.values()) {
    const [, direction, side] = bucket.key.split("|") as [string, "out" | "in", Side];

    const ordered = [...bucket.entries].sort(
      (a, b) =>
        crossingOrderKey(side, direction === "out" ? a.to : a.from) -
        crossingOrderKey(side, direction === "out" ? b.to : b.from),
    );

    // Every entry in a bucket shares one node and one side, so one span covers
    // them all.
    const owner = direction === "out" ? ordered[0].from : ordered[0].to;
    const coords = separate(
      ordered.map((entry) => (direction === "out" ? entry.aimFrom : entry.aimTo)),
      usableSpan(owner, side),
    );

    ordered.forEach((entry, i) => {
      const anchor = anchorAt(side, coords[i], owner);
      if (direction === "out") fromAnchors.set(entry.index, anchor);
      else toAnchors.set(entry.index, anchor);
    });
  }

  // One grid per page, shared across its edges: the router records which cells
  // each finished route used, so later edges are nudged into their own lane
  // instead of stacking on top of the first one that got there.
  const grid = bounds
    ? new RouteGrid(
        bounds.x - 200,
        bounds.y - 220,
        bounds.w + 400,
        bounds.h + 440,
        obstacles,
        soft,
        zones,
      )
    : null;

  const fallbacks: string[] = [];
  const routed: RoutedEdge[] = [];
  for (const entry of sided) {
    if (!entry) continue;
    const from = entry.edge.fromAnchor ?? fromAnchors.get(entry.index) ?? { x: 0.5, y: 0.5 };
    const to = entry.edge.toAnchor ?? toAnchors.get(entry.index) ?? { x: 0.5, y: 0.5 };
    const fromPoint = absolute(entry.from, from, entry.fromSide);
    const toPoint = absolute(entry.to, to, entry.toSide);

    // A* around the boxes; the gutter heuristic is the fallback. That fallback
    // ignores obstacles entirely, so a silent fall-through is exactly how a
    // line ends up drawn across a node — worth reporting, not swallowing.
    const routeOne = () => {
      const found = grid?.route(fromPoint, entry.fromSide, toPoint, entry.toSide);
      if (found) return found;
      if (grid) {
        fallbacks.push(`${entry.edge.from} -> ${entry.edge.to}`);
      }
      return orthogonalPath(fromPoint, entry.fromSide, toPoint, entry.toSide, gutters);
    };
    routed.push({
      edge: entry.edge,
      index: entry.index,
      from,
      to,
      fromPoint,
      toPoint,
      fromSide: entry.fromSide,
      toSide: entry.toSide,
      // A* around the boxes when a grid is available; the gutter heuristic is
      // the fallback for when no path exists, which is better than dropping the
      // edge entirely.
      path: routeOne(),
    });
  }
  if (fallbacks.length > 0 && typeof console !== "undefined") {
    console.warn(`[atlas] ${fallbacks.length} edge(s) found no clear route: ${fallbacks.join(", ")}`);
  }
  return routed;
}
