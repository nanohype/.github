/**
 * Confirm A* found a route for every edge, without a browser.
 */
import { layout } from "../src/layout.ts";
import { PERSPECTIVES } from "../src/perspectives/index.ts";
import { routeEdges } from "../src/routing.ts";

const warns: string[] = [];
const orig = console.warn;
console.warn = (...args: unknown[]) => {
  const text = args.map(String).join(" ");
  if (text.includes("[atlas]")) warns.push(text);
  orig(...args);
};

for (const p of PERSPECTIVES) {
  const placed = layout(p);
  routeEdges(
    p.edges,
    placed.nodes,
    placed.gutters,
    placed.nodes.map(({ x, y, w, h }) => ({ x, y, w, h })),
    placed.bounds,
    [...placed.titleBoxes, ...placed.zoneBands],
    placed.zones.map(({ x, y, w, h }) => ({ x, y, w, h })),
  );
}

console.warn = orig;
console.log(warns.length ? warns.join("\n") : "no fallbacks — A* found a route for every edge");
if (warns.length > 0) process.exit(1);
