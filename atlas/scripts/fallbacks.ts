/**
 * Confirm A* found a route for every edge, without a browser.
 *
 * Through the composer, because the obstacle set is what decides whether a
 * route exists. Routing here against a set the drawing does not use would
 * assert that some other diagram has no fallbacks.
 */
import { PERSPECTIVES } from "../src/perspectives/index.ts";
import { compose } from "../src/scene.ts";

const warns: string[] = [];
const orig = console.warn;
console.warn = (...args: unknown[]) => {
  const text = args.map(String).join(" ");
  if (text.includes("[atlas]")) warns.push(text);
  orig(...args);
};

for (const p of PERSPECTIVES) {
  compose(p);
}

console.warn = orig;
console.log(warns.length ? warns.join("\n") : "no fallbacks — A* found a route for every edge");
if (warns.length > 0) process.exit(1);
