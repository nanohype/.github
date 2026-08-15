/**
 * Inlined faces for standalone SVGs. GitHub renders README images with no
 * network and no page stylesheet, so a family that is only named will fall
 * back and every label will sit at the wrong width.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../fonts");

function face(family: string, file: string, weight: number, style = "normal"): string {
  const b64 = readFileSync(join(dir, file)).toString("base64");
  return [
    "@font-face{",
    `font-family:'${family}';`,
    `font-style:${style};`,
    `font-weight:${weight};`,
    "font-display:block;",
    `src:url(data:font/woff2;base64,${b64}) format('woff2');`,
    "}",
  ].join("");
}

export function fontFaceCss(): string {
  return [
    face("Instrument Serif", "instrument-serif-400.woff2", 400),
    face("Instrument Serif", "instrument-serif-400-italic.woff2", 400, "italic"),
    face("Geist", "geist-400.woff2", 400),
    face("Geist", "geist-600.woff2", 600),
    face("Geist Mono", "geist-mono-400.woff2", 400),
    face("Geist Mono", "geist-mono-500.woff2", 500),
  ].join("");
}
