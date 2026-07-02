# Security Policy

## Supported versions

Every repository in this organization ships from `main` on a rolling basis —
the latest release (or the tip of `main`, for repos without tagged releases) is
the supported version. Fixes land forward; there are no maintained backport
branches.

## Reporting a vulnerability

Please report security vulnerabilities **privately** — don't open a public
issue, pull request, or discussion for them.

Use GitHub's **private vulnerability reporting**: open the **Security** tab of
the affected repository and click **Report a vulnerability**. That starts a
private advisory thread visible only to the maintainers and you. It's enabled on
every public repository in this organization.

Helpful things to include:

- the repository and the affected version or commit,
- what the issue is and its impact,
- steps to reproduce — a proof of concept if you have one,
- any suggested fix.

## What to expect

This is a single-maintainer organization, so timelines are honest rather than
enterprise-shaped:

- **Acknowledgment within ~7 days.** Usually faster, but a week is the
  commitment.
- **Coordinated disclosure.** We'll work with you in the advisory thread on a
  fix and a disclosure timeline before anything goes public. Please hold
  public disclosure until a fix ships or we agree on a date — if you haven't
  heard back after 90 days, disclosing is fair game.
- **Credit.** You're credited in the published advisory when the fix ships,
  unless you'd rather stay anonymous.

## How the code is scanned

Security scanning here is a **hard CI gate, not an advisory report**: scanners
run as required jobs and a finding fails the build. Depending on the repo that
includes dependency audits (`npm audit`, govulncheck), IaC and config scanning
(checkov, trivy, kubeconform), and secret scanning (gitleaks). Suppressions
live in committed, documented ignore files (`.checkov.yaml`,
`.trivyignore.yaml`) so every accepted finding has a written reason — there is
no soft-fail mode. A report that survives those gates is exactly the kind we
want to hear about.

## Scope

This policy covers the source in this organization's repositories. A report
against a specific *deployed* instance you don't operate should go to whoever
runs it.
