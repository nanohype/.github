import { useMemo, useState } from "react";
import { renderEditorialSvg } from "./editorial.ts";
import { PERSPECTIVES } from "./perspectives/index.ts";

function save(name: string, data: string) {
  const blob = new Blob([data], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [active, setActive] = useState(0);

  const svgs = useMemo(() => PERSPECTIVES.map((p) => renderEditorialSvg(p)), []);

  if (import.meta.env.DEV) {
    (window as unknown as { __atlas?: unknown }).__atlas = { svgs, perspectives: PERSPECTIVES };
  }

  const perspective = PERSPECTIVES[active];
  const svg = svgs[active] ?? "";

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
            className="atlas-export"
            onClick={() => {
              if (!perspective) return;
              save(`${String(active).padStart(2, "0")}-${perspective.id}-light.svg`, svg);
            }}
          >
            export
          </button>
        </div>
      </header>
      <div className="atlas-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
