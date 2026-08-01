import { Excalidraw, convertToExcalidrawElements, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadScenes } from "./export.ts";
import type { Theme } from "./model.ts";
import { PERSPECTIVES } from "./perspectives/index.ts";
import { renderPerspective } from "./render.ts";
import { useFontEpoch } from "./useFonts.ts";

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useState<Theme>("clean");
  const [busy, setBusy] = useState(false);

  // Every element is sized by measuring its text, so nothing may be built
  // until the fonts that text will be drawn in are actually resolved.
  // Sampling with the glyphs actually drawn is what forces every unicode-range
  // subset of each family to load; a generic sample leaves most of them out.
  const sampleText = useMemo(
    () =>
      PERSPECTIVES.flatMap((p) => [
        p.name,
        p.blurb,
        ...p.lanes.flat().flatMap((z) => [z.title, z.note ?? "", ...z.nodes.flatMap((n) => [n.label, n.sub ?? ""])]),
        ...p.edges.map((e) => e.label ?? ""),
        ...(p.callouts ?? []).flatMap((c) => [c.title, c.body]),
      ]).join(""),
    [],
  );
  const fontEpoch = useFontEpoch(sampleText);

  // Excalidraw holds one scene at a time, so a perspective switch is a scene
  // swap. Rendering is pure, and memoising per register keeps element ids
  // stable across switches — otherwise every tab click regenerates ids and
  // discards any hand-edit made on the canvas.
  const scenes = useMemo(
    // fontEpoch is a rebuild trigger, not a value: the first pass may be
    // measured against fallback metrics, and bumping the epoch re-runs it once
    // the real faces are usable. See useFonts.ts for why it cannot be a gate.
    () => PERSPECTIVES.map((p) =>
        // regenerateIds defaults to true, which throws away the ids the
        // renderer assigns and replaces them with random ones. That leaks
        // straight into the exported SVG's mask ids and into any fingerprint
        // taken of the scene, so nothing downstream can be reproducible.
        convertToExcalidrawElements(renderPerspective(p, theme), { regenerateIds: false }),
      ),
    [theme, fontEpoch],
  );

  const show = useCallback(
    (index: number) => {
      if (!api) return;
      const elements = scenes[index];
      if (!elements) return;
      api.updateScene({ elements });
      api.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.9 });
    },
    [api, scenes],
  );

  useEffect(() => {
    show(active);
  }, [show, active]);

  // Built scenes, reachable from the screenshot/probe harness. Bare module
  // specifiers do not resolve inside a page evaluate, so the geometry has to be
  // handed out from inside the app rather than re-derived from outside it.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __atlas?: unknown }).__atlas = { scenes, perspectives: PERSPECTIVES, exportToSvg };
    }
  }, [scenes]);

  const onExport = async () => {
    setBusy(true);
    try {
      await downloadScenes(PERSPECTIVES, scenes);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="atlas">
      <header className="atlas-bar">
        <div className="atlas-brand">
          nanohype <span>atlas</span>
        </div>
        <nav className="atlas-tabs">
          {PERSPECTIVES.map((p, index) => (
            <button
              key={p.id}
              type="button"
              className={index === active ? "is-active" : ""}
              onClick={() => setActive(index)}
              title={p.blurb}
            >
              {p.name}
            </button>
          ))}
        </nav>
        <div className="atlas-actions">
          <button
            type="button"
            className="atlas-toggle"
            onClick={() => setTheme(theme === "clean" ? "sketch" : "clean")}
            title="Switch visual register"
          >
            {theme}
          </button>
          <button type="button" className="atlas-export" onClick={onExport} disabled={busy}>
            {busy ? "exporting…" : "export"}
          </button>
        </div>
      </header>
      <div className="atlas-canvas">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={{ appState: { viewBackgroundColor: "#ffffff" } }}
        />
      </div>
    </div>
  );
}
