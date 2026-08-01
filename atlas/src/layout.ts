/**
 * Deterministic layout. Given a perspective, compute a box for every zone and
 * every node — no physics, no randomness, no measurement of rendered text.
 *
 * Determinism is the point: the same input produces byte-identical geometry, so
 * an exported SVG only changes when the model changes. A force-directed layout
 * would make every regeneration a diff.
 */
import type { Node, Perspective, Zone } from "./model.ts";

export const NODE_W = 236;
export const NODE_H = 88;
export const NODE_GAP = 22;

export const ZONE_PAD = 26;
export const ZONE_HEADER = 62;
export const ZONE_GAP = 72;

/**
 * Lanes are spaced for the arrows, not for the boxes. Most edges in this atlas
 * run between lanes, and a fanned bundle of them needs vertical room to
 * separate before it reaches the next row of boxes — at the old 68px they
 * arrived still bunched, which reads as one thick arrow rather than six.
 */
export const LANE_GAP = 132;

/** Horizontal gap between the last zone in a lane and that lane's callout. */
export const CALLOUT_GAP = 56;
export const CALLOUT_W = 300;

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
    gutters: { horizontal, vertical: [...new Set(vertical)] },
    bounds: { x: 0, y: 0, w: right, h: bottom },
  };
}
