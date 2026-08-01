import { useEffect, useState } from "react";

/**
 * Tracks when Excalidraw's webfonts become usable, as a monotonically
 * increasing epoch that callers rebuild against.
 *
 * The problem this solves: `convertToExcalidrawElements` sizes every element by
 * measuring its text. Measure before the real face resolves and it measures a
 * fallback, stores those widths in the scene, and the canvas later paints the
 * true font at a different width — text then overflows its own element box and
 * is clipped mid-word. The wrong number is in the scene, so repainting never
 * repairs it.
 *
 * Three things had to be understood to get here, each of which failed on its
 * own:
 *
 * 1. `document.fonts.ready` is meaningless at startup. It resolves when nothing
 *    is *pending*, and Excalidraw requests faces lazily — so at mount there is
 *    nothing pending and it resolves instantly.
 *
 * 2. `document.fonts.load(font)` samples a single space by default, and
 *    Excalidraw ships each family as several `unicode-range` subsets. That
 *    loads whichever subset covers U+0020 and leaves the rest `unloaded`.
 *    The sample text has to contain the glyphs actually being drawn.
 *
 * 3. Gating scene construction on the fonts **deadlocks**. Excalidraw only
 *    requests a family once a scene containing it is mounted, so an empty
 *    scene means the fonts are never fetched and the gate never opens.
 *
 * Hence an epoch rather than a boolean: the first build goes ahead with
 * whatever metrics are available, which is what triggers the font load, and
 * the epoch bump then forces exactly one correctly-measured rebuild.
 */
const FAMILIES = ["Excalifont", "Nunito"] as const;
const POLL_MS = 120;
const TIMEOUT_MS = 8000;

export function useFontEpoch(sampleText: string): number {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let live = true;
    let elapsed = 0;

    // A subset is fetched if any character it covers is requested, so the
    // de-duplicated glyph set is enough and keeps the sample small.
    const sample = [...new Set(sampleText)].join("");

    // Ask for the faces; this is what makes them pending so `check` can ever
    // come back true. Failures are ignored — a missing font is a degraded
    // diagram, not a reason to stall.
    for (const family of FAMILIES) {
      void document.fonts.load(`16px ${family}`, sample).catch(() => {});
      void document.fonts.load(`36px ${family}`, sample).catch(() => {});
    }

    const timer = setInterval(() => {
      elapsed += POLL_MS;
      const usable = FAMILIES.every((family) => {
        try {
          return document.fonts.check(`16px ${family}`, sample);
        } catch {
          return true;
        }
      });

      if (usable || elapsed >= TIMEOUT_MS) {
        clearInterval(timer);
        // One bump, whether the fonts arrived or we gave up waiting. Bumping
        // repeatedly would rebuild the scene under the user's cursor.
        if (live) setEpoch((n) => n + 1);
      }
    }, POLL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [sampleText]);

  return epoch;
}
