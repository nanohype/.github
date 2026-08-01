/**
 * The only module that knows about Excalidraw.
 *
 * Produces `ExcalidrawElementSkeleton[]` — the documented programmatic shape —
 * and lets `convertToExcalidrawElements` fill in ids, seeds and version
 * bookkeeping. Skeletons are also what makes a scene hand-editable: the output
 * is an ordinary `.excalidraw` file, so a diagram can be opened at
 * excalidraw.com and nudged without touching this code.
 *
 * Element order is z-order, so zones are emitted before nodes, and arrows last.
 */
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { FONT_FAMILY, ROUNDNESS } from "@excalidraw/excalidraw";
import { type Box, CALLOUT_GAP, CALLOUT_W, type Layout, layout } from "./layout.ts";
import { INK, LINE_HEIGHT, PAGE_BG, SWATCH, TYPE } from "./design.ts";
import type { Perspective, Theme } from "./model.ts";
import { type Point, routeEdges } from "./routing.ts";

interface Register {
  font: number;
  /** 0 architect (ruled), 1 artist (hand-drawn). */
  roughness: number;
}

const REGISTERS: Record<Theme, Register> = {
  clean: { font: FONT_FAMILY.Nunito, roughness: 0 },
  sketch: { font: FONT_FAMILY.Excalifont, roughness: 1 },
};

function nodeId(perspectiveId: string, id: string): string {
  return `${perspectiveId}-n-${id}`;
}

/**
 * A stable `seed` for an element, derived from what the element *is*.
 *
 * Excalidraw draws with roughjs, and roughjs derives its hand-drawn stroke
 * geometry from `element.seed`. Left unset, `convertToExcalidrawElements`
 * assigns a random one — so the same model exports a different SVG on every
 * run, every regeneration is a diff, and any gate comparing committed output
 * against a fresh build fails spuriously and gets deleted.
 *
 * FNV-1a over a key that names the element. Not a security hash; it only has to
 * be stable across runs and well-spread enough that neighbouring shapes do not
 * share a wobble.
 */
function seedFor(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Excalidraw seeds are positive 31-bit integers.
  return (h >>> 0) % 2147483647;
}

/**
 * A binding that pins the arrow to an exact point on the shape.
 *
 * `ExcalidrawArrowElement.startBinding` is typed as `PointBinding`, but an
 * elbow arrow reads it as `FixedPointBinding` and honours the extra
 * `fixedPoint` field — the published skeleton type just does not narrow to the
 * elbow variant. Without the cast the field is dropped and the router re-picks
 * its own attachment per arrow, which collapses the fanned anchors back onto a
 * single point and undoes the separation `routing.ts` exists to create.
 */
function fixedBinding(elementId: string, x: number, y: number) {
  return { elementId, focus: 0, gap: 4, fixedPoint: [x, y] } as unknown as {
    elementId: string;
    focus: number;
    gap: number;
  };
}

export function renderPerspective(
  perspective: Perspective,
  theme: Theme = "clean",
): ExcalidrawElementSkeleton[] {
  const reg = REGISTERS[theme];
  const placed: Layout = layout(perspective);
  const out: ExcalidrawElementSkeleton[] = [];

  out.push({
    type: "text",
    id: `${perspective.id}-title`,
    x: 0,
    y: -156,
    text: perspective.name,
    seed: seedFor(`${perspective.id}-title`),
    fontSize: TYPE.pageTitle,
    fontFamily: reg.font,
    strokeColor: INK.title,
  });

  out.push({
    type: "text",
    id: `${perspective.id}-blurb`,
    x: 0,
    y: -100,
    // Pre-wrapped: Excalidraw does not wrap free-standing text, so an unwrapped
    // blurb runs off to the right and drags the scene bounds with it, which
    // makes every zoom-to-fit frame a sentence instead of the diagram.
    text: wrap(perspective.blurb, 92),
    seed: seedFor(`${perspective.id}-blurb`),
    fontSize: TYPE.pageBlurb,
    fontFamily: reg.font,
    strokeColor: INK.muted,
  });

  // ---- zones ------------------------------------------------------------
  for (const { zone, x, y, w, h } of placed.zones) {
    const swatch = SWATCH[zone.color ?? "grey"];

    out.push({
      type: "rectangle",
      id: `${perspective.id}-z-${zone.id}`,
      seed: seedFor(`z${perspective.id}${zone.id}`),
      x,
      y,
      width: w,
      height: h,
      strokeColor: swatch.stroke,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "dashed",
      roughness: reg.roughness,
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      opacity: 55,
    });

    out.push({
      type: "text",
      id: `${perspective.id}-zt-${zone.id}`,
      x: x + 20,
      y: y + 16,
      text: zone.title,
      seed: seedFor(`zt${perspective.id}${zone.id}`),
      fontSize: TYPE.zoneTitle,
      fontFamily: reg.font,
      strokeColor: swatch.stroke,
    });

    if (zone.note) {
      out.push({
        type: "text",
        id: `${perspective.id}-zn-${zone.id}`,
        x: x + 20,
        y: y + 40,
        text: zone.note,
        seed: seedFor(`zn${perspective.id}${zone.id}`),
        fontSize: TYPE.zoneNote,
        fontFamily: reg.font,
        strokeColor: INK.muted,
      });
    }
  }

  // ---- nodes ------------------------------------------------------------
  for (const { node, x, y, w, h } of placed.nodes) {
    const swatch = SWATCH[node.color ?? "black"];
    const head = node.step === undefined ? node.label : `${node.step}. ${node.label}`;

    out.push({
      type: "rectangle",
      id: nodeId(perspective.id, node.id),
      seed: seedFor(`n${perspective.id}${node.id}`),
      x,
      y,
      width: w,
      height: h,
      strokeColor: swatch.stroke,
      backgroundColor: node.accent ? swatch.accent : swatch.fill,
      fillStyle: "solid",
      strokeWidth: node.accent ? 2 : 1,
      strokeStyle: "solid",
      roughness: reg.roughness,
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      label: {
        text: head,
        seed: seedFor(`nl${perspective.id}${node.id}`),
        fontSize: TYPE.nodeLabel,
        fontFamily: reg.font,
        strokeColor: INK.title,
        // Sits above centre when there is a caption underneath it.
        verticalAlign: node.sub ? "top" : "middle",
      },
    });

    if (node.sub) {
      // A caption is its own element because a container label carries exactly
      // one size and one colour — and the size difference between a name and
      // its qualifier is most of what makes a dense page scannable.
      //
      // With `textAlign: "center"`, `x` is the text's CENTRE, not its left
      // edge — and the `width` passed alongside it is discarded, because the
      // converter always re-measures the string. Verified against the built
      // scene: a caption declared at the node's left edge came back at
      // `nodeX - textWidth / 2`, exactly half its own width too far left, on
      // every node of every page.
      //
      // So the anchor is the node's horizontal centre and Excalidraw does the
      // rest. Passing a width here would only look like it was doing something.
      out.push({
        type: "text",
        id: `${perspective.id}-ns-${node.id}`,
        x: x + w / 2,
        y: y + h - 26,
        text: node.sub,
        seed: seedFor(`ns${perspective.id}${node.id}`),
        fontSize: TYPE.nodeSub,
        fontFamily: reg.font,
        strokeColor: INK.muted,
        textAlign: "center",
      });
    }
  }

  // ---- callouts ---------------------------------------------------------
  // Geometry first, drawing second: an edge routed before the callout box is
  // known will happily run through it, and so will a label chip. Both did.
  const calloutBoxes: Box[] = [];
  const calloutParts = (perspective.callouts ?? []).map((callout, i) => {
    const lane = placed.laneBounds[callout.lane];
    if (!lane) return null;
    const swatch = SWATCH[callout.color ?? "yellow"];
    const x = lane.x + lane.w + CALLOUT_GAP;
    const titleText = wrap(callout.title, 30);
    const bodyText = wrap(callout.body, 34);
    const titleLines = titleText.split("\n").length;
    const bodyLines = bodyText.split("\n").length;
    const titleH = titleLines * (TYPE.calloutTitle * LINE_HEIGHT);
    // The body starts below however tall the title actually is. A fixed offset
    // works only while every title fits one line, and silently overprints the
    // body the moment one wraps.
    const bodyY = 18 + titleH + 14;
    const height = bodyY + bodyLines * (TYPE.calloutBody * LINE_HEIGHT) + 18;
    const box = { x, y: lane.y, w: CALLOUT_W, h: height };
    calloutBoxes.push(box);
    return { i, callout, swatch, box, titleText, bodyText, bodyY };
  });

  for (const part of calloutParts) {
    if (!part) continue;
    const { i, swatch, box, titleText, bodyText, bodyY } = part;

    out.push({
      type: "rectangle",
      id: `${perspective.id}-c-${i}`,
      seed: seedFor(`c${perspective.id}${i}`),
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
      strokeColor: swatch.stroke,
      backgroundColor: swatch.fill,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: reg.roughness,
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
    });

    out.push({
      type: "text",
      id: `${perspective.id}-ct-${i}`,
      seed: seedFor(`ct${perspective.id}${i}`),
      x: box.x + 18,
      y: box.y + 18,
      text: titleText,
      fontSize: TYPE.calloutTitle,
      fontFamily: reg.font,
      strokeColor: swatch.stroke,
    });

    out.push({
      type: "text",
      id: `${perspective.id}-cb-${i}`,
      seed: seedFor(`cb${perspective.id}${i}`),
      x: box.x + 18,
      y: box.y + bodyY,
      text: bodyText,
      fontSize: TYPE.calloutBody,
      fontFamily: reg.font,
      strokeColor: INK.body,
    });
  }

  // ---- edges ------------------------------------------------------------
  // Nodes and callouts block; zones do not — an arrow must be able to enter a
  // boundary, that is most of what the edges on these pages are for.
  // Nodes and zone headings block; zone *bodies* do not — an arrow has to be
  // able to enter a boundary, which is most of what these edges are for.
  const obstacles: Box[] = [
    ...placed.nodes.map(({ x, y, w, h }) => ({ x, y, w, h })),
    ...calloutBoxes,
  ];

  const labels: Array<{ edge: (typeof perspective.edges)[number]; path: Point[]; color: string }> = [];

  for (const routed of routeEdges(
    perspective.edges,
    placed.nodes,
    placed.gutters,
    obstacles,
    placed.bounds,
    [...placed.titleBoxes, ...placed.zoneBands],
  )) {
    const { edge, path, from, to } = routed;
    const origin = path[0];
    const swatch = SWATCH[edge.color ?? "black"];
    const fromShape = nodeId(perspective.id, edge.from);
    const toShape = nodeId(perspective.id, edge.to);

    // One cast for the whole element. `elbowed` lives on ExcalidrawArrowElement
    // while the skeleton's arrow variant is typed against ExcalidrawLinearElement,
    // which does not carry it — so neither `elbowed` nor the fixed-point bindings
    // type-check even though the runtime honours both. Casting the literal keeps
    // the gap in one place instead of scattering `as any` through the fields.
    out.push({
      type: "arrow",
      id: `${perspective.id}-e-${routed.index}-${edge.from}-${edge.to}`,
      seed: seedFor(`e${perspective.id}${edge.from}${edge.to}${routed.index}`),
      // Elbow routing. Excalidraw ships an orthogonal router that steps around
      // the boxes between two endpoints; a straight arc just crosses whatever
      // is in the way, which on a lane diagram is most of the page. This is the
      // difference between "a line reaches that box" and "you can follow it".
      elbowed: true,
      x: origin.x,
      y: origin.y,
      // The full orthogonal polyline, relative to the arrow's own origin.
      points: path.map((p) => [p.x - origin.x, p.y - origin.y]),
      // `fixedPoint` pins the attachment to the anchor `routing.ts` computed —
      // the fan that keeps sibling edges apart. Plain bindings let the router
      // re-pick an attachment per arrow, which collapses the fan back onto one
      // point and undoes the separation.
      startBinding: fixedBinding(fromShape, from.x, from.y),
      endBinding: fixedBinding(toShape, to.x, to.y),
      strokeColor: swatch.stroke,
      backgroundColor: "transparent",
      // Excalidraw sizes an arrowhead from the stroke width, so a thinner line
      // is also a tighter point. At 2 the heads read as blobs at export scale.
      strokeWidth: 1,
      strokeStyle: edge.dashed ? "dashed" : "solid",
      roughness: reg.roughness,
      opacity: edge.dashed ? 65 : 100,
      // Arrowheads carry the same distinction the stroke does: a solid arrow
      // creates or calls; a hollow dot only refers.
      startArrowhead: null,
      // A closed triangle reads as a direction at small sizes where the open
      // "arrow" chevron dissolves. Outline rather than filled keeps it light
      // against the line. Dashed edges keep a hollow dot: they only reference,
      // and the terminal shape is what carries that distinction.
      endArrowhead: edge.dashed ? "circle_outline" : "triangle_outline",
      start: { id: fromShape },
      end: { id: toShape },
    } as unknown as ExcalidrawElementSkeleton);

    // The label is deliberately NOT bound to the arrow.
    //
    // A bound label gets a mask that punches it out of its own arrow — but only
    // its own. Any other edge crossing that spot still runs straight through the
    // text, which is most of the illegibility on a dense page. Collecting the
    // labels here and drawing them after every arrow gives each one an opaque
    // chip that occludes whatever passes beneath, whoever drew it.
    if (edge.label) {
      labels.push({ edge, path, color: swatch.stroke });
    }
  }

  // Chips are added to the obstacle set as they are placed, so each one also
  // avoids the ones already down. Without this two labels whose routes pass the
  // same gap land on the same spot and neither is readable — which is exactly
  // what happened to "vocabulary" and "the bar" on the factory page.
  const taken: Box[] = [];

  for (const { edge, path, color } of labels) {
    const text = edge.label ?? "";
    // Excalidraw re-measures the string and discards any width passed in, so
    // the chip is sized from the same estimate the caption path uses and the
    // text is centred on the chip rather than positioned from its left edge.
    const w = text.length * TYPE.edgeLabel * 0.58 + 14;
    const h = TYPE.edgeLabel * LINE_HEIGHT + 8;
    const at = labelAnchor(path, { w, h }, [...obstacles, ...placed.titleBoxes, ...taken]);
    taken.push({ x: at.x - w / 2, y: at.y - h / 2, w, h });

    out.push({
      type: "rectangle",
      id: `${perspective.id}-lc-${edge.from}-${edge.to}`,
      seed: seedFor(`lc${perspective.id}${edge.from}${edge.to}`),
      x: at.x - w / 2,
      y: at.y - h / 2,
      width: w,
      height: h,
      strokeColor: "transparent",
      backgroundColor: PAGE_BG.light,
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
    });

    out.push({
      type: "text",
      id: `${perspective.id}-lt-${edge.from}-${edge.to}`,
      seed: seedFor(`lt${perspective.id}${edge.from}${edge.to}`),
      x: at.x,
      y: at.y - (TYPE.edgeLabel * LINE_HEIGHT) / 2,
      text,
      fontSize: TYPE.edgeLabel,
      fontFamily: reg.font,
      strokeColor: color,
      textAlign: "center",
    });
  }

  return out;
}

/**
 * The point half-way along a polyline, by arc length.
 *
 * Not the middle vertex: on an L-shaped route one leg is often far longer than
 * the other, so the middle vertex is the corner — the worst place to put a
 * label, since two segments meet there.
 */
function labelAnchor(path: Point[], size: { w: number; h: number }, obstacles: Box[]): Point {
  // Find somewhere legible for the chip, preferring the middle of the route.
  //
  // Sitting it on the arc-length midpoint unconditionally drops it onto
  // whatever box the route happens to be passing, so the chip then hides a
  // node's label instead of the arrow hiding the chip's. But searching *along*
  // the path alone is not enough either: a chip is often wider than the gap
  // between two boxes, so on a dense page no on-path position is clear at all.
  //
  // So the search is two-dimensional — each sampled point on the route is also
  // tried at increasing perpendicular offsets. A label a little to the side of
  // its line is still unambiguously that line's label, and it is legible.
  const mid = midpointOf(path);

  const clears = (at: Point) => {
    const x0 = at.x - size.w / 2 - 3;
    const x1 = at.x + size.w / 2 + 3;
    const y0 = at.y - size.h / 2 - 3;
    const y1 = at.y + size.h / 2 + 3;
    return obstacles.every((o) => x1 < o.x || x0 > o.x + o.w || y1 < o.y || y0 > o.y + o.h);
  };

  let best: Point | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    // Unit normal to this segment; the offsets run along it.
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const steps = Math.max(1, Math.round(len / 6));

    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const on = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };

      for (const off of [0, 11, -11, 20, -20, 30, -30, 42, -42, 56, -56, 70, -70]) {
        const at = { x: on.x + nx * off, y: on.y + ny * off };
        if (!clears(at)) continue;
        // Distance from the route's middle, plus a penalty for stepping away
        // from the line — a label far along the path or far off it is harder
        // to attribute to the right edge.
        const score = Math.hypot(at.x - mid.x, at.y - mid.y) + Math.abs(off) * 1.6;
        if (score < bestScore) {
          bestScore = score;
          best = at;
        }
      }
    }
  }

  // Every position is covered — rare, and the midpoint is then no worse than
  // anywhere else.
  return best ?? mid;
}

function midpointOf(path: Point[]): Point {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (walked + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - walked) / seg;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * t,
      };
    }
    walked += seg;
  }
  return path[path.length - 1] ?? { x: 0, y: 0 };
}

/** Hard-wrap to a column budget; Excalidraw does not wrap free-standing text. */
function wrap(text: string, cols: number): string {
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
  return lines.join("\n");
}
