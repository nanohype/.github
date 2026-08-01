/**
 * Screenshot an exported SVG.
 *
 * The earlier blindness was specific: Excalidraw's *canvas* draws with a font
 * headless Chromium does not have, so it dropped edge glyphs and made correct
 * output look broken. The exported SVG carries its font faces inlined as
 * base64, so rendering the SVG uses the embedded face and is faithful — which
 * makes this, not the canvas, the thing to look at.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const [svgPath, outPath] = process.argv.slice(2);
const svg = await readFile(svgPath, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 1300 }, deviceScaleFactor: 2 });
await page.setContent(
  `<!doctype html><body style="margin:0;background:#fff">${svg}</body>`,
  { waitUntil: "networkidle" },
);
await page.waitForTimeout(900);
const el = await page.$("svg");
if (!el) throw new Error("no svg rendered");
await el.screenshot({ path: outPath });
console.log(`${outPath} <- ${svgPath}`);
await browser.close();
