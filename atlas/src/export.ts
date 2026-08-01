/**
 * Export.
 *
 * Two artifacts per perspective, and the split matters:
 *
 * - **SVG** is what actually publishes. GitHub renders README markdown with
 *   scripts and iframes stripped, so no canvas library can run there — an image
 *   is the only thing that embeds. Excalidraw's SVG is plain SVG, so nothing
 *   but geometry travels with it.
 * - **`.excalidraw`** is what keeps the diagram editable by a human. It opens
 *   at excalidraw.com, so a correction never requires touching this codebase.
 *
 * Light and dark are both emitted because a README is read in both themes and a
 * single-theme diagram is unreadable in the other.
 */
import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Perspective } from "./model.ts";

type Scene = readonly ExcalidrawElement[];

function save(name: string, data: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** The `.excalidraw` document format — what excalidraw.com opens. */
function sceneFile(elements: Scene) {
  return JSON.stringify(
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
  );
}

export async function downloadScenes(perspectives: Perspective[], scenes: Scene[]) {
  for (const [index, perspective] of perspectives.entries()) {
    const elements = scenes[index];
    if (!elements || elements.length === 0) continue;
    const stem = `${String(index + 1).padStart(2, "0")}-${perspective.id}`;

    save(`${stem}.excalidraw`, sceneFile(elements), "application/json");

    for (const theme of ["light", "dark"] as const) {
      const svg = await exportToSvg({
        elements,
        files: null,
        exportPadding: 40,
        appState: {
          exportBackground: true,
          exportWithDarkMode: theme === "dark",
          viewBackgroundColor: theme === "dark" ? "#121212" : "#ffffff",
        },
      });
      save(`${stem}-${theme}.svg`, svg.outerHTML, "image/svg+xml");
    }
  }
}
