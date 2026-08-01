/**
 * Orthogonal edge routing with obstacle avoidance.
 *
 * A* over a coarse grid in which every node box is impassable. This is the
 * behaviour draw.io, yEd and Graphviz give you; the alternative — turning at
 * the midpoint between two anchors — puts a line straight through whatever
 * happens to sit between them, which on a dense page is most of the diagram.
 *
 * The layout is deterministic and lane-based, and that is worth keeping, so
 * only routing is solved here rather than handing layout to a graph library.
 *
 * Three costs shape the result, and each exists for a visible defect:
 *
 *   TURN      a path with fewer corners is easier to follow, so a turn is
 *             charged far more than a step. Without it A* returns staircases.
 *   CLEARANCE cells adjacent to a box cost more, so a line prefers the middle
 *             of a corridor to grazing an edge it is not connected to.
 *   REUSE     cells already used by an earlier edge cost more, so a bundle of
 *             parallel edges spreads into separate lanes instead of stacking
 *             into one thick smear.
 */
import type { Point, Side } from "./routing.ts";

/**
 * Grid resolution and box clearance, and these two numbers are coupled.
 *
 * Nodes in a zone sit NODE_GAP (22px) apart. At MARGIN 8 that leaves 6px of
 * free space between two neighbours, which at CELL 10 rounds away to nothing —
 * so there was no legal corridor between adjacent boxes at all, A* failed, and
 * every one of those edges fell through to a fallback that ignores obstacles.
 * That is what put lines across node boxes.
 *
 * At CELL 6 / MARGIN 5 the same gap leaves 12px — two usable cells.
 */
export const CELL = 6;
const MARGIN = 7;

const STEP = 10;
const TURN = 140;
const CLEARANCE = 26;
const REUSE = 34;
/**
 * Crossing a heading or a zone border. The value is a balance, and both ends
 * of it were wrong before this one.
 *
 * Too low and a line tracks a dashed border for its whole length, which is
 * indistinguishable from the border. Too high — 260 was — and one perpendicular
 * crossing (about three cells) costs more than detouring a hundred cells around
 * the zone, so routes traced rectangles around whole zones and those detours
 * read as extra frames on the page.
 *
 * At 70 a crossing costs ~210 and a detour costs thousands, so edges cross
 * where they should; travelling *along* a band still accumulates far faster
 * than any alternative, which is the case worth preventing.
 */
const SOFT = 70;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Dir = 0 | 1 | 2 | 3; // right, down, left, up
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function dirOf(side: Side): Dir {
  switch (side) {
    case "right":
      return 0;
    case "bottom":
      return 1;
    case "left":
      return 2;
    case "top":
      return 3;
  }
}

export class RouteGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  /** Distance-to-obstacle band, used for the clearance cost. */
  private readonly near: Uint8Array;
  /** How many routed edges have already used each cell. */
  private readonly used: Uint16Array;
  /** Passable, but costly — currently the zone headings. */
  private readonly soft: Uint8Array;
  private readonly gScore: Float64Array;
  private readonly cameFrom: Int32Array;

  private readonly originX: number;
  private readonly originY: number;

  // Explicit fields rather than constructor parameter properties: this project
  // runs TypeScript directly under Node, whose strip-only mode rejects them —
  // and keeping the router runnable outside a browser is what lets it be
  // unit-tested against a known obstacle instead of judged from a screenshot.
  constructor(
    originX: number,
    originY: number,
    width: number,
    height: number,
    obstacles: Box[],
    soft: Box[] = [],
  ) {
    this.originX = originX;
    this.originY = originY;
    this.cols = Math.ceil(width / CELL) + 2;
    this.rows = Math.ceil(height / CELL) + 2;
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.near = new Uint8Array(this.cols * this.rows);
    this.used = new Uint16Array(this.cols * this.rows);
    this.soft = new Uint8Array(this.cols * this.rows);
    this.gScore = new Float64Array(this.cols * this.rows * 4);
    this.cameFrom = new Int32Array(this.cols * this.rows * 4);

    for (const box of obstacles) this.block(box, MARGIN, this.blocked);
    // A wider pass marks the approach band; it costs extra but is passable, so
    // a route squeezes through a tight gap when that is the only way.
    for (const box of obstacles) this.block(box, MARGIN + CELL * 3, this.near);
    for (const box of soft) this.block(box, 2, this.soft);
  }

  private block(box: Box, pad: number, into: Uint8Array) {
    const x0 = this.col(box.x - pad);
    const x1 = this.col(box.x + box.w + pad);
    const y0 = this.row(box.y - pad);
    const y1 = this.row(box.y + box.h + pad);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        into[y * this.cols + x] = 1;
      }
    }
  }

  private col(x: number): number {
    return Math.round((x - this.originX) / CELL) + 1;
  }
  private row(y: number): number {
    return Math.round((y - this.originY) / CELL) + 1;
  }
  private px(col: number): number {
    return (col - 1) * CELL + this.originX;
  }
  private py(row: number): number {
    return (row - 1) * CELL + this.originY;
  }

  /** Clear a box so an edge's own endpoints are always reachable. */
  private unblockAround(c: number, r: number) {
    for (let y = r - 1; y <= r + 1; y++) {
      for (let x = c - 1; x <= c + 1; x++) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        this.blocked[y * this.cols + x] = 0;
      }
    }
  }

  /**
   * Route between two anchors, leaving and arriving perpendicular to the sides
   * they sit on. Returns absolute points, or null when no path exists — the
   * caller falls back rather than drawing something misleading.
   */
  route(from: Point, fromSide: Side, to: Point, toSide: Side): Point[] | null {
    const sc = this.col(from.x);
    const sr = this.row(from.y);
    const tc = this.col(to.x);
    const tr = this.row(to.y);

    // The anchors sit inside the margin of their own boxes by construction.
    const savedBlocked = this.blocked.slice();
    this.unblockAround(sc, sr);
    this.unblockAround(tc, tr);

    const startDir = dirOf(fromSide);
    // Arriving on `toSide` means travelling *into* the box, i.e. opposite.
    const endDir = (dirOf(toSide) + 2) % 4;

    // Allocated once and refilled per route: at this resolution a page's grid
    // is hundreds of thousands of states, and re-allocating that per edge is
    // the difference between a fast emit and a slow one.
    const gScore = this.gScore;
    const cameFrom = this.cameFrom;
    gScore.fill(Number.POSITIVE_INFINITY);
    cameFrom.fill(-1);

    const h = (c: number, r: number) => (Math.abs(c - tc) + Math.abs(r - tr)) * STEP;
    const idx = (c: number, r: number, d: Dir) => (r * this.cols + c) * 4 + d;

    const start = idx(sc, sr, startDir);
    gScore[start] = 0;

    // Binary heap keyed on f.
    const heap: Array<{ f: number; s: number }> = [{ f: h(sc, sr), s: start }];
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0 && last) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    };
    const push = (item: { f: number; s: number }) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        [heap[i], heap[p]] = [heap[p], heap[i]];
        i = p;
      }
    };

    let goal = -1;
    while (heap.length > 0) {
      const cur = pop();
      if (!cur) break;
      const s = cur.s;
      const d = (s % 4) as Dir;
      const cell = (s - d) / 4;
      const c = cell % this.cols;
      const r = (cell - c) / this.cols;

      if (c === tc && r === tr && d === endDir) {
        goal = s;
        break;
      }
      if (cur.f > gScore[s] + h(c, r)) continue;

      for (let nd = 0 as Dir; nd < 4; nd++) {
        // No reversing; it can only produce a spur.
        if ((nd + 2) % 4 === d) continue;
        const nc = c + DX[nd];
        const nr = r + DY[nd];
        if (nc < 1 || nr < 1 || nc >= this.cols - 1 || nr >= this.rows - 1) continue;
        const ncell = nr * this.cols + nc;
        if (this.blocked[ncell]) continue;

        let cost = STEP;
        if (nd !== d) cost += TURN;
        if (this.near[ncell]) cost += CLEARANCE;
        if (this.soft[ncell]) cost += SOFT;
        cost += this.used[ncell] * REUSE;

        const ns = idx(nc, nr, nd);
        const tentative = gScore[s] + cost;
        if (tentative < gScore[ns]) {
          gScore[ns] = tentative;
          cameFrom[ns] = s;
          push({ f: tentative + h(nc, nr), s: ns });
        }
      }
    }

    this.blocked.set(savedBlocked);
    if (goal < 0) return null;

    // Walk back, recording one point per turn.
    const cells: Array<[number, number]> = [];
    for (let s = goal; s !== -1; s = cameFrom[s]) {
      const d = s % 4;
      const cell = (s - d) / 4;
      const c = cell % this.cols;
      const r = (cell - c) / this.cols;
      cells.push([c, r]);
      this.used[r * this.cols + c] += 1;
    }
    cells.reverse();

    const points: Point[] = [{ x: from.x, y: from.y }];
    for (let i = 1; i < cells.length - 1; i++) {
      const [pc, pr] = cells[i - 1];
      const [cc, cr] = cells[i];
      const [nc2, nr2] = cells[i + 1];
      const turned = (cc - pc) * (nr2 - cr) !== (cr - pr) * (nc2 - cc);
      if (turned) points.push({ x: this.px(cc), y: this.py(cr) });
    }
    points.push({ x: to.x, y: to.y });

    return squareUp(points);
  }
}

/**
 * Force every segment to be axis-aligned and drop redundant vertices.
 *
 * A* moves on the grid, but the endpoints are exact anchor coordinates that do
 * not land on it. Snapping the joining segments keeps the path visually
 * orthogonal rather than ending in a short diagonal stub.
 */
function squareUp(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(p);
      continue;
    }
    if (Math.abs(p.x - last.x) < 1 && Math.abs(p.y - last.y) < 1) continue;
    if (Math.abs(p.x - last.x) >= 1 && Math.abs(p.y - last.y) >= 1) {
      // Introduce the corner the grid implied.
      out.push({ x: last.x, y: p.y });
    }
    out.push(p);
  }

  // Collapse any run of collinear points.
  const simple: Point[] = [];
  for (const p of out) {
    if (simple.length >= 2) {
      const a = simple[simple.length - 2];
      const b = simple[simple.length - 1];
      if ((b.x - a.x) * (p.y - b.y) === (b.y - a.y) * (p.x - b.x)) {
        simple[simple.length - 1] = p;
        continue;
      }
    }
    simple.push(p);
  }
  return simple;
}
