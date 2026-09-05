# .github

Organization-level GitHub configuration for nanohype.

- `profile/README.md` — rendered at [github.com/nanohype](https://github.com/nanohype)
- `profile/ROADMAP.md` — where the org is heading
- `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `SECURITY.md` —
  org-wide community health files. GitHub applies them to every nanohype repo
  that doesn't carry its own; repos with genuinely repo-specific contracts
  (e.g. `nanohype`, `fab`) override `CONTRIBUTING.md` locally.
- `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md` — the default
  issue and PR templates. GitHub inherits these into every repo that doesn't
  carry its own.
- `actions/` — composite actions consumed by SHA pin across the org.
  [`merge-gate`](actions/merge-gate/README.md) is the single required status check
  for a workflow; [`editorconfig-gate`](actions/editorconfig-gate/README.md) checks a
  tree against the rules `.editorconfig` declares that no formatter owns.
- `default.json` — the shared Renovate posture. Consume it with a one-line
  `renovate.json`: `{"extends": ["github>nanohype/.github"]}`.
- `labels.yml` — the org-wide baseline issue-label taxonomy (the source of
  truth). Labels are per-repo on GitHub, so unlike the templates they don't
  inherit; `.github/workflows/sync-labels.yml` applies this file to every repo
  on demand. Repos add a thin, namespaced (`key:value`) domain layer on top.
