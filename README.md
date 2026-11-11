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

## Versioning

The actions under `actions/` are released together by tag. Consumers pin the
commit and name the major tag beside it, so Renovate can track it:

```yaml
- uses: nanohype/.github/actions/merge-gate@<sha> # v1
```

Each release gets an immutable tag (`v1.0.0`, `v1.1.0`, …), and the floating
major tag `v1` moves forward to it on every compatible release. A breaking
change to either action's inputs or behaviour goes out as `v2`, never under
`v1`.
