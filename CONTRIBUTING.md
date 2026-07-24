# Contributing

These are the org-wide ground rules for contributing to any nanohype
repository. Some repos carry their own `CONTRIBUTING.md` with domain-specific
contracts (template authoring in
[`nanohype`](https://github.com/nanohype/nanohype/blob/main/CONTRIBUTING.md),
factory constraints in
[`fab`](https://github.com/nanohype/fab/blob/main/CONTRIBUTING.md)) — those
build on this document, they don't replace it.

## The local law: CLAUDE.md and AGENTS.md

Every repo declares its own rules:

- **`CLAUDE.md`** — the repo's working instructions: architecture map,
  conventions, commands, style. If it conflicts with your habits, it wins.
- **`AGENTS.md`** — the agent-facing entry point. AI clients and coding agents
  start there.

Read both before writing code. A PR that fights the repo's declared
conventions gets asked to conform, however good the code is.

## The four-phase contract

Every code repo in the org exposes **build, lint, test, docs** as distinct
executable phases, and all four exit 0 from a clean checkout. That's the
definition of "works" here:

```sh
git clone <repo> && cd <repo>
<install>   # npm ci, go mod download, ...
<build>     # compiles / renders
<lint>      # static analysis + typecheck
<test>      # the suite, including any coverage floors
<docs>      # docs build / doc lint
```

The exact commands per repo are in its `CLAUDE.md` (and dispatched per
language by the factory's toolchain map). CI runs the phases as separate
required jobs — if a phase fails locally, it will fail in CI, so run them
before pushing.

## Style

- Formatting is enforced, not discussed. TypeScript repos share one prettier
  identity — `semi: true`, `singleQuote: true`, `printWidth: 100`, trailing
  commas, 2-space indent — checked in CI via `format:check`.
- Indentation: 2 spaces for YAML, JSON, TS, Markdown; 4 for Python; tabs for
  Go and Makefiles. LF line endings, no trailing whitespace.
- Voice in docs: chill, technical, plain English. Describe the design state —
  what the system is, not what it grew out of.

## Dependencies

Use current, maintained versions. Resolve versions from the registry when you
add a dependency — don't hand-write pins from memory. A pin that holds a
dependency ≥1 major version back needs an adjacent written reason.

## PR flow

1. **Branch** from `main`, open the PR as a **draft** early if you want eyes
   on direction.
2. **Get checks green.** Every CI job is required; none is advisory. That
   includes the security scanners — findings fail the build (see
   [SECURITY.md](SECURITY.md)).
3. **Mark ready for review.** Review focuses on correctness, fit with the
   repo's declared architecture, and the production bar (see
   [GOVERNANCE.md](GOVERNANCE.md)).
4. **Squash-merge.** The squash commit message is the permanent record of the
   change — write it as structured documentation: what the change contains,
   why, and the decisions inside it. The PR description gets you reviewed; the
   commit message is what history keeps.

No CLA, no DCO sign-off — submitting a PR means you have the right to
contribute the code under the repo's license.

## Reporting

- **Bugs and ideas** — open an issue on the affected repo.
- **Security** — never a public issue; see [SECURITY.md](SECURITY.md).
- **Conduct** — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Issues and labels

Issues here are not a backlog. Open one for a bug, an idea, or work that crosses
repos or is blocked on something not yet in place — the kind that outlives a
single session. Day-to-day planning lives in each contributor's `.plans/`
(gitignored org-wide), not in the tracker. Two templates carry this: **Bug** and
**Tracking / blocked work**.

Labels come in two layers. The **baseline** — kind (`bug`, `enhancement`,
`documentation`, `chore`), `security`, the `blocked` family (`blocked`,
`blocked:substrate`, `blocked:upstream`), and `priority:{high,medium,low}` — is
identical in every repo, defined once in
[`labels.yml`](https://github.com/nanohype/.github/blob/main/labels.yml) and
applied by a sync workflow. On top of it, a repo may add a few **domain** labels,
always namespaced `key:value` (e.g. `provider:aws`, `cmd:iam`, `lang:go`); keep
that layer small and never redefine a baseline label.
