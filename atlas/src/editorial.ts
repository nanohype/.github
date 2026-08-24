/**
 * Editorial SVG renderer.
 *
 * The perspective model, the layout, and the router stay as they are. This
 * module is the only place that knows about SVG: hairline boxes, rounded
 * orthogonal connectors, Geist / Instrument Serif, one brand accent for the
 * two or three boxes that carry the page.
 *
 * It places nothing. Every box, route and anchor arrives on the Scene the
 * composer built, so the drawing is a function of geometry someone else can
 * publish, compare and re-render.
 *
 * Visual grammar follows cathrynlavery/diagram-design. Layer hues stay, because
 * they are the atlas legend, not a second accent system.
 */
import { SKIN, SWATCH, TYPE } from "./design.ts";
import { SEMANTIC, type Perspective } from "./model.ts";
import { chipBox, compose, snap, snappedPolyline, wrap } from "./scene.ts";
import type { Point } from "./routing.ts";

const RADIUS = 6;
const ELBOW = 8;

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
  const pts = snappedPolyline(points);
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

export function renderEditorialSvg(perspective: Perspective, opts: RenderOptions = {}): string {
  const scene = compose(perspective);
  const { frame } = scene;
  const PAD = frame.pad;
  const originX = PAD;
  const originY = PAD + frame.header;

  const strokes = new Set<string>([SKIN.muted, SKIN.accent, SKIN.link]);
  for (const { edge } of scene.edges) {
    strokes.add(SWATCH[edge.color ?? "black"].stroke);
  }

  const slug = scene.perspective.id;
  const blurbLines = wrap(scene.perspective.blurb, 92);

  const markers = [...strokes]
    .map((color) => {
      const id = `${slug}-arrow-${hexId(color)}`;
      return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${color}"/></marker>`;
    })
    .join("");

  const zoneMarkup = scene.zones
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

  const arrows = scene.edges
    .map(({ edge, path }) => {
      const swatch = SWATCH[edge.color ?? "black"];
      const d = roundedPath(path);
      if (!d) return "";
      const dash = edge.dashed ? ` stroke-dasharray="4,3"` : "";
      const marker = `url(#${slug}-arrow-${hexId(swatch.stroke)})`;
      return `<path d="${d}" fill="none" stroke="${swatch.stroke}" stroke-width="${edge.dashed ? 1 : 1.2}"${dash} marker-end="${marker}"/>`;
    })
    .join("");

  const labels = scene.edges
    .flatMap(({ edge, labelAnchor: at }) => {
      const text = edge.label;
      if (!text || !at) return [];
      const swatch = SWATCH[edge.color ?? "black"];
      const { w, h } = chipBox(text);
      const box = { x: at.x - w / 2, y: at.y - h / 2 };
      return [
        `<rect x="${snap(box.x)}" y="${snap(box.y)}" width="${w}" height="${h}" rx="2" fill="${SKIN.paper}"/>`,
        `<text x="${snap(at.x)}" y="${snap(box.y) + 9}" fill="${swatch.stroke}" font-size="${TYPE.edgeLabel}" font-family="${SKIN.mono}" text-anchor="middle" letter-spacing="0.06em">${esc(text)}</text>`,
      ];
    })
    .join("");

  const nodes = scene.nodes
    .map(({ node, role, x, y, w, h }) => {
      const swatch = SWATCH[SEMANTIC[role]];
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

  const calloutMarkup = scene.callouts
    .map(({ callout, box, titleLines, bodyLines, bodyY }) => {
      const lane = scene.lanes[callout.lane];
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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.width} ${frame.height}" width="${frame.width}" height="${frame.height}" role="img" aria-labelledby="${slug}-title ${slug}-desc">`,
    `<title id="${slug}-title">${esc(scene.perspective.name)}</title>`,
    `<desc id="${slug}-desc">${esc(scene.perspective.blurb)}</desc>`,
    `<defs>${fontBlock}${markers}</defs>`,
    `<rect width="100%" height="100%" fill="${SKIN.paper}"/>`,
    `<text x="${PAD}" y="${PAD + 8}" fill="${SKIN.soft}" font-size="8" font-family="${SKIN.mono}" font-weight="500" letter-spacing="0.18em">NANOHYPE · ATLAS</text>`,
    `<text x="${PAD}" y="${PAD + 40}" fill="${SKIN.ink}" font-size="${TYPE.pageTitle}" font-family="${SKIN.serif}">${esc(scene.perspective.name)}</text>`,
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
