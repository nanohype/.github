/**
 * Editorial SVG renderer.
 *
 * The perspective model, the layout, and the router stay as they are. This
 * module is the only place that knows about SVG: hairline boxes, rounded
 * orthogonal connectors, Geist / Instrument Serif, one brand accent for the
 * two or three boxes that carry the page.
 *
 * Visual grammar follows cathrynlavery/diagram-design. Layer hues stay, because
 * they are the atlas legend, not a second accent system.
 */
import { SKIN, SWATCH, TYPE } from "./design.ts";
import { CALLOUT_GAP, CALLOUT_W, type Box, type Layout, layout } from "./layout.ts";
import type { Perspective } from "./model.ts";
import { type Point, routeEdges } from "./routing.ts";

const PAD = 40;
const HEADER = 112;
const RADIUS = 6;
const ELBOW = 8;
const LABEL_GAP = 12;

export interface RenderOptions {
  /** `@font-face` rules to embed. Omit in the live viewer (page stylesheet). */
  fontCss?: string;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function snap(n: number): number {
  return Math.round(n / 4) * 4;
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

function tspans(lines: string[], x: number, startY: number, dy: number, extra = ""): string {
  return lines
    .map((line, i) => {
      const y = startY + i * dy;
      return `<tspan x="${x}" y="${y}"${extra}>${esc(line)}</tspan>`;
    })
    .join("");
}

function hexId(color: string): string {
  return color.replace("#", "");
}

/** Rounded right-angle path from an orthogonal polyline. */
export function roundedPath(points: Point[], r = ELBOW): string {
  const raw = points.map((p) => ({ x: snap(p.x), y: snap(p.y) }));
  const pts: Point[] = [];
  for (const p of raw) {
    const prev = pts[pts.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) pts.push(p);
  }
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const incoming = { x: curr.x - prev.x, y: curr.y - prev.y };
    const outgoing = { x: next.x - curr.x, y: next.y - curr.y };
    const inLen = Math.hypot(incoming.x, incoming.y);
    const outLen = Math.hypot(outgoing.x, outgoing.y);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    if (rr < 1) {
      d += ` L${curr.x},${curr.y}`;
      continue;
    }
    const p1 = { x: curr.x - (incoming.x / inLen) * rr, y: curr.y - (incoming.y / inLen) * rr };
    const p2 = { x: curr.x + (outgoing.x / outLen) * rr, y: curr.y + (outgoing.y / outLen) * rr };
    d += ` L${p1.x},${p1.y} Q${curr.x},${curr.y} ${p2.x},${p2.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}

/**
 * Place a label chip off its connector, never on it.
 *
 * Prefer the midpoint of the longest segment, offset perpendicular so the
 * mask clears the stroke by LABEL_GAP. Overlapping a node is a badge and is
 * allowed. Only other chips and elbow corners are avoided.
 */
function labelAnchor(path: Point[], size: { w: number; h: number }, obstacles: Box[]): Point {
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

function calloutGeometry(perspective: Perspective, placed: Layout) {
  return (perspective.callouts ?? []).flatMap((callout, i) => {
    const lane = placed.laneBounds[callout.lane];
    if (!lane) return [];
    const x = lane.x + lane.w + CALLOUT_GAP;
    const titleLines = wrap(callout.title, 28);
    const bodyLines = wrap(callout.body, 36);
    const titleH = titleLines.length * 20;
    const bodyY = 8 + titleH + 12;
    const height = bodyY + bodyLines.length * 16 + 8;
    const box = { x, y: lane.y, w: CALLOUT_W, h: height };
    return [{ i, callout, box, titleLines, bodyLines, bodyY }];
  });
}

export function renderEditorialSvg(perspective: Perspective, opts: RenderOptions = {}): string {
  const placed = layout(perspective);
  const originX = PAD;
  const originY = PAD + HEADER;
  const callouts = calloutGeometry(perspective, placed);
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

  const strokes = new Set<string>([SKIN.muted, SKIN.accent, SKIN.link]);
  for (const { edge } of routed) {
    strokes.add(SWATCH[edge.color ?? "black"].stroke);
  }

  const contentRight = Math.max(
    placed.bounds.w,
    ...calloutBoxes.map((b) => b.x + b.w),
    840,
  );
  const contentBottom = Math.max(placed.bounds.h, ...calloutBoxes.map((b) => b.y + b.h), 200);
  const width = snap(contentRight + PAD * 2);
  const height = snap(contentBottom + originY + PAD);

  const slug = perspective.id;
  const blurbLines = wrap(perspective.blurb, 92);

  const markers = [...strokes]
    .map((color) => {
      const id = `${slug}-arrow-${hexId(color)}`;
      return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${color}"/></marker>`;
    })
    .join("");

  const zoneMarkup = placed.zones
    .map(({ zone, x, y, w, h }) => {
      const swatch = SWATCH[zone.color ?? "grey"];
      const title = zone.title.toUpperCase();
      const titleW = Math.min(w - 24, title.length * 7 + 16);
      const note = zone.note ?? "";
      return [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="rgba(12,18,38,0.02)" stroke="${swatch.stroke}" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="4,4"/>`,
        `<rect x="${x + 12}" y="${y - 6}" width="${titleW}" height="12" rx="2" fill="${SKIN.paper}"/>`,
        `<text x="${x + 12 + titleW / 2}" y="${y + 4}" fill="${swatch.stroke}" fill-opacity="0.85" font-size="${TYPE.zoneTitle}" font-family="${SKIN.mono}" font-weight="500" text-anchor="middle" letter-spacing="0.14em">${esc(title)}</text>`,
        note
          ? `<text x="${x + 16}" y="${y + 28}" fill="${SKIN.muted}" font-size="${TYPE.zoneNote}" font-family="${SKIN.sans}">${esc(note)}</text>`
          : "",
      ].join("");
    })
    .join("");

  const corners: Box[] = [];
  const arrows = routed
    .map(({ edge, path }) => {
      const swatch = SWATCH[edge.color ?? "black"];
      const d = roundedPath(path);
      if (!d) return "";
      for (const point of path.slice(1, -1)) {
        corners.push({ x: point.x - 12, y: point.y - 12, w: 24, h: 24 });
      }
      const dash = edge.dashed ? ` stroke-dasharray="4,3"` : "";
      const marker = `url(#${slug}-arrow-${hexId(swatch.stroke)})`;
      return `<path d="${d}" fill="none" stroke="${swatch.stroke}" stroke-width="${edge.dashed ? 1 : 1.2}"${dash} marker-end="${marker}"/>`;
    })
    .join("");

  const taken: Box[] = [];
  const labels = routed
    .flatMap(({ edge, path }) => {
      const text = edge.label;
      if (!text) return [];
      const swatch = SWATCH[edge.color ?? "black"];
      const w = snap(text.length * TYPE.edgeLabel * 0.62 + 16);
      const h = 12;
      const at = labelAnchor(path, { w, h }, [...corners, ...taken]);
      const box = { x: at.x - w / 2, y: at.y - h / 2, w, h };
      taken.push(box);
      return [
        `<rect x="${snap(box.x)}" y="${snap(box.y)}" width="${w}" height="${h}" rx="2" fill="${SKIN.paper}"/>`,
        `<text x="${snap(at.x)}" y="${snap(box.y) + 9}" fill="${swatch.stroke}" font-size="${TYPE.edgeLabel}" font-family="${SKIN.mono}" text-anchor="middle" letter-spacing="0.06em">${esc(text)}</text>`,
      ];
    })
    .join("");

  const nodes = placed.nodes
    .map(({ node, x, y, w, h }) => {
      const swatch = SWATCH[node.color ?? "black"];
      const fill = node.accent ? SKIN.accentTint : swatch.fill;
      const stroke = node.accent ? SKIN.accent : swatch.stroke;
      const weight = node.accent ? 1.2 : 1;
      const head = node.step === undefined ? node.label : `${node.step}  ${node.label}`;
      const cx = x + w / 2;
      const nameY = node.sub ? y + 40 : y + h / 2 + 4;
      return [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="${SKIN.paper}"/>`,
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="${weight}"/>`,
        `<text x="${cx}" y="${nameY}" fill="${SKIN.ink}" font-size="${TYPE.nodeLabel}" font-weight="600" font-family="${SKIN.sans}" text-anchor="middle">${esc(head)}</text>`,
        node.sub
          ? `<text x="${cx}" y="${y + h - 20}" fill="${SKIN.muted}" font-size="${TYPE.nodeSub}" font-family="${SKIN.mono}" text-anchor="middle">${esc(node.sub)}</text>`
          : "",
      ].join("");
    })
    .join("");

  const calloutMarkup = callouts
    .map(({ callout, box, titleLines, bodyLines, bodyY }) => {
      const lane = placed.laneBounds[callout.lane];
      const attachX = lane ? lane.x + lane.w : box.x - 24;
      const attachY = lane ? lane.y + 24 : box.y;
      const lead = `M${box.x - 8},${box.y + 16} Q${(box.x + attachX) / 2},${box.y - 8} ${attachX + 8},${attachY}`;
      return [
        `<path d="${lead}" fill="none" stroke="rgba(12,18,38,0.35)" stroke-width="1" stroke-dasharray="4,3"/>`,
        `<circle cx="${attachX + 8}" cy="${attachY}" r="2" fill="${SKIN.ink}"/>`,
        `<text font-family="${SKIN.serif}" font-style="italic" font-size="${TYPE.calloutTitle}" fill="${SKIN.ink}">${tspans(titleLines, box.x, box.y + 16, 20)}</text>`,
        `<text font-family="${SKIN.sans}" font-size="${TYPE.calloutBody}" fill="${SKIN.muted}">${tspans(bodyLines, box.x, box.y + bodyY, 16)}</text>`,
      ].join("");
    })
    .join("");

  const fontBlock = opts.fontCss ? `<style>${opts.fontCss}</style>` : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${slug}-title ${slug}-desc">`,
    `<title id="${slug}-title">${esc(perspective.name)}</title>`,
    `<desc id="${slug}-desc">${esc(perspective.blurb)}</desc>`,
    `<defs>${fontBlock}${markers}</defs>`,
    `<rect width="100%" height="100%" fill="${SKIN.paper}"/>`,
    `<text x="${PAD}" y="${PAD + 8}" fill="${SKIN.soft}" font-size="8" font-family="${SKIN.mono}" font-weight="500" letter-spacing="0.18em">NANOHYPE · ATLAS</text>`,
    `<text x="${PAD}" y="${PAD + 40}" fill="${SKIN.ink}" font-size="${TYPE.pageTitle}" font-family="${SKIN.serif}">${esc(perspective.name)}</text>`,
    `<text font-family="${SKIN.sans}" font-size="${TYPE.pageBlurb}" fill="${SKIN.muted}">${tspans(blurbLines, PAD, PAD + 64, 16)}</text>`,
    `<g transform="translate(${originX} ${originY})">`,
    zoneMarkup,
    arrows,
    nodes,
    labels,
    calloutMarkup,
    `</g>`,
    `</svg>`,
    "",
  ].join("");
}

/** Model-derived fingerprint — geometry and copy, never measured text. */
export function fingerprintPerspective(perspective: Perspective): unknown[] {
  const placed = layout(perspective);
  const rows: unknown[] = [
    { type: "title", text: perspective.name },
    { type: "blurb", text: perspective.blurb },
  ];
  for (const z of placed.zones) {
    rows.push({
      type: "zone",
      id: z.zone.id,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      stroke: SWATCH[z.zone.color ?? "grey"].stroke,
      text: z.zone.title,
    });
  }
  for (const n of placed.nodes) {
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
    });
  }
  for (const e of perspective.edges) {
    rows.push({
      type: "edge",
      from: e.from,
      to: e.to,
      text: e.label ?? "",
      dashed: Boolean(e.dashed),
      stroke: SWATCH[e.color ?? "black"].stroke,
    });
  }
  return rows;
}
