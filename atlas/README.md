# atlas

The architecture diagrams on the [org profile](../profile/README.md), and the
generator that produces them.

Eleven views of the nanohype stack. Each answers one question and drops
everything irrelevant to it, which is why the same component appears on several
pages carrying different detail — no single diagram of this system is both
complete and readable.

## The rule this is built on

**Arrows are expensive; position is free.**

Ownership is expressed by containment: a zone *is* a reconciler, or an account,
or a namespace, and what sits inside it is what that thing owns. An arrow is
spent only on a relationship containment cannot show. The control-plane page
went from twenty-seven arrows to four that way, and the cluster-addons page from
eighteen to four — the wave number is printed on every box, so redrawing the
ordering as arrows restated what the labels already said and buried the
dependencies that are actually load-bearing.

## Layout

```
src/model.ts          the diagram vocabulary — no rendering, no coordinates
src/perspectives/     one file per page; this is the content
src/layout.ts         deterministic geometry, and the gutters between it
src/routing.ts        which side an arrow leaves from, and its orthogonal path
src/design.ts         palette and type scale
src/render.ts         the only module that knows about Excalidraw
```

The split is what makes a page reviewable: a wrong arrow is a wrong line in a
data file, not a wrong number in a canvas.

## Working on it

```bash
pnpm install
pnpm dev            # browse all eleven, with a clean/sketch toggle
pnpm check          # every edge resolves to a real node, on every page
pnpm emit           # write profile/assets/atlas/*.svg
```

`pnpm emit` also writes a `.excalidraw` scene per page into `out/`. Those are
gitignored on purpose — the perspective data is the source of truth, and
committing a second editable copy of the same diagram invites the two to
diverge. Use them to fork a page or hand one to someone who does not want to
run this project; do not treat them as the original.

## Why the SVGs are committed

GitHub renders README markdown with scripts and iframes stripped, so no canvas
library can run there — an image is the only thing that embeds. The SVGs carry
their font faces inlined, which is what makes them render correctly on a machine
that has never heard of Excalifont. `scripts/emit.ts` fails if any SVG
references a font it does not carry, because that failure is otherwise silent:
the file looks right locally and renders at the wrong widths for everyone else.

## Notes for anyone extending this

Two things about Excalidraw's programmatic API cost real time to find, and
neither is visible from the types:

- **`elbowed: true` does not route anything.** The flag survives
  `convertToExcalidrawElements`, but the orthogonal router only runs inside the
  editor's own update path. A generated scene keeps whatever points it was
  given, and an exported SVG never goes near the editor — so the path is
  computed in `routing.ts` instead.
- **A centred text element treats `x` as its centre, and discards the `width`
  you pass**, because the converter always re-measures the string. Positioning
  a caption at its box's left edge puts it half its own width too far left.
