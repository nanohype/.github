/**
 * Write every perspective to disk as SVG + `.excalidraw`, headlessly.
 *
 * The dev server is a convenience for looking at the atlas; these files are the
 * deliverable. GitHub renders README markdown with scripts and iframes
 * stripped, so an image is the only thing that can embed — and an SVG carries
 * no Excalidraw code with it, only geometry.
 *
 * The `.excalidraw` beside each one is what keeps a diagram correctable by a
 * human: it opens at excalidraw.com, so fixing a box never requires running
 * this project.
 *
 * Usage: node scripts/emit.ts [outDir] [--url=http://127.0.0.1:5273]
 */
import { spawn } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const svgDir = args.find((a) => !a.startsWith("--")) ?? "out";
const sceneDir = (args.find((a) => a.startsWith("--scenes=")) ?? "--scenes=out").slice(9);
const url = (args.find((a) => a.startsWith("--url=")) ?? "--url=http://127.0.0.1:5273").slice(6);

/**
 * Reuse a dev server if one is already up, otherwise start one and stop it
 * again. Without this the command only works when someone happens to be running
 * `pnpm dev`, which makes it useless as a CI gate — and a gate that cannot run
 * in CI is a gate that stops being true.
 */
async function reachable(): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1200) });
    return true;
  } catch {
    return false;
  }
}

let server: ReturnType<typeof spawn> | null = null;
if (!(await reachable())) {
  server = spawn("npx", ["vite", "--port", new URL(url).port, "--host", "127.0.0.1"], {
    stdio: "ignore",
    detached: false,
  });
  const deadline = Date.now() + 45_000;
  while (!(await reachable())) {
    if (Date.now() > deadline) throw new Error(`vite did not come up at ${url}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

// Only the SVGs are swept, and only SVGs — the target is a shared assets
// directory, so a blanket recursive delete would take anything else living
// beside them. Sweeping first still matters: a renamed perspective would
// otherwise leave its old file behind, and a stale diagram in a README is worse
// than a missing one.
await mkdir(svgDir, { recursive: true });
for (const name of await readdir(svgDir)) {
  if (name.endsWith(".svg")) await rm(`${svgDir}/${name}`);
}
await mkdir(sceneDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(".excalidraw__canvas", { timeout: 30_000 });
// Let the font epoch fire so the scene is measured against the real faces
// rather than the fallback metrics of the first build.
await page.waitForTimeout(2500);

const {
  out: files,
  fingerprint,
  wrapped,
  manifest,
} = await page.evaluate(async () => {
  const atlas = (
    window as unknown as {
      __atlas: {
        scenes: unknown[][];
        perspectives: Array<{ id: string; name: string; blurb: string }>;
        exportToSvg: (opts: unknown) => Promise<SVGSVGElement>;
      };
    }
  ).__atlas;

  const out: Array<{ name: string; body: string }> = [];

  // What each perspective is, for anything that consumes the diagrams without
  // being able to read the model. The SVGs carry geometry and nothing else, so
  // a reader outside this repo has the picture and no way to know what it is
  // called or which question it answers — both of which are authored on the
  // perspective and were previously reachable only by importing TypeScript
  // across a repo boundary.
  //
  // Built in the same pass that writes the SVGs, and skipping the same empty
  // scenes, so the manifest cannot name a file the emit did not produce.
  const manifest: Array<{
    index: number;
    id: string;
    name: string;
    blurb: string;
    svg: string;
  }> = [];


  for (const [index, perspective] of atlas.perspectives.entries()) {
    const elements = atlas.scenes[index];
    if (!elements || elements.length === 0) continue;
    const stem = `${String(index).padStart(2, "0")}-${perspective.id}`;

    out.push({
      name: `${stem}.excalidraw`,
      body: JSON.stringify(
        {
          type: "excalidraw",
          version: 2,
          source: "nanohype-atlas",
          elements,
          appState: { viewBackgroundColor: "#ffffff", gridSize: null },
          files: {},
        },
        null,
        2,
      ),
    });

    // Light only. The dark variant was Excalidraw's own inversion of a palette
    // tuned for a light ground, which came out muddy rather than dark — and
    // once the profile stopped referencing it, eleven unreferenced files were
    // left behind. A real dark register would be a purpose-built palette, not
    // an inversion, and is worth building only if something asks for it.
    const svg = await atlas.exportToSvg({
      elements,
      files: null,
      exportPadding: 40,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
    });
    out.push({ name: `${stem}-light.svg`, body: svg.outerHTML });
    manifest.push({
      index,
      id: perspective.id,
      name: perspective.name,
      blurb: perspective.blurb,
      svg: `${stem}-light.svg`,
    });
  }

  // A platform-independent fingerprint of the scene, written beside the SVGs.
  //
  // Byte-comparing the SVGs cannot work: text elements are sized by measuring
  // the string, and Chromium measures differently on macOS and Linux — observed
  // at 0.44px on a short label and 1.5px on a page title. Real, and not
  // something a rounding tolerance can absorb.
  //
  // So the fingerprint carries everything that comes from the *model* — every
  // box's position and size, every colour, every string — and omits the one
  // thing that comes from the renderer: the measured width of a text run. That
  // still catches the failure this gate exists for (a perspective edited
  // without re-emitting) and no longer fails for running on a different OS.
  const fingerprint: Record<string, unknown> = {};
  for (const [index, perspective] of atlas.perspectives.entries()) {
    const elements = (atlas.scenes[index] ?? []) as Array<Record<string, unknown>>;
    fingerprint[perspective.id] = elements.map((e) => {
      const base: Record<string, unknown> = {
        type: e.type,
        // Deliberately no id. Text bound to a container is minted by the
        // converter rather than passed in, so it gets a fresh random id on
        // every build and `regenerateIds: false` does not reach it. Element
        // order is deterministic, and position plus text already identify a
        // shape, so the id earns nothing here and costs reproducibility.
        y: Math.round(e.y as number),
        stroke: e.strokeColor,
        bg: e.backgroundColor,
      };
      if (e.type === "text") {
        // No `x` and no `width`. Both are renderer outputs for a centred text
        // element: Excalidraw measures the string, then places it at
        // `centre - width/2`. Excluding width alone was not enough — CI still
        // saw 1px shifts, because the x it derives from that width carries the
        // same platform variance one layer down.
        //
        // Nothing is lost. A caption's position is derived from the node it
        // sits under, and that node's rectangle is fingerprinted in full, so a
        // layout change still moves something this file records.
        base.text = e.text;
        base.fontSize = e.fontSize;
      } else {
        base.x = Math.round(e.x as number);
        base.w = Math.round(e.width as number);
        base.h = Math.round(e.height as number);
      }
      if (e.type === "arrow") base.points = (e.points as number[][]).length;
      return base;
    });
  }

  // Only *bound* text can be wrapped by Excalidraw — a label inside a shape or
  // on an arrow. Free-standing text (page blurbs, callout bodies) is pre-wrapped
  // by the renderer itself, so its newlines are authored and must not be
  // reported. containerId is the discriminator, and it is only visible here.
  const wrapped: string[] = [];
  for (const [index, perspective] of atlas.perspectives.entries()) {
    for (const e of (atlas.scenes[index] ?? []) as Array<Record<string, unknown>>) {
      if (e.type !== "text" || !e.containerId) continue;
      if (typeof e.text === "string" && e.text.includes("\n")) {
        wrapped.push(`  ${perspective.id}: ${JSON.stringify(e.text)}`);
      }
    }
  }

  return { out, fingerprint, wrapped, manifest };
});

/**
 * Replace Excalidraw's generated SVG mask ids with sequential ones.
 *
 * A labelled arrow is drawn with a mask that punches the label out of the line,
 * and `exportToSvg` mints a fresh random id for each one on every render. Those
 * ids are not derived from any element, so they cannot be pinned from the model
 * — and they are the last thing standing between this output and byte-for-byte
 * reproducibility.
 *
 * That matters for two reasons: a regeneration should produce an empty diff
 * unless the model changed, and the CI check that catches stale committed
 * diagrams is a plain `git diff`. Renaming in first-appearance order is stable
 * because element order is.
 */
function normalizeMaskIds(svg: string): string {
  const seen = new Map<string, string>();
  return svg.replace(/mask-[A-Za-z0-9_-]{6,}/g, (id) => {
    let stable = seen.get(id);
    if (!stable) {
      stable = `mask-${seen.size}`;
      seen.set(id, stable);
    }
    return stable;
  });
}

for (const file of files) {
  const isSvg = file.name.endsWith(".svg");
  const dir = isSvg ? svgDir : sceneDir;
  await writeFile(`${dir}/${file.name}`, isSvg ? normalizeMaskIds(file.body) : file.body, "utf8");
}

await writeFile(`${svgDir}/atlas.fingerprint.json`, `${JSON.stringify(fingerprint, null, 2)}\n`, "utf8");

// Carries no timestamp, deliberately. The staleness gate for everything in this
// directory is a plain `git diff` after a re-emit, and a generated-at field
// would dirty the tree on every run — turning the one gate that catches an
// edited-but-not-re-emitted perspective into noise nobody reads.
await writeFile(`${svgDir}/atlas.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await browser.close();
server?.kill();

const svgs = files.filter((f) => f.name.endsWith(".svg"));
// A README renders the SVG on a machine that has never heard of Excalifont, so
// an SVG that merely *references* the font by name renders in a fallback and
// every label sits at the wrong width. Inlined faces are what make the file
// portable, and it is worth failing loudly if they are missing.
const inlined = svgs.filter((f) => f.body.includes("@font-face")).length;

console.log(`wrote ${svgs.length} svg to ${svgDir}/ and ${files.length - svgs.length} scenes to ${sceneDir}/`);
console.log(`  fonts inlined in ${inlined}/${svgs.length} svgs`);

if (errors.length > 0) {
  console.error(`\npage errors:\n  ${[...new Set(errors)].join("\n  ")}`);
  process.exit(1);
}
if (wrapped.length > 0) {
  console.error(`\n${wrapped.length} label(s) too long for their shape and wrapped:`);
  for (const w of wrapped) console.error(w);
  console.error("\nShorten them, or widen the node. A wrapped label is a layout the model did not choose.");
  process.exit(1);
}
if (inlined < svgs.length) {
  console.error("\nFAIL: some SVGs reference fonts they do not carry — they will render wrong off this machine");
  process.exit(1);
}
