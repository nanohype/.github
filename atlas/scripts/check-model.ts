/**
 * Structural check on the perspective model, with no browser involved.
 *
 * The failure this exists for: an edge naming a node that isn't on the page.
 * `build.ts` throws on it at render time, but only for the page you happen to
 * be looking at — so a bad edge on perspective 9 survives every check until
 * someone clicks tab 9. This runs the whole atlas in one pass.
 *
 * The label checks are the other half. tldraw grows a shape to fit its label
 * rather than shrinking the text, so an over-long label silently moves the
 * boxes the layout module just placed — a diagram that is subtly wrong rather
 * than obviously broken.
 */
import { PERSPECTIVES } from "../src/perspectives/index.ts";

const MAX_LABEL = 34;
const MAX_SUB = 34;

let errors = 0;
let warnings = 0;

function fail(message: string) {
  console.error(`FAIL  ${message}`);
  errors += 1;
}

function warn(message: string) {
  console.warn(`WARN  ${message}`);
  warnings += 1;
}

const seenPerspectives = new Set<string>();

for (const p of PERSPECTIVES) {
  if (seenPerspectives.has(p.id)) fail(`duplicate perspective id: ${p.id}`);
  seenPerspectives.add(p.id);

  const nodeIds = new Set<string>();
  const zoneIds = new Set<string>();
  const nodeCount = { total: 0 };

  for (const lane of p.lanes) {
    for (const zone of lane) {
      if (zoneIds.has(zone.id)) fail(`[${p.id}] duplicate zone id: ${zone.id}`);
      zoneIds.add(zone.id);

      const cols = zone.cols ?? zone.nodes.reduce((n, node) => n + (node.wide ? 2 : 1), 0);
      const widest = Math.max(...zone.nodes.map((n) => (n.wide ? 2 : 1)));
      if (widest > cols) {
        fail(`[${p.id}] zone ${zone.id}: a wide node cannot fit in ${cols} column(s)`);
      }

      for (const node of zone.nodes) {
        if (nodeIds.has(node.id)) fail(`[${p.id}] duplicate node id: ${node.id}`);
        nodeIds.add(node.id);
        nodeCount.total += 1;

        if (node.label.length > MAX_LABEL) {
          warn(
            `[${p.id}] label ${node.label.length}/${MAX_LABEL} chars will distort layout: "${node.label}"`,
          );
        }
        if (node.sub && node.sub.length > MAX_SUB) {
          warn(
            `[${p.id}] sub ${node.sub.length}/${MAX_SUB} chars will distort layout: "${node.sub}"`,
          );
        }
      }
    }
  }

  const connected = new Set<string>();
  for (const edge of p.edges) {
    if (!nodeIds.has(edge.from)) fail(`[${p.id}] edge from unknown node: ${edge.from}`);
    if (!nodeIds.has(edge.to)) fail(`[${p.id}] edge to unknown node: ${edge.to}`);
    if (edge.from === edge.to) fail(`[${p.id}] self-edge on ${edge.from}`);
    connected.add(edge.from);
    connected.add(edge.to);
  }

  const orphans = [...nodeIds].filter((id) => !connected.has(id));
  if (orphans.length > 0) {
    warn(`[${p.id}] ${orphans.length} node(s) with no edge: ${orphans.join(", ")}`);
  }

  console.log(
    `  ${p.id.padEnd(16)} ${String(nodeCount.total).padStart(3)} nodes  ${String(p.edges.length).padStart(3)} edges  ${zoneIds.size} zones`,
  );
}

console.log("");
if (errors > 0) {
  console.error(`${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
}
console.log(`PASS: ${PERSPECTIVES.length} perspectives, ${warnings} warning(s)`);
