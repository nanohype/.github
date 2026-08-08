#!/usr/bin/env python3
"""The shared preset's age floor stays at or above the package managers'.

`renovate-config-validator` checks that the config is *shaped* correctly. It does
not check that it is *coherent with the tools that consume its output* — it
accepts `minimumReleaseAge: "3 bananas"` without complaint, because the schema
says "string" and stops there.

The invariant that matters is not in any schema. pnpm 11 defaults
`minimumReleaseAge` to 1440 minutes and re-verifies every entry of the lockfile
on each install, not only the entries being added. So if Renovate's floor sits
below pnpm's, Renovate will eventually author a lockfile that pnpm then refuses
to install — and the failure lands in whichever repository happens to run CI
next, on a pull request that changed nothing related.

Renovate's floor must therefore be >= pnpm's. That is what this asserts.

Run with --self-test to break the inputs and confirm each break is rejected. A
gate that has never been seen to fail is not known to be a gate.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

# pnpm 11's default `minimumReleaseAge`, in minutes. If pnpm's default moves, or
# a repo sets its own lower floor, this constant is the thing to revisit — the
# comparison below is only as honest as this number.
PNPM_FLOOR_MINUTES = 1440

# Renovate accepts duration strings such as "3 days" / "6 months" / "1 year".
UNITS = {
    "minute": 1,
    "hour": 60,
    "day": 1440,
    "week": 10080,
    "month": 43800,  # Renovate treats a month as ~30.4 days
    "year": 525600,
}

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Rejected(Exception):
    """A checked invariant does not hold."""


def parse_duration(text: object) -> int:
    """Duration string -> minutes. Raises Rejected on anything unparseable."""
    if not isinstance(text, str):
        raise Rejected(f"minimumReleaseAge must be a duration string, got {text!r}")
    m = re.fullmatch(r"\s*(\d+)\s+(minute|hour|day|week|month|year)s?\s*", text)
    if not m:
        raise Rejected(
            f"minimumReleaseAge {text!r} is not a duration Renovate parses. "
            f"Expected e.g. '3 days'. The config validator accepts this string "
            f"because the schema only says 'string', so nothing else catches it."
        )
    return int(m.group(1)) * UNITS[m.group(2)]


def check(cfg: dict) -> list[str]:
    """Returns the list of things checked. Raises Rejected on the first failure."""
    checked = []

    if "minimumReleaseAge" not in cfg:
        raise Rejected(
            "the preset sets no minimumReleaseAge. Renovate would then propose "
            "packages published minutes ago, and pnpm would refuse the lockfile "
            "they land in."
        )
    minutes = parse_duration(cfg["minimumReleaseAge"])
    checked.append(f"minimumReleaseAge {cfg['minimumReleaseAge']!r} parses to {minutes} minutes")

    if minutes < PNPM_FLOOR_MINUTES:
        raise Rejected(
            f"minimumReleaseAge is {minutes} minutes, below pnpm's "
            f"{PNPM_FLOOR_MINUTES}. Renovate would open PRs whose lockfiles pnpm "
            f"rejects, and the failure would surface in unrelated pull requests."
        )
    checked.append(f"{minutes} >= pnpm's floor of {PNPM_FLOOR_MINUTES} minutes")

    va = cfg.get("vulnerabilityAlerts")
    if not isinstance(va, dict):
        raise Rejected("vulnerabilityAlerts is missing, so the security path is unstated.")
    if "minimumReleaseAge" not in va:
        raise Rejected(
            "vulnerabilityAlerts does not state minimumReleaseAge. Renovate's own "
            "default is null, but leaving it implicit means raising the top-level "
            "floor would silently start delaying CVE fixes."
        )
    if va["minimumReleaseAge"] is not None:
        raise Rejected(
            f"vulnerabilityAlerts.minimumReleaseAge is {va['minimumReleaseAge']!r}, "
            f"not null. A security fix must not wait behind the routine floor."
        )
    checked.append("vulnerabilityAlerts.minimumReleaseAge is explicitly null")

    return checked


def self_test(cfg: dict) -> int:
    """Break the config every way the checks claim to catch. Each must be rejected."""
    def without(key):
        d = json.loads(json.dumps(cfg))
        d.pop(key, None)
        return d

    def with_top(value):
        d = json.loads(json.dumps(cfg))
        d["minimumReleaseAge"] = value
        return d

    def with_va(value, present=True):
        d = json.loads(json.dumps(cfg))
        if present:
            d["vulnerabilityAlerts"]["minimumReleaseAge"] = value
        else:
            d["vulnerabilityAlerts"].pop("minimumReleaseAge", None)
        return d

    breaks = [
        ("no floor at all", without("minimumReleaseAge")),
        ("floor below pnpm's", with_top("6 hours")),
        ("floor exactly one minute short", with_top("1439 minutes")),
        ("unparseable duration", with_top("3 bananas")),
        ("numeric instead of duration string", with_top(4320)),
        ("null floor", with_top(None)),
        ("security path delayed", with_va("3 days")),
        ("security path left implicit", with_va(None, present=False)),
        ("vulnerabilityAlerts removed", without("vulnerabilityAlerts")),
    ]

    failures = []
    for label, broken in breaks:
        try:
            check(broken)
        except Rejected:
            print(f"  rejected  {label}")
        else:
            failures.append(label)
            print(f"  ACCEPTED  {label}   <-- the check does not catch this")

    # The self-test is itself worthless if the unbroken config does not pass.
    try:
        check(cfg)
    except Rejected as e:
        failures.append(f"the real config does not pass: {e}")
        print(f"  ACCEPTED  (control) the shipped config is rejected: {e}")
    else:
        print("  passed    (control) the shipped config")

    if failures:
        print(f"\nFAIL  {len(failures)} break(s) were not caught.")
        return 1
    print(f"\nOK    all {len(breaks)} breaks rejected, and the shipped config passes.")
    return 0


def main() -> int:
    cfg = json.loads((ROOT / "default.json").read_text())
    if "--self-test" in sys.argv:
        return self_test(cfg)
    try:
        for line in check(cfg):
            print(f"OK    {line}")
    except Rejected as e:
        print(f"FAIL  {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
