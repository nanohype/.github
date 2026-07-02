# Roadmap

Direction, not promises — a single-maintainer org ships when things are ready.
Everything here extends work that already exists in the repos; nothing on this
list is a new product line.

## Platform maturation

Deepen the vending layers that already run: `eks-fleet` manufactures clusters
from a `Cluster` resource the way `eks-agent-platform` vends tenants — the
work is tightening that seam end to end, including moving per-tenant Bedrock
model scoping fully into the Platform reconcile (the `AllowedModelFamilies`
field) so model access is a spec change, not an infrastructure PR.

## Catalog growth

The template catalog grows along its declared conventions: more composites,
and module-family expansion across language runtimes — the `-ts` module family
gains `-go` / `-java` / `-py` siblings following the naming convention already
documented in the catalog.

## One runtime foundation

`@nanohype/runtime` (in `nanohype/library/runtime`) is the single source of
truth for the fleet's shared primitives — circuit breaker, retry/timeout,
provider registry, PII redaction. The direction is full adoption: every
consumer carries CI-enforced byte-identical vendored copies, the same
mechanism that already guards the vendored chart library.

## Evals as a gate

Eval tooling threads through every layer today — `eval-harness` and `ci-eval`
templates, the platform's eval reconciler and Argo eval pipeline, fab's
cold-context external-reviewer calibration. The direction is making eval
results a first-class release gate wherever an agent ships, not a report you
can ignore.
