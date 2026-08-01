/**
 * Every image the org profile references must actually be fetchable.
 *
 * A broken image on the org landing page fails silently in the worst way: the
 * markdown is valid, CI is green, and the only symptom is a torn-page icon that
 * nobody sees until someone visits. It is the same failure shape as a font an
 * SVG references but does not carry — correct locally, wrong for everyone else.
 *
 * Two checks, because they catch different things and neither is sufficient:
 *
 *   path   Every referenced URL maps to a file in this repo. Runs everywhere,
 *          including on a pull request, and catches the common cause — a typo
 *          or a renamed file.
 *
 *   fetch  Every URL actually returns an image. Only meaningful once the
 *          assets are on the branch the URLs name, so it is skipped elsewhere:
 *          a PR adding a new diagram legitimately points at a `main` that does
 *          not have it yet, and failing there would train people to ignore this.
 *
 * Usage: node scripts/check-readme-assets.ts [--fetch]
 *
 * `--fetch` additionally follows every outbound link on the page.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const doFetch = process.argv.includes("--fetch");
const README = "../profile/README.md";

const body = await readFile(README, "utf8");

// Only this repo's own raw URLs; shields.io badges and the like are not ours to
// vouch for and go down for reasons no gate here can fix.
// De-duplicated by URL, not by match object. Each diagram appears twice — once
// as the link target and once as the image source — and a Set of objects
// de-duplicates neither, so the gate was checking every asset twice and
// reporting a count nobody could reconcile with the page.
const seen = new Map<string, { url: string; path: string }>();
for (const m of body.matchAll(
  /https:\/\/raw\.githubusercontent\.com\/nanohype\/\.github\/[^/]+\/([^\s"'<>)]+)/g,
)) {
  if (!seen.has(m[0])) seen.set(m[0], { url: m[0], path: m[1] });
}
const urls = [...seen.values()];

if (urls.length === 0) {
  console.error("FAIL: no image references found in the profile — the markup changed and this gate is now blind");
  process.exit(1);
}

let bad = 0;

for (const { url, path } of urls) {
  if (!existsSync(`../${path}`)) {
    console.error(`FAIL  missing in repo: ${path}`);
    bad += 1;
    continue;
  }
  console.log(`ok    ${path}`);
}

// And the inverse: every diagram that exists must be on the page.
//
// The check above only proves the page's references resolve, which says nothing
// about a diagram the page forgot. Adding a perspective is two steps — write it,
// then reference it — and the second is the easy one to skip, with no symptom:
// the page still renders, CI is still green, and the new view is simply absent.
// Same silent-absence shape as a broken image, caught from the other side.
const ATLAS_DIR = "../profile/assets/atlas";
const referenced = new Set(urls.map((u) => u.path));
for (const name of (await readdir(ATLAS_DIR)).sort()) {
  if (!name.endsWith(".svg")) continue;
  const path = `profile/assets/atlas/${name}`;
  if (!referenced.has(path)) {
    console.error(`FAIL  emitted but not on the profile: ${name}`);
    bad += 1;
  }
}

// Links, not just images. The image checks would have happily shipped a
// `docs.nanohype.dev/atlas` that 404s — a dead link on the org landing page is
// the same silent failure as a broken image, and the page is mostly links.
if (doFetch) {
  console.log("");
  const links = [
    ...new Set(
      [...body.matchAll(/href="(https?:\/\/[^"]+)"/g)]
        .map((m) => m[1])
        // Images are covered below by their own check.
        .filter((u) => !u.endsWith(".svg")),
    ),
  ];
  for (const link of links) {
    try {
      const res = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
      console.log(`${res.ok ? "ok   " : "FAIL "} ${res.status} ${link}`);
      if (!res.ok) bad += 1;
    } catch (err) {
      console.error(`FAIL  unreachable: ${link} (${(err as Error).name})`);
      bad += 1;
    }
  }
  console.log("");
  for (const { url, path } of urls) {
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
      const type = res.headers.get("content-type") ?? "";
      const ok = res.ok && (type.includes("svg") || type.startsWith("image/"));
      console.log(`${ok ? "ok   " : "FAIL "} ${res.status} ${type.split(";")[0].padEnd(16)} ${path}`);
      if (!ok) bad += 1;
    } catch (err) {
      console.error(`FAIL  unreachable: ${path} (${(err as Error).name})`);
      bad += 1;
    }
  }
}

console.log("");
if (bad > 0) {
  console.error(`${bad} profile image(s) will not render.`);
  process.exit(1);
}
console.log(`${urls.length} profile image(s) verified`);
