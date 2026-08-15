/**
 * Write every perspective to disk as a standalone SVG.
 *
 * The perspective files are the source of truth. GitHub renders README
 * markdown with scripts and iframes stripped, so an image is the only thing
 * that embeds. Each SVG carries its font faces inlined — a family that is only
 * named will fall back on a machine that has never heard of Geist.
 *
 * Usage: node scripts/emit.ts [outDir]
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderEditorialSvg, fingerprintPerspective } from "../src/editorial.ts";
import { fontFaceCss } from "./fonts.ts";
import { PERSPECTIVES } from "../src/perspectives/index.ts";

const outDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "out";

await mkdir(outDir, { recursive: true });
for (const name of await readdir(outDir)) {
  if (name.endsWith(".svg")) await rm(`${outDir}/${name}`);
}

const fontCss = fontFaceCss();
const manifest: Array<{
  index: number;
  id: string;
  name: string;
  blurb: string;
  svg: string;
}> = [];
const fingerprint: Record<string, unknown> = {};

for (const [index, perspective] of PERSPECTIVES.entries()) {
  const stem = `${String(index).padStart(2, "0")}-${perspective.id}`;
  const svg = renderEditorialSvg(perspective, { fontCss });
  await writeFile(`${outDir}/${stem}-light.svg`, svg, "utf8");
  manifest.push({
    index,
    id: perspective.id,
    name: perspective.name,
    blurb: perspective.blurb,
    svg: `${stem}-light.svg`,
  });
  fingerprint[perspective.id] = fingerprintPerspective(perspective);
}

await writeFile(`${outDir}/atlas.fingerprint.json`, `${JSON.stringify(fingerprint, null, 2)}\n`, "utf8");
await writeFile(`${outDir}/atlas.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

let missing = 0;
for (const entry of manifest) {
  const body = await readFile(`${outDir}/${entry.svg}`, "utf8");
  if (!body.includes("@font-face")) {
    console.error(`FAIL  ${entry.svg} references fonts it does not carry`);
    missing += 1;
  }
  if (!body.includes('role="img"') || !body.includes(`${entry.id}-title`)) {
    console.error(`FAIL  ${entry.svg} is missing the accessible-name contract`);
    missing += 1;
  }
}

console.log(`wrote ${manifest.length} svg to ${outDir}/`);
console.log(`  fonts inlined in ${manifest.length - missing}/${manifest.length} svgs`);

if (missing > 0) process.exit(1);
