#!/usr/bin/env python3
"""The single required status check for a workflow.

Branch protection needs a name that is stable and that actually gates. Naming
the real jobs gives neither: matrix legs are named after their inputs, so
landing-zone's ~120 `Validate (components/aws/...)` contexts change whenever a
component is added or deleted, and a required context that never reports leaves
every pull request Pending forever.

So one job per workflow depends on all the others and is the only required name.
That only works if it fails closed, in three separate ways:

1. A dependency that is not `success`. GitHub counts `success`, `skipped` and
   `neutral` as passing for a required check, so a job skipped because its own
   dependency failed reports green. This gate treats anything other than
   `success` as a failure — a job that did not run has not passed.

2. No dependencies at all. A refactor that empties the `needs:` list would
   otherwise leave a gate that passes by observing nothing.

3. A job the gate does not watch. `needs:` is hand-written, so a new job added
   to the workflow without being added to the list would be silently outside
   the gate — the same defect the gate exists to prevent, one level up. The
   gate reads its own workflow file and refuses to pass if any job in it is
   unwatched.

Check 3 is why this reads the workflow rather than trusting its inputs.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request


def fail(msg: str) -> None:
    print(f"::error::{msg}")
    sys.exit(1)


def workflow_path(ref: str) -> str:
    """`owner/repo/.github/workflows/ci.yml@refs/pull/1/merge` -> the path."""
    without_ref = ref.split("@", 1)[0]
    parts = without_ref.split("/", 2)
    if len(parts) != 3:
        fail(f"cannot read a workflow path out of github.workflow_ref: {ref!r}")
    return parts[2]


def fetch_workflow(repo: str, path: str, sha: str, token: str) -> str:
    # GITHUB_API_URL is set by the runner; honouring it rather than hardcoding
    # api.github.com is what makes this work on GitHub Enterprise Server.
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    url = f"{api}/repos/{repo}/contents/{path}?ref={sha}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.raw",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        fail(f"could not read {path}@{sha} to check gate coverage: HTTP {e.code}")
    except urllib.error.URLError as e:
        fail(f"could not read {path}@{sha} to check gate coverage: {e.reason}")
    raise AssertionError("unreachable")


def declared_jobs(source: str) -> list[str]:
    """Job ids under the top-level `jobs:` key.

    Deliberately a line scan rather than a YAML parse: this runs with no
    dependencies beyond the standard library, and the shape it needs — two-space
    keys under `jobs:` — is fixed by Actions' own schema. A parse failure here
    would have to fail the gate, and a false failure on every workflow is worse
    than reading the one structure that cannot vary.
    """
    lines = source.splitlines()
    try:
        start = next(i for i, ln in enumerate(lines) if re.match(r"^jobs:\s*(#.*)?$", ln))
    except StopIteration:
        fail("no top-level `jobs:` key in the workflow — cannot check gate coverage")
    jobs = []
    for ln in lines[start + 1 :]:
        if re.match(r"^\S", ln):  # dedented back to column 0: out of `jobs:`
            break
        m = re.match(r"^  ([A-Za-z_][A-Za-z0-9_-]*):\s*(#.*)?$", ln)
        if m:
            jobs.append(m.group(1))
    return jobs


def main() -> None:
    raw = os.environ.get("NEEDS", "").strip()
    if not raw:
        fail("the gate was given no `needs` — pass ${{ toJSON(needs) }}")
    try:
        needs = json.loads(raw)
    except json.JSONDecodeError as e:
        fail(f"`needs` is not JSON: {e}")

    # (2) a gate that watches nothing must not pass.
    if not needs:
        fail(
            "the gate depends on no jobs. An empty `needs:` list makes this check "
            "green by observing nothing, which is the failure it exists to prevent."
        )

    gate_id = os.environ["GATE_JOB_ID"]
    ref = os.environ["WORKFLOW_REF"]
    path = workflow_path(ref)
    source = fetch_workflow(
        os.environ["REPO"], path, os.environ["SHA"], os.environ["TOKEN"]
    )

    # (3) every job in the workflow is watched.
    declared = declared_jobs(source)
    if not declared:
        fail(f"read {path} and found no jobs — refusing to pass on an empty read")
    if gate_id not in declared:
        fail(
            f"the gate's job id {gate_id!r} is not in {path}. Set GATE_JOB_ID to this "
            f"job's id so it can exclude itself. Found: {', '.join(declared)}"
        )
    unwatched = [j for j in declared if j != gate_id and j not in needs]
    if unwatched:
        fail(
            f"{len(unwatched)} job(s) in {path} are outside this gate: "
            f"{', '.join(unwatched)}. Add them to the gate's `needs:` list — an "
            f"unwatched job cannot block a merge, and this is the only required check."
        )

    # (1) every dependency actually succeeded.
    not_green = {j: v.get("result") for j, v in needs.items() if v.get("result") != "success"}
    if not_green:
        detail = ", ".join(f"{j}={r}" for j, r in sorted(not_green.items()))
        fail(
            f"{len(not_green)} of {len(needs)} job(s) did not succeed: {detail}. "
            f"(`skipped` counts as a failure here: a job that did not run has not passed.)"
        )

    print(f"{len(needs)} job(s) green, and all {len(declared) - 1} job(s) in {path} are watched.")


if __name__ == "__main__":
    main()
