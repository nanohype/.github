#!/usr/bin/env python3
"""Every way the gate must fail, exercised.

The gate is the only required status check on every repository in this org, so a
gate that cannot fail would silently unprotect all of them. Each case below
asserts a non-zero exit AND that the message names the reason, because a gate
that fails for the wrong reason is not much better than one that does not fail.

The workflow file is served over a local HTTP server rather than stubbed, so the
real fetch path runs — GITHUB_API_URL is the same knob GitHub Enterprise Server
uses, not a test-only seam.
"""

from __future__ import annotations

import http.server
import json
import subprocess
import sys
import threading
from pathlib import Path

HERE = Path(__file__).parent
GATE = HERE / "gate.py"

WORKFLOW = """\
name: ci

on:
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: true

  test:
    runs-on: ubuntu-latest
    steps:
      - run: true

  merge-gate:
    needs: [lint, test]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - run: true
"""

served = {"body": WORKFLOW, "status": 200}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        self.send_response(served["status"])
        self.end_headers()
        self.wfile.write(served["body"].encode())

    def log_message(self, *a):  # silence
        pass


def run(needs, *, gate_id="merge-gate", port, raw=None):
    env = {
        "NEEDS": raw if raw is not None else json.dumps(needs),
        "GATE_JOB_ID": gate_id,
        "WORKFLOW_REF": "nanohype/x/.github/workflows/ci.yml@refs/pull/1/merge",
        "REPO": "nanohype/x",
        "SHA": "deadbeef",
        "TOKEN": "t",
        "GITHUB_API_URL": f"http://127.0.0.1:{port}",
        "PATH": "/usr/bin:/bin",
    }
    p = subprocess.run([sys.executable, str(GATE)], env=env, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr)


OK = {"lint": {"result": "success"}, "test": {"result": "success"}}


def main() -> int:
    srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    cases = [
        # (label, expect_pass, needs, kwargs, substring the message must contain)
        ("all green, full coverage", True, OK, {}, "2 job(s) green"),
        ("a dependency failed", False, {**OK, "test": {"result": "failure"}}, {}, "test=failure"),
        ("a dependency was SKIPPED", False, {**OK, "test": {"result": "skipped"}}, {}, "test=skipped"),
        ("a dependency was cancelled", False, {**OK, "test": {"result": "cancelled"}}, {}, "test=cancelled"),
        ("empty needs", False, {}, {}, "depends on no jobs"),
        ("a job is unwatched", False, {"lint": {"result": "success"}}, {}, "outside this gate: test"),
        ("gate id not in workflow", False, OK, {"gate_id": "nope"}, "not in .github/workflows/ci.yml"),
    ]

    failures = 0
    for label, expect_pass, needs, kw, want in cases:
        code, out = run(needs, port=port, **kw)
        passed = code == 0
        ok = (passed == expect_pass) and (want in out)
        print(f"  {'ok  ' if ok else 'FAIL'}  {label:<32} exit={code}")
        if not ok:
            failures += 1
            print(f"        wanted {'pass' if expect_pass else 'fail'} containing {want!r}")
            print(f"        got: {out.strip()[:300]}")

    # malformed input
    code, out = run(None, port=port, raw="{not json")
    ok = code != 0 and "not JSON" in out
    print(f"  {'ok  ' if ok else 'FAIL'}  {'needs is not JSON':<32} exit={code}")
    failures += 0 if ok else 1

    # the workflow cannot be read -> must fail, never pass
    served["status"] = 404
    code, out = run(OK, port=port)
    ok = code != 0 and "could not read" in out
    print(f"  {'ok  ' if ok else 'FAIL'}  {'workflow unreadable':<32} exit={code}")
    failures += 0 if ok else 1

    # a workflow with no jobs: key -> must fail, never pass on an empty read
    served["status"], served["body"] = 200, "name: ci\non:\n  pull_request:\n"
    code, out = run(OK, port=port)
    ok = code != 0 and "no top-level `jobs:`" in out
    print(f"  {'ok  ' if ok else 'FAIL'}  {'workflow has no jobs':<32} exit={code}")
    failures += 0 if ok else 1

    print(f"\n{'FAILED' if failures else 'all cases pass'} ({failures} failing)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
