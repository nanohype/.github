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
 *   2. Fan the anchors along each side when several edges share it, so parallel
 *      relationships stay legible as separate lines.
 *
 * The result is that an arrow leaves the side of the box nearest its target and
 * arrives on the side nearest its source, spread out, which is what makes a
 * dense diagram readable.
 */
import type { PlacedNode } from "./layout.ts";
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
const GAP = 7;

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
 * Position `i` of `count` along a side, as a normalized anchor.
 *
 * Anchors are spread across the middle 70% of the side rather than its whole
 * width. Arrows landing right on a corner read as belonging to the adjacent
 * side, and the label tldraw centres on the arrow ends up over the box.
 */
function anchorOn(side: Side, i: number, count: number): Anchor {
  const spread = 0.7;
  const t = count <= 1 ? 0.5 : 0.5 - spread / 2 + (spread * i) / (count - 1);

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
): RoutedEdge[] {
  const byId = new Map(nodes.map((n) => [n.node.id, n]));

  // First pass: decide the side each end uses.
  const sided = edges.map((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return null;
    const [fromSide, toSide] = facingSides(from, to);
    return { edge, index, from, to, fromSide, toSide };
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

    ordered.forEach((entry, i) => {
      const anchor = anchorOn(side, i, ordered.length);
      if (direction === "out") fromAnchors.set(entry.index, anchor);
      else toAnchors.set(entry.index, anchor);
    });
  }

  const routed: RoutedEdge[] = [];
  for (const entry of sided) {
    if (!entry) continue;
    const from = entry.edge.fromAnchor ?? fromAnchors.get(entry.index) ?? { x: 0.5, y: 0.5 };
    const to = entry.edge.toAnchor ?? toAnchors.get(entry.index) ?? { x: 0.5, y: 0.5 };
    const fromPoint = absolute(entry.from, from, entry.fromSide);
    const toPoint = absolute(entry.to, to, entry.toSide);
    routed.push({
      edge: entry.edge,
      index: entry.index,
      from,
      to,
      fromPoint,
      toPoint,
      fromSide: entry.fromSide,
      toSide: entry.toSide,
      path: orthogonalPath(fromPoint, entry.fromSide, toPoint, entry.toSide, gutters),
    });
  }
  return routed;
}
