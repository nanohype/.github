# Governance

nanohype is a single-maintainer organization. This document says so plainly
instead of describing committees that don't exist.

## Roles

### Maintainer

[@stxkxs](https://github.com/stxkxs) is the maintainer and final
decision-maker for every repository in the organization: what merges, what
releases, what enters or leaves the catalog, and how disputes resolve. There
is no steering committee, no TSC, no voting process — decisions are made in
the open (issues, PRs, commit messages) and the reasoning ships with them.

### Contributors

Anyone who opens an issue, files a PR, or reports a vulnerability. No
membership step, no CLA, no DCO — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## How decisions are made

The acceptance bar is the production bar the factory itself is held to —
tests, observability, security, reliability, cost, docs, CI, code shape, and
version currency, with the platform-wide contracts (language toolchains,
platform-tenant shape, LLM policy) published in the
[Platform Reference](https://github.com/nanohype/nanohype/blob/main/docs/platform-reference.md).
A contribution that meets the bar and fits the repo's declared architecture
gets merged; one that doesn't gets specific, evidence-backed feedback about
which dimension it misses.

Larger directional questions (new repos, catalog scope, platform boundaries)
are the maintainer's call, argued in public in the relevant issue or design
doc.

## Becoming a maintainer

The path is sustained, high-quality contribution: a track record of PRs that
clear the production bar without hand-holding, reviews that catch real
problems, and judgment consistent with the org's design principles. When that
track record exists, the maintainer may extend commit rights or maintainership
on a per-repo basis, at their discretion. There is no formal quota or
election — the org will grow governance structure when there are enough
people to need it, not before.

## Changes to this document

Governance changes land like any other change: a PR against this file,
decided by the maintainer.
