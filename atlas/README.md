# atlas

The architecture diagrams on the [org profile](../profile/README.md), and the
generator that produces them.

Eleven views of the nanohype stack. Each answers one question and drops
everything irrelevant to it, which is why the same component appears on several
pages carrying different detail — no single diagram of this system is both
complete and readable.

The figures are editorial SVG: 1px hairlines, rounded orthogonal connectors,
Geist + Instrument Serif, one brand accent. They follow
[diagram-design](https://github.com/cathrynlavery/diagram-design). Layer colour
is the atlas legend, not a second accent — the same role is the same hue on
every page. The skin lives in [`style-guide.md`](style-guide.md).

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
src/scene.ts          the composer — the only caller of layout and the router
src/design.ts         palette and type scale
src/editorial.ts      the only module that writes SVG
```

The split is what makes a page reviewable: a wrong arrow is a wrong line in a
data file, not a wrong number in a canvas.

A route is a function of the obstacle set, not of the nodes, so a caller free to
pick its own obstacles is a caller free to draw a different diagram from the
same model. `compose()` is the only thing that lays out, routes or anchors a
label; every surface reads the Scene it returns.

## Working on it

```bash
pnpm install
pnpm dev            # browse all eleven
pnpm check          # every edge resolves to a real node, on every page
pnpm fallbacks      # A* found a route for every edge, on every page
pnpm emit           # write profile/assets/atlas/*.svg
```

## Why the SVGs are committed

GitHub renders README markdown with scripts and iframes stripped, so no canvas
library can run there — an image is the only thing that embeds. The SVGs carry
their font faces inlined, which is what makes them render correctly on a machine
that has never heard of Geist. `scripts/emit.ts` fails if any SVG references a
font it does not carry, because that failure is otherwise silent: the file looks
right locally and renders at the wrong widths for everyone else.
