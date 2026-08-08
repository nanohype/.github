# merge-gate

The single required status check for a workflow.

## Why one gate instead of naming the real jobs

Branch protection needs check names that are stable and that actually gate. Naming the
jobs directly gives neither.

**Names are not stable.** Matrix legs are named after their inputs, so `landing-zone`
publishes ~120 contexts like `Validate (components/aws/tenant-substrate)` and
`Plan (aws/staging/druid)`. Delete a component and any required context naming it never
reports again — and a required context that never reports leaves every pull request
**Pending forever**. The change that wedges the repo looks entirely unrelated to CI.

**Naming jobs cannot keep up.** A job added to a workflow is not automatically required.
The list in branch protection is a hand-maintained copy of the CI graph, kept in a second
place, and it drifts silently in the direction of less coverage.

One gate per workflow fixes both: the required list becomes one stable name, and coverage
is checked by the gate rather than by whoever edited branch protection last.

## Usage

```yaml
  merge-gate:
    name: merge gate
    runs-on: ubuntu-latest
    needs: [lint, test, build]     # every other job in this workflow
    if: always()                   # see below — this is load-bearing
    steps:
      - uses: nanohype/.github/actions/merge-gate@<sha>
        with:
          needs: ${{ toJSON(needs) }}
```

`if: always()` is not optional. Without it, a failed dependency **skips** this job, and
GitHub counts a skipped check as passing for branch protection — the gate would report
green precisely when something broke. GitHub's docs: *"A job that is skipped will report
its status as 'Success'. It will not prevent a pull request from merging, even if it is a
required check."*

The job id must be `merge-gate`, or pass `gate-job-id` to match.

## What it refuses to pass on

| condition | why it matters |
| --- | --- |
| any dependency not `success` | `skipped`, `cancelled` and `neutral` all count as green to GitHub. Here they do not: a job that did not run has not passed. |
| `needs:` is empty | A refactor could otherwise leave a gate that passes by observing nothing. |
| a job in the workflow is not in `needs:` | An unwatched job cannot block a merge. Since this is the only required check, an unwatched job is an ungated one. |
| the workflow file cannot be read | Coverage is unverifiable, so the gate does not get to claim it. |
| the workflow parses to zero jobs | Never pass on an empty read. |

The third row is the one that keeps this honest over time: `needs:` is hand-written, so a
new job added without updating it would sit outside the gate — the same defect the gate
exists to prevent, one level up. The gate reads its own workflow file back and compares.

## Repos with more than one PR workflow

A job can only depend on jobs in its own workflow, so a repo with two PR-triggered
workflows gets two gates and two required names. That is fine — both are stable. Do not
merge workflows together to get to a single name; reshaping CI to suit a branch-protection
detail is the wrong way round.

## Tests

`test_gate.py` exercises every row above plus malformed input, asserting both a non-zero
exit and that the message names the actual reason — a gate that fails for the wrong reason
is barely better than one that does not fail. It serves the workflow over a local HTTP
server so the real fetch path runs; `GITHUB_API_URL` is the knob GitHub Enterprise Server
already uses, not a test-only seam.

```bash
python3 actions/merge-gate/test_gate.py
```

CI runs it on every PR and push to main.
