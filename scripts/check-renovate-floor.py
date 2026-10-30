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

It also asserts where the floor is allowed to differ. The security path has
none, so a CVE fix is proposed the moment it exists. Lock file maintenance keeps
it, and passes its stability check without a release timestamp, because a
regenerated lockfile carries none and Renovate hands the floor to the tools that
take one during regeneration, npm among them. Only a packageRule naming
first-party packages removes it.

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

# Scopes allowed to skip the floor entirely, as they appear in matchPackageNames.
#
# The floor exists so no tree here is the first consumer of a compromised
# publish. That reasoning does not reach a package this org publishes itself, so
# those are exempt — but only those, and the exemption is a pair: the consuming
# repositories carry a matching pnpm `minimumReleaseAgeExclude`, and a Renovate
# exemption without its pnpm half is a bump Renovate proposes and pnpm refuses.
#
# Adding a scope here is therefore not a config edit, it is a commitment to add
# the pnpm side in every repo that consumes it. Nothing in this repository can
# verify that — the pnpm settings live in the consumers — which is exactly why
# the list is short, explicit, and checked rather than left to convention.
FIRST_PARTY_SCOPES = {"/^@shuttering//"}

# Action refs that skip the floor, as they appear in matchPackageNames.
#
# The pnpm pairing above is a commitment about registry scopes only. An action
# ref has no package-manager side: the Actions runner resolves it, and neither
# pnpm nor npm reads it, so there is no second half to add in the consumers.
# What an entry here commits to is confinement. The exempting rule names action
# refs and nothing else; it matches only the github-actions manager, the only
# manager whose dependencies this reasoning covers; and it matches the same
# names as depNames. The github-actions extractor gives a ref with an
# explicit host, such as https://gitea.example.com/nanohype/.github/..., the
# packageName nanohype/.github and a depName that carries the host, so only the
# depName tells the org's own repository from a namesake on another server.
#
# Entries are exact names, so an exemption covers the repository that was
# reviewed and nothing else. A pattern widens it to names nobody reviewed:
# "/\/\.github$/" also matches "evil/.github", which another owner controls.
#
# Every entry must also be exempt in fact. A digest update for a branch ref
# carries no release timestamp, so under timestamp-required the floor holds it
# pending indefinitely, and the github-actions group branch it lands in with it.
FIRST_PARTY_ACTION_REFS = {"nanohype/.github"}

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


def stated_block(cfg: dict, key: str, unstated: str) -> dict:
    """The config block under key. Raises Rejected, naming what goes unstated, if absent."""
    block = cfg.get(key)
    if not isinstance(block, dict):
        raise Rejected(f"{key} is missing, so {unstated} is unstated.")
    return block


def check_top_level(cfg: dict) -> tuple[list[str], int]:
    """The floor every update starts from. Returns what was checked, and the floor in minutes."""
    if "minimumReleaseAge" not in cfg:
        raise Rejected(
            "the preset sets no minimumReleaseAge. Renovate would then propose "
            "packages published minutes ago, and pnpm would refuse the lockfile "
            "they land in."
        )
    minutes = parse_duration(cfg["minimumReleaseAge"])
    checked = [
        f"minimumReleaseAge {cfg['minimumReleaseAge']!r} parses to {minutes} minutes"
    ]

    if minutes < PNPM_FLOOR_MINUTES:
        raise Rejected(
            f"minimumReleaseAge is {minutes} minutes, below pnpm's "
            f"{PNPM_FLOOR_MINUTES}. Renovate would open PRs whose lockfiles pnpm "
            f"rejects, and the failure would surface in unrelated pull requests."
        )
    checked.append(f"{minutes} >= pnpm's floor of {PNPM_FLOOR_MINUTES} minutes")

    # timestamp-optional lets an update Renovate cannot date pass the floor
    # unchecked. Lock file maintenance is the one undated update this preset lets
    # through, because Renovate hands its floor to the tools that regenerate the
    # lockfile, and its block sets the behaviour for it alone (checked below).
    behaviour = cfg.get("minimumReleaseAgeBehaviour", "timestamp-required")
    if behaviour != "timestamp-required":
        raise Rejected(
            f"the preset sets minimumReleaseAgeBehaviour to {behaviour!r}. An "
            f"update with no release timestamp, such as a digest update for a "
            f"branch ref, would then pass the floor unchecked."
        )
    checked.append("minimumReleaseAgeBehaviour is timestamp-required at the top level")
    return checked, minutes


def check_security_path(cfg: dict) -> list[str]:
    va = stated_block(cfg, "vulnerabilityAlerts", "the security path")
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
    return ["vulnerabilityAlerts.minimumReleaseAge is explicitly null"]


def check_lock_file_maintenance(cfg: dict, floor: int) -> list[str]:
    """Lock file maintenance keeps a floor and passes without a release timestamp.

    Its update regenerates a lockfile rather than moving a dependency to a
    release, so it never carries a release timestamp. Under timestamp-required,
    Renovate's default, a floor on an undated update keeps renovate/stability-days
    pending forever; timestamp-optional lets it pass. The floor itself stays,
    because Renovate hands it to the tools that take one during regeneration:
    npm runs with --before, and Poetry with POETRY_SOLVER_MIN_RELEASE_AGE. A null
    floor here regenerates every npm lockfile with no floor unless the
    consumer's .npmrc sets one of its own.

    No packageRule can take the floor off this branch: every rule that sets
    minimumReleaseAge must name packages, and a lock file maintenance update
    carries no package name to match. No packageRule can set the behaviour
    either (both checked in check_package_rules).
    """
    lfm = stated_block(cfg, "lockFileMaintenance", "the lockfile branch's floor")
    behaviour = lfm.get("minimumReleaseAgeBehaviour")
    if behaviour != "timestamp-optional":
        raise Rejected(
            f"lockFileMaintenance.minimumReleaseAgeBehaviour is {behaviour!r}, not "
            f"'timestamp-optional'. A lock file maintenance update carries no "
            f"release timestamp, so under timestamp-required, Renovate's default, "
            f"its floor holds renovate/stability-days pending and the branch never "
            f"passes."
        )
    checked = ["lockFileMaintenance.minimumReleaseAgeBehaviour is timestamp-optional"]

    if "minimumReleaseAge" not in lfm:
        checked.append("lockFileMaintenance inherits the top-level floor")
        return checked
    value = lfm["minimumReleaseAge"]
    if value is None:
        raise Rejected(
            "lockFileMaintenance.minimumReleaseAge is null. Renovate hands the "
            "floor to the tools that regenerate the lockfile, npm's --before among "
            "them, so a null floor regenerates the whole tree with none."
        )
    minutes = parse_duration(value)
    if minutes < floor:
        raise Rejected(
            f"lockFileMaintenance.minimumReleaseAge is {minutes} minutes, below "
            f"the top-level {floor}. Regeneration resolves every package in the "
            f"tree, so it gets no shorter floor than a single update does."
        )
    checked.append(
        f"lockFileMaintenance states a floor of {minutes} minutes, at or above "
        f"the top-level {floor}"
    )
    return checked


def check_action_ref_exemption(i: int, rule: dict, names: list) -> None:
    """A null floor naming an action ref is confined to that ref on this org's host."""
    refs = [n for n in names if n in FIRST_PARTY_ACTION_REFS]
    if not refs:
        return
    confined = (
        len(refs) == len(names)
        and rule.get("matchManagers") == ["github-actions"]
        and rule.get("matchDepNames") == names
    )
    if not confined:
        raise Rejected(
            f"packageRules[{i}] removes the floor for action refs {refs} but is "
            f"not confined to them: an action-ref exemption names only action "
            f'refs, sets matchManagers to ["github-actions"], and sets '
            f"matchDepNames to the same names as matchPackageNames. The exemption "
            f"holds for a ref to this org's own repository, which has no release "
            f"to age. Another manager's dependency is no such ref, and a ref with "
            f"an explicit host shares its packageName with refs on servers this "
            f"org does not own; only the depName tells them apart."
        )


def check_package_rules(cfg: dict) -> list[str]:
    """Rules that change the floor, and the action refs that must end up exempt.

    A packageRule can override the top-level floor, and a later rule wins. So
    the floor checked above is only the floor for packages no rule names —
    asserting it alone would report a floor the config does not actually
    enforce.
    """
    removed = 0
    raised = 0
    last_for_ref: dict[str, object] = {}
    for i, rule in enumerate(cfg.get("packageRules") or []):
        if "minimumReleaseAgeBehaviour" in rule:
            raise Rejected(
                f"packageRules[{i}] sets minimumReleaseAgeBehaviour, which is set "
                f"in lockFileMaintenance and nowhere else. timestamp-optional on a "
                f"rule lets every update it matches pass the floor undated, and "
                f"packageRules apply after the lockFileMaintenance block, so a rule "
                f"matching lock file maintenance replaces what that block sets."
            )
        if "minimumReleaseAge" not in rule:
            continue
        value = rule["minimumReleaseAge"]
        names = rule.get("matchPackageNames")

        if not names:
            raise Rejected(
                f"packageRules[{i}] sets minimumReleaseAge with no "
                f"matchPackageNames, so it applies to every package and silently "
                f"replaces the top-level floor."
            )
        if value is None:
            unlisted = [
                n
                for n in names
                if n not in FIRST_PARTY_SCOPES | FIRST_PARTY_ACTION_REFS
            ]
            if unlisted:
                raise Rejected(
                    f"packageRules[{i}] removes the floor for {unlisted}, which is "
                    f"not first-party. The floor is what keeps this org from being "
                    f"the first consumer of a compromised publish, and only a "
                    f"package this org publishes itself is outside that risk."
                )
            check_action_ref_exemption(i, rule, names)
            removed += 1
        else:
            minutes_rule = parse_duration(value)
            if minutes_rule < PNPM_FLOOR_MINUTES:
                raise Rejected(
                    f"packageRules[{i}] sets minimumReleaseAge to {minutes_rule} "
                    f"minutes for {names}, below pnpm's {PNPM_FLOOR_MINUTES}. "
                    f"Renovate would propose what pnpm then refuses to install."
                )
            raised += 1
        for name in names:
            if name in FIRST_PARTY_ACTION_REFS:
                last_for_ref[name] = value

    for ref in sorted(FIRST_PARTY_ACTION_REFS):
        if ref not in last_for_ref:
            raise Rejected(
                f"no packageRule removes the floor for {ref}. Its digest updates "
                f"carry no release timestamp, so the floor holds them, and the "
                f"github-actions group branch they land in, pending for as long as "
                f"the branch exists."
            )
        if last_for_ref[ref] is not None:
            raise Rejected(
                f"the last packageRule naming {ref} sets minimumReleaseAge to "
                f"{last_for_ref[ref]!r}. A later rule wins, so the floor is back on "
                f"its digest updates and holds the github-actions group branch "
                f"pending."
            )

    refs = sorted(FIRST_PARTY_ACTION_REFS)
    return [
        f"{removed} packageRule(s) remove the floor, each naming first-party packages only",
        f"{raised} packageRule(s) set a floor of their own, none below pnpm's",
        f"the floor is removed for every first-party action ref: {refs}",
    ]


def check(cfg: dict) -> list[str]:
    """Returns the list of things checked. Raises Rejected on the first failure."""
    checked, floor = check_top_level(cfg)
    checked += check_security_path(cfg)
    checked += check_lock_file_maintenance(cfg, floor)
    checked += check_package_rules(cfg)
    return checked


def variants(cfg: dict) -> tuple[list[tuple[str, dict, str]], list[tuple[str, dict]]]:
    """Configs derived from cfg: those the check must reject, and those it must pass.

    Each break carries a fragment of the rejection it must produce. A break
    rejected by some other check is not evidence for the check it targets: a
    null floor caught only because parse_duration refuses None would survive
    the deletion of the check written for it.
    """

    def copy() -> dict:
        return json.loads(json.dumps(cfg))

    def without(key):
        d = copy()
        d.pop(key, None)
        return d

    def with_key(key, value, block=None, present=True):
        d = copy()
        target = d if block is None else d[block]
        if present:
            target[key] = value
        else:
            target.pop(key, None)
        return d

    def with_rule(rule):
        d = copy()
        d.setdefault("packageRules", []).append(rule)
        return d

    def action_exemption(name, managers=("github-actions",), dep_names=True):
        rule = {"matchPackageNames": [name], "minimumReleaseAge": None}
        if managers is not None:
            rule["matchManagers"] = list(managers)
        if dep_names is True:
            rule["matchDepNames"] = [name]
        elif dep_names:
            rule["matchDepNames"] = list(dep_names)
        return with_rule(rule)

    def without_action_exemption():
        d = copy()
        d["packageRules"] = [
            r
            for r in d.get("packageRules") or []
            if not set(r.get("matchPackageNames") or []) & FIRST_PARTY_ACTION_REFS
        ]
        return d

    def lfm(key, value, present=True):
        return with_key(key, value, block="lockFileMaintenance", present=present)

    not_first_party = "which is not first-party"
    not_confined = "is not confined to them"
    rule_behaviour = (
        "sets minimumReleaseAgeBehaviour, which is set in lockFileMaintenance"
    )

    breaks = [
        ("no floor at all", without("minimumReleaseAge"), "sets no minimumReleaseAge"),
        (
            "a rule removing the floor for a third-party package",
            with_rule({"matchPackageNames": ["lodash"], "minimumReleaseAge": None}),
            not_first_party,
        ),
        (
            "a rule removing the floor for a lookalike scope",
            with_rule(
                {
                    "matchPackageNames": ["/^@shuttering-evil//"],
                    "minimumReleaseAge": None,
                }
            ),
            not_first_party,
        ),
        (
            "a rule removing the floor for everything",
            with_rule({"minimumReleaseAge": None}),
            "with no matchPackageNames",
        ),
        (
            "a rule lowering the floor below pnpm's",
            with_rule(
                {
                    "matchPackageNames": ["/^@shuttering//"],
                    "minimumReleaseAge": "6 hours",
                }
            ),
            "minimumReleaseAge to 360 minutes for",
        ),
        (
            "floor below pnpm's",
            with_key("minimumReleaseAge", "6 hours"),
            "minimumReleaseAge is 360 minutes, below pnpm's",
        ),
        (
            "floor exactly one minute short",
            with_key("minimumReleaseAge", "1439 minutes"),
            "minimumReleaseAge is 1439 minutes, below pnpm's",
        ),
        (
            "unparseable duration",
            with_key("minimumReleaseAge", "3 bananas"),
            "is not a duration Renovate parses",
        ),
        (
            "numeric instead of duration string",
            with_key("minimumReleaseAge", 4320),
            "must be a duration string, got 4320",
        ),
        (
            "null floor",
            with_key("minimumReleaseAge", None),
            "must be a duration string, got None",
        ),
        (
            "every undated update let through the floor",
            with_key("minimumReleaseAgeBehaviour", "timestamp-optional"),
            "sets minimumReleaseAgeBehaviour to 'timestamp-optional'",
        ),
        (
            "security path delayed",
            with_key("minimumReleaseAge", "3 days", block="vulnerabilityAlerts"),
            "vulnerabilityAlerts.minimumReleaseAge is '3 days'",
        ),
        (
            "security path left implicit",
            with_key(
                "minimumReleaseAge", None, block="vulnerabilityAlerts", present=False
            ),
            "vulnerabilityAlerts does not state minimumReleaseAge",
        ),
        (
            "vulnerabilityAlerts removed",
            without("vulnerabilityAlerts"),
            "vulnerabilityAlerts is missing",
        ),
        (
            "lock file maintenance floor removed",
            lfm("minimumReleaseAge", None),
            "lockFileMaintenance.minimumReleaseAge is null",
        ),
        (
            "lock file maintenance floor below the top-level floor",
            lfm("minimumReleaseAge", "2 days"),
            "lockFileMaintenance.minimumReleaseAge is 2880 minutes, below the top-level",
        ),
        (
            "lock file maintenance floor unparseable",
            lfm("minimumReleaseAge", "3 bananas"),
            "is not a duration Renovate parses",
        ),
        (
            "lock file maintenance waiting on a timestamp it never gets",
            lfm("minimumReleaseAgeBehaviour", "timestamp-required"),
            "lockFileMaintenance.minimumReleaseAgeBehaviour is 'timestamp-required'",
        ),
        (
            "lock file maintenance behaviour left implicit",
            lfm("minimumReleaseAgeBehaviour", None, present=False),
            "lockFileMaintenance.minimumReleaseAgeBehaviour is None",
        ),
        (
            "lockFileMaintenance removed",
            without("lockFileMaintenance"),
            "lockFileMaintenance is missing",
        ),
        (
            "a rule letting the updates it matches through the floor undated",
            with_rule(
                {
                    "matchPackageNames": ["lodash"],
                    "minimumReleaseAgeBehaviour": "timestamp-optional",
                }
            ),
            rule_behaviour,
        ),
        (
            "a rule that holds lock file maintenance pending",
            with_rule(
                {
                    "matchUpdateTypes": ["lockFileMaintenance"],
                    "minimumReleaseAgeBehaviour": "timestamp-required",
                }
            ),
            rule_behaviour,
        ),
        (
            "a rule removing the floor for a lookalike action ref",
            action_exemption("nanohype/.github-evil"),
            not_first_party,
        ),
        (
            "a rule removing the floor for another owner's .github",
            action_exemption("evil/.github"),
            not_first_party,
        ),
        (
            "a pattern standing in for the exact action ref",
            action_exemption("/^nanohype\\/\\.github/"),
            not_first_party,
        ),
        (
            "an action-ref exemption not confined to github-actions",
            action_exemption("nanohype/.github", managers=None),
            not_confined,
        ),
        (
            "an action-ref exemption confined to the wrong manager",
            action_exemption("nanohype/.github", managers=("npm",)),
            not_confined,
        ),
        (
            "an action-ref exemption that also matches another manager",
            action_exemption("nanohype/.github", managers=("github-actions", "npm")),
            not_confined,
        ),
        (
            "an action-ref exemption that also matches refs with an explicit host",
            action_exemption("nanohype/.github", dep_names=False),
            not_confined,
        ),
        (
            "an action-ref exemption matching depNames by pattern",
            action_exemption("nanohype/.github", dep_names=["/nanohype\\/\\.github$/"]),
            not_confined,
        ),
        (
            "an action-ref exemption that also names a registry scope",
            with_rule(
                {
                    "matchManagers": ["github-actions"],
                    "matchPackageNames": ["nanohype/.github", "/^@shuttering//"],
                    "matchDepNames": ["nanohype/.github", "/^@shuttering//"],
                    "minimumReleaseAge": None,
                }
            ),
            not_confined,
        ),
        (
            "the action-ref exemption removed",
            without_action_exemption(),
            "no packageRule removes the floor for nanohype/.github",
        ),
        (
            "the action-ref exemption overridden by a later rule",
            with_rule(
                {
                    "matchManagers": ["github-actions"],
                    "matchPackageNames": ["nanohype/.github"],
                    "minimumReleaseAge": "3 days",
                }
            ),
            "the last packageRule naming nanohype/.github",
        ),
    ]

    keeps = [
        (
            "lock file maintenance stating the top-level floor",
            lfm("minimumReleaseAge", cfg["minimumReleaseAge"]),
        ),
        (
            "lock file maintenance stating a longer floor",
            lfm("minimumReleaseAge", "7 days"),
        ),
        (
            "timestamp-required stated at the top level",
            with_key("minimumReleaseAgeBehaviour", "timestamp-required"),
        ),
        (
            "a rule raising the floor for a third-party package",
            with_rule({"matchPackageNames": ["lodash"], "minimumReleaseAge": "7 days"}),
        ),
    ]
    return breaks, keeps


def outcome(cfg: dict) -> tuple[str, str]:
    """('rejected' | 'passed' | 'raised', the message that came with it).

    A lookup on a key or block the break removed fails with one of the errors
    caught here before any check reads it, which is not the check rejecting the
    break.
    """
    try:
        check(cfg)
    except Rejected as e:
        return "rejected", str(e)
    except (KeyError, TypeError, AttributeError, ValueError) as e:
        return "raised", f"{type(e).__name__}: {e}"
    return "passed", ""


def self_test(cfg: dict) -> int:
    """Break the config every way the checks claim to catch. Each must be rejected.

    The valid variants differ from the shipped config in ways the checks allow,
    and each must pass, so a check that rejects too much fails here rather than
    on the next edit to default.json.
    """
    breaks, keeps = variants(cfg)
    failures = []
    for label, broken, reason in breaks:
        verdict, message = outcome(broken)
        if verdict == "rejected" and reason in message:
            print(f"  rejected  {label}")
            continue
        failures.append(label)
        if verdict == "rejected":
            print(f"  WRONG CHECK  {label}: expected {reason!r}, got: {message}")
        else:
            print(f"  NOT REJECTED  {label}: {verdict} {message}".rstrip())

    for label, variant in [*keeps, ("(control) the shipped config", cfg)]:
        verdict, message = outcome(variant)
        if verdict == "passed":
            print(f"  passed    {label}")
        else:
            failures.append(label)
            print(f"  NOT PASSED  {label}: {verdict}: {message}")

    if failures:
        print(f"\nFAIL  {len(failures)} variant(s) did not get the expected verdict.")
        return 1
    print(
        f"\nOK    all {len(breaks)} breaks rejected by the check each targets, all "
        f"{len(keeps)} valid variants passed, and the shipped config passes."
    )
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
