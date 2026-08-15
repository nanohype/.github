/**
 * Screenshot every perspective, headlessly.
 *
 * A generated diagram is only as good as the last time someone looked at it,
 * and "looks right" is not a property any typecheck or model check can assert.
 * This closes that loop locally: change the layout, re-shoot, look.
 *
 * Usage: node scripts/shoot.ts [outDir] [--url=http://127.0.0.1:5273]
 */
import { mkdir, rm } from "node:fs/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith("--")) ?? "shots";
const url = (args.find((a) => a.startsWith("--url=")) ?? "--url=http://127.0.0.1:5273").slice(6);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 2200, height: 1400 },
  deviceScaleFactor: 2,
});

const failures: string[] = [];
page.on("pageerror", (err) => failures.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") failures.push(`console.error: ${msg.text()}`);
  // The layout warnings from build.ts are the ones worth surfacing here — they
  // mean a box grew past the geometry the layout module computed.
  if (msg.type() === "warning" && msg.text().includes("[atlas]")) {
    failures.push(`layout: ${msg.text()}`);
  }
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(".atlas-canvas svg", { timeout: 30_000 });

const tabs = await page.locator(".atlas-tabs button").all();
if (tabs.length === 0) throw new Error("no perspective tabs rendered — the app did not mount");

console.log(`shooting ${tabs.length} perspectives → ${outDir}/`);

for (const [i, tab] of tabs.entries()) {
  const name = ((await tab.textContent()) ?? `page-${i}`)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();

  await tab.click();
  // zoomToFit animates for 160ms; give it that plus a frame to settle.
  await page.waitForTimeout(600);

  const file = `${outDir}/${String(i).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(`  ${file}`);
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s) in the page:`);
  for (const f of [...new Set(failures)]) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\nno page errors");
