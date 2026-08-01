/**
 * Deterministic layout. Given a perspective, compute a box for every zone and
 * every node — no physics, no randomness, no measurement of rendered text.
 *
 * Determinism is the point: the same input produces byte-identical geometry, so
 * an exported SVG only changes when the model changes. A force-directed layout
 * would make every regeneration a diff.
 */
import type { Node, Perspective, Zone } from "./model.ts";

/**
 * One spacing scale, in multiples of 4, and the gaps encode grouping.
 *
 * Proximity is read as relatedness before any label is: nodes inside a zone sit
 * closer to each other than zones do to each other, and zones sit closer than
 * lanes. Picking each gap independently is what makes a diagram feel arbitrary
 * even when every individual value looks fine.
 *
 * These are also the corridors the router threads. NODE_GAP is the tightest
 * space an edge has to pass through, so it is set well above the point where a
 * route stops fitting rather than at it.
 */
export const NODE_W = 252;
export const NODE_H = 96;
export const NODE_GAP = 32;

export const ZONE_PAD = 32;
/** Room for a zone's title and note, plus clear air beneath them. */
export const ZONE_HEADER = 80;
export const ZONE_GAP = 96;

/**
 * Lanes are spaced for the arrows, not for the boxes. Most edges in this atlas
 * run between lanes, and a fanned bundle of them needs vertical room to
 * separate before it reaches the next row of boxes — at the old 68px they
 * arrived still bunched, which reads as one thick arrow rather than six.
 */
export const LANE_GAP = 168;

/** Horizontal gap between the last zone in a lane and that lane's callout. */
export const CALLOUT_GAP = 72;
export const CALLOUT_W = 312;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedNode extends Box {
  node: Node;
  zoneId: string;
}

export interface PlacedZone extends Box {
  zone: Zone;
}

export interface Layout {
  zones: PlacedZone[];
  nodes: PlacedNode[];
  /**
   * Centre lines of the empty corridors between lanes and between zones. The
   * layout is the only thing that knows where the whitespace is, so it is the
   * only thing that can tell the router where an arrow may safely turn.
   */
  gutters: { horizontal: number[]; vertical: number[] };
  /** One box per lane, so a callout can be placed beside its lane. */
  laneBounds: Box[];
  /**
   * The area each zone's title and note occupy. They are free-standing text, so
   * nothing else knows they are there — without publishing them, a route is
   * free to run straight through a heading.
   */
  titleBoxes: Box[];
  /**
   * Thin bands lying along each zone's dashed border.
   *
   * Charged as soft cost, not blocked. Crossing one perpendicular touches a
   * handful of cells and stays cheap — which edges must be able to do, since a
   * zone boundary is exactly what most of them cross. Running *along* one
   * touches hundreds and becomes prohibitive, which is the case that matters: a
   * line tracking a dashed border a few pixels away is unreadable as a separate
   * thing, and that is what makes a diagram look wired rather than drawn.
   */
  zoneBands: Box[];
  /** Bounds of everything placed, before the title block is added. */
  bounds: Box;
}

/** How many grid columns a node occupies. */
function span(node: Node): number {
  return node.wide ? 2 : 1;
}

/**
 * Pack nodes into `cols` columns, honouring `wide`. Returns one row per output
 * row, each holding [node, startColumn, span]. A wide node that will not fit in
 * the remaining columns starts a new row rather than overflowing the zone.
 */
function packRows(nodes: Node[], cols: number): Array<Array<[Node, number, number]>> {
  const rows: Array<Array<[Node, number, number]>> = [];
  let row: Array<[Node, number, number]> = [];
  let used = 0;

  for (const node of nodes) {
    const s = Math.min(span(node), cols);
    if (used + s > cols) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push([node, used, s]);
    used += s;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function zoneCols(zone: Zone): number {
  if (zone.cols) return zone.cols;
  // Default to a single row, but count wide nodes as two so the zone is wide
  // enough to actually hold them.
  return zone.nodes.reduce((total, node) => total + span(node), 0);
}

function gridWidth(cols: number): number {
  return cols * NODE_W + (cols - 1) * NODE_GAP;
}

export function layout(perspective: Perspective): Layout {
  const zones: PlacedZone[] = [];
  const nodes: PlacedNode[] = [];
  const laneBounds: Box[] = [];
  const titleBoxes: Box[] = [];
  const zoneBands: Box[] = [];

  let y = 0;

  for (const lane of perspective.lanes) {
    let x = 0;
    let laneHeight = 0;

    for (const zone of lane) {
      const cols = zoneCols(zone);
      const rows = packRows(zone.nodes, cols);

      const w = gridWidth(cols) + ZONE_PAD * 2;
      const h =
        ZONE_HEADER +
        rows.length * NODE_H +
        Math.max(0, rows.length - 1) * NODE_GAP +
        ZONE_PAD;

      zones.push({ zone, x, y, w, h });

      // Bands along the zone outline, asymmetric: shallow outside, deep enough
      // inside to cover the whole of ZONE_PAD.
      //
      // A symmetric 16px band left a 24px gutter between it and the first node
      // — ample room for a line to run parallel to the border just inside it,
      // which is the exact thing the band exists to prevent and looked like a
      // second frame around the zone. The inner reach now spans the padding, so
      // a route inside a zone travels between nodes rather than around them.
      const OUT = 12;
      const IN = ZONE_PAD;
      zoneBands.push(
        { x: x - OUT, y: y - OUT, w: w + OUT * 2, h: OUT + IN },
        { x: x - OUT, y: y + h - IN, w: w + OUT * 2, h: OUT + IN },
        { x: x - OUT, y: y - OUT, w: OUT + IN, h: h + OUT * 2 },
        { x: x + w - IN, y: y - OUT, w: OUT + IN, h: h + OUT * 2 },
      );

      // Width is estimated from the longer of title and note; over-estimating
      // costs a little routing freedom, under-estimating puts a line through a
      // word, so it rounds up.
      const chars = Math.max(zone.title.length, (zone.note ?? "").length * 0.7);
      titleBoxes.push({
        x: x + 14,
        y: y + 8,
        w: Math.min(w - 20, chars * 10 + 24),
        h: zone.note ? 58 : 36,
      });

      rows.forEach((row, rowIndex) => {
        const rowY = y + ZONE_HEADER + rowIndex * (NODE_H + NODE_GAP);
        for (const [node, startCol, nodeSpan] of row) {
          nodes.push({
            node,
            zoneId: zone.id,
            x: x + ZONE_PAD + startCol * (NODE_W + NODE_GAP),
            y: rowY,
            w: gridWidth(nodeSpan),
            h: NODE_H,
          });
        }
      });

      x += w + ZONE_GAP;
      laneHeight = Math.max(laneHeight, h);
    }

    // `x` has one trailing ZONE_GAP on it from the loop above.
    laneBounds.push({ x: 0, y, w: Math.max(0, x - ZONE_GAP), h: laneHeight });

    y += laneHeight + LANE_GAP;
  }

  const right = Math.max(...zones.map((z) => z.x + z.w), 0);
  const bottom = Math.max(...zones.map((z) => z.y + z.h), 0);

  // Between consecutive lanes, and between consecutive zones within a lane.
  const horizontal: number[] = [];
  for (let i = 0; i < laneBounds.length - 1; i++) {
    const a = laneBounds[i];
    const b = laneBounds[i + 1];
    horizontal.push((a.y + a.h + b.y) / 2);
  }

  const vertical: number[] = [];
  for (const lane of perspective.lanes) {
    const inLane = lane
      .map((z) => zones.find((pz) => pz.zone.id === z.id))
      .filter((z): z is PlacedZone => Boolean(z))
      .sort((p, q) => p.x - q.x);
    for (let i = 0; i < inLane.length - 1; i++) {
      vertical.push((inLane[i].x + inLane[i].w + inLane[i + 1].x) / 2);
    }
  }

  return {
    zones,
    nodes,
    laneBounds,
    titleBoxes,
    zoneBands,
    gutters: { horizontal, vertical: [...new Set(vertical)] },
    bounds: { x: 0, y: 0, w: right, h: bottom },
  };
}
