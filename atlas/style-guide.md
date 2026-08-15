# nanohype atlas — editorial skin

Onboarded from [nanohype.dev](https://nanohype.dev) (`docs/tokens.json`) and the
diagram-design skill. The site is dark-first; these diagrams sit on a GitHub
README, so paper is the inverted ground, not void.

## Brand fidelity receipt

| Source | Value | Confidence |
|---|---|---|
| sampled | `https://nanohype.dev` + `nanohype.dev/docs/tokens.json` | high |
| site paper (dark) | `#0c1226` void | high |
| README paper | `#f4f2ee` warm invert of void (pure white rejected) | high |
| ink | `#0c1226` (site ground, used as ink on light paper) | high |
| muted | `#4f5d75` (AA on paper; site `#94a3b8` fails at 8–12px) | high |
| accent | `#3b82f6` `--primary` / beam | high |
| paper-2 | `#eceae4` | high |
| link | `#2563eb` | high |
| title font | Instrument Serif 400 — **fallback** (site H1 is Inter; skill keeps the serif) | exact-to-skill |
| node-name font | Geist 600 — **fallback** (site body is Inter) | exact-to-skill |
| sublabel font | Geist Mono 400 — **fallback** (site mono is JetBrains Mono; skill forbids it) | exact-to-skill |

Layer hues (`#f59e0b` AWS, `#3b82f6` k8s, `#8b5cf6` platform, `#06b6d4` tenant,
`#ef4444` security, `#10b981` telemetry, `#94a3b8` git, `#5457d6` model) are
**not** a second accent system. They are the atlas's eleven-page legend: the
same role is the same colour on every page. Focal nodes still use the single
brand accent.

## Tokens

| Role | Light | Dark (unused) |
|---|---|---|
| `paper` | `#f4f2ee` | `#0c1226` |
| `paper-2` | `#eceae4` | `#111830` |
| `ink` | `#0c1226` | `#f4f2ee` |
| `muted` | `#4f5d75` | `#94a3b8` |
| `soft` | `#7a8399` | `#8e98ac` |
| `rule` | `rgba(12,18,38,0.12)` | `rgba(244,242,238,0.12)` |
| `accent` | `#3b82f6` | `#60a5fa` |
| `accent-tint` | `rgba(59,130,246,0.08)` | `rgba(96,165,250,0.10)` |
| `link` | `#2563eb` | `#60a5fa` |
