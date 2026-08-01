import { useEffect, useState } from "react";

/**
 * Tracks when Excalidraw's webfonts are usable *for measurement*, as an epoch
 * that callers rebuild against.
 *
 * Every element is sized by measuring its text. Measure before the real face
 * resolves and the fallback's metrics get written into the scene; the canvas
 * then paints the true font and clips each label to the too-small box it was
 * given. The wrong number is stored, so repainting never repairs it.
 *
 * Three things had to be understood to get here, each of which failed alone:
 *
 * 1. `document.fonts.ready` is meaningless at startup — it resolves when
 *    nothing is *pending*, and Excalidraw requests faces lazily, so at mount
 *    there is nothing pending.
 *
 * 2. `document.fonts.load(font)` samples a single space by default, and
 *    Excalidraw ships each family as several `unicode-range` subsets. That
 *    loads whichever subset covers U+0020 and leaves the rest unloaded.
 *
 * 3. Gating scene construction on the fonts **deadlocks**: Excalidraw only
 *    requests a family once a scene using it is mounted.
 *
 * And one more that only showed up in a real browser: `document.fonts.check`
 * can report a family usable slightly before text measured against it settles,
 * so an epoch keyed on `check` still rebuilt against fallback metrics and the
 * canvas still clipped every label. The signal here is therefore the
 * measurement itself — a probe string's width is sampled until it stops
 * moving. That is exactly the quantity the scene depends on, which makes it
 * the honest thing to wait for.
 */
const FAMILIES = ["Excalifont", "Nunito"] as const;
const PROBE = "MODEL_ROUTE_BASE_URL agents.platform 0123456789";
const POLL_MS = 100;
const STABLE_SAMPLES = 3;
const TIMEOUT_MS = 10_000;

function measure(family: string): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `16px ${family}`;
  return ctx.measureText(PROBE).width;
}

export function useFontEpoch(sampleText: string): number {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let live = true;
    let elapsed = 0;
    let stable = 0;
    let last = FAMILIES.map(measure).join("|");

    // A subset is fetched if any character it covers is requested, so the
    // de-duplicated glyph set is enough and keeps the request small.
    const sample = [...new Set(sampleText)].join("");
    for (const family of FAMILIES) {
      void document.fonts.load(`16px ${family}`, sample).catch(() => {});
      void document.fonts.load(`36px ${family}`, sample).catch(() => {});
    }

    const timer = setInterval(() => {
      elapsed += POLL_MS;
      const now = FAMILIES.map(measure).join("|");

      if (now === last) {
        stable += 1;
      } else {
        stable = 0;
        last = now;
      }

      if (stable >= STABLE_SAMPLES || elapsed >= TIMEOUT_MS) {
        clearInterval(timer);
        // One bump, whether the metrics settled or we gave up waiting.
        // Bumping repeatedly would rebuild the scene under the user's cursor.
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
