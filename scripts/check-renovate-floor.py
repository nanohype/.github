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

It also asserts where the floor may differ. The security path has none, so a
CVE fix is proposed the moment it exists. Lock file maintenance keeps it and
passes its stability check without a release timestamp, because a regenerated
lockfile has none and Renovate passes the floor to the tools that take one while
regenerating. A top-level packageRule naming first-party packages removes it,
and nothing else this file states can: each floor setting is allowed only where
these checks read it. The presets in the top-level extends are resolved by
whichever Renovate runs the config, and are outside this check.

Run with --self-test to break the inputs and confirm each break is rejected. A
gate that has never been seen to fail is not known to be a gate.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from collections.abc import Iterator
from typing import Any

Config = dict[str, Any]

# Keys and indexes from the config root down to one object in it.
Path = tuple[str | int, ...]

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
# pnpm install never reads an action ref, so unlike a scope above, an entry here
# has no install-time half. What it commits to is confinement: the exempting rule
# names action refs and nothing else, matches only the github-actions manager,
# and matches the same names as depNames. The github-actions extractor gives a
# ref with an explicit host, github.com included, the packageName owner/repo and
# a depName that carries the host, so only the depName tells this org's
# repository from a namesake on another server, and a first-party ref is written
# without a host.
#
# Entries are exact names, so an exemption covers the repository that was
# reviewed and nothing else; a pattern such as "/\/\.github$/" would also match
# "evil/.github".
#
# Every entry must also be exempt in fact (check_action_refs_exempt). A digest
# update for a branch ref has no release timestamp, so under timestamp-required
# the floor holds it, and the github-actions group branch it lands in, pending
# for as long as the branch exists. Renovate matches names as case-insensitive
# globs and as regexes, so "*", "nanohype/*", "/^nanohype\//" and "!lodash" put
# the floor back from a later rule as surely as the ref's own name does.
FIRST_PARTY_ACTION_REFS = {"nanohype/.github"}

# Where each floor setting may appear below the top level. packageRules[] stands
# for any top-level packageRule. Renovate merges manager blocks, update-type
# blocks, force and the blocks nested in them into the updates they reach, so a
# floor setting in a block no check here reads still changes the floor. Rather
# than list the blocks Renovate merges, check_placement allows each setting only
# where it is read, so a block this script names nowhere still fails.
FLOOR_PLACES = {
    "minimumReleaseAge": (
        "vulnerabilityAlerts",
        "lockFileMaintenance",
        "packageRules[]",
    ),
    "minimumReleaseAgeBehaviour": ("lockFileMaintenance",),
}

# Renovate reads a match* list entry wrapped in slashes as a regex, one starting
# with "!" as a negation, and anything else as a minimatch glob that ignores case,
# treats a run of slashes as one, and reads a leading "#" as a comment that
# matches nothing. An entry that starts with none of /, ! or # and has no glob
# syntax, no run of slashes and no . or .. segment matches only its own text,
# ignoring case.
GLOB_SYNTAX = re.compile(r"[*?\[\]{}()\\]|//|(?:^|/)\.\.?(?:/|$)")

# Keys that change the names every later rule matches a dependency by, and the
# names Renovate's second pass over packageRules matches it by.
RENAMES = ("overrideDepName", "overridePackageName")

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


def stated_block(cfg: Config, key: str, unstated: str) -> Config:
    """The config block under key. Raises Rejected, naming what goes unstated, if absent."""
    block = cfg.get(key)
    if not isinstance(block, dict):
        raise Rejected(f"{key} is missing, so {unstated} is unstated.")
    return block


def check_top_level(cfg: Config) -> tuple[list[str], int]:
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
    # through, because Renovate passes its floor to the tools that regenerate the
    # lockfile, and its block sets the behaviour for it alone
    # (check_lock_file_maintenance, check_placement).
    behaviour = cfg.get("minimumReleaseAgeBehaviour", "timestamp-required")
    if behaviour != "timestamp-required":
        raise Rejected(
            f"the preset sets minimumReleaseAgeBehaviour to {behaviour!r}. An "
            f"update with no release timestamp, such as a digest update for a "
            f"branch ref, would then pass the floor unchecked."
        )
    checked.append("minimumReleaseAgeBehaviour is timestamp-required at the top level")
    return checked, minutes


def check_security_path(cfg: Config) -> list[str]:
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


def check_lock_file_maintenance(cfg: Config, floor: int) -> list[str]:
    """Lock file maintenance keeps a floor and passes without a release timestamp.

    Its update regenerates a lockfile rather than moving a dependency to a
    release, so it never carries a release timestamp. Under timestamp-required,
    Renovate's default, a floor on an undated update keeps renovate/stability-days
    pending forever; timestamp-optional lets it pass. The floor itself stays,
    because Renovate passes it to the tools that take one while regenerating:
    npm runs with --before, and Poetry with POETRY_SOLVER_MIN_RELEASE_AGE. A null
    floor here regenerates those lockfiles with none.

    No packageRule can take the floor off this branch: every rule that sets
    minimumReleaseAge must name packages, and a lock file maintenance update
    carries no package name to match. Neither a packageRule nor any block but
    this one can set the behaviour. check_placement and check_package_rules
    enforce both.
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
            "lockFileMaintenance.minimumReleaseAge is null. Renovate passes the "
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


def settings(node: object, path: Path = ()) -> Iterator[tuple[Path, str, object]]:
    """Every key at every depth of node, with the path to the object that holds it."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield path, key, value
            yield from settings(value, (*path, key))
    elif isinstance(node, list):
        for i, item in enumerate(node):
            yield from settings(item, (*path, i))


def where(path: Path) -> str:
    """path as text, such as npm.major or packageRules[3]."""
    text = ""
    for part in path:
        if isinstance(part, int):
            text += f"[{part}]"
        else:
            text += f".{part}" if text else part
    return text


def place(path: Path) -> str:
    """where(path), with the index of a top-level packageRule written as []."""
    if len(path) == 2 and path[0] == "packageRules" and isinstance(path[1], int):
        return "packageRules[]"
    return where(path)


def check_placement(cfg: Config) -> list[str]:
    """Rules, presets and floor settings sit only where these checks read them.

    Renovate merges a block into the updates the block reaches, packageRules
    and all, and resolves extends inside nested blocks and rules, so below the
    top level any of them can undo a floor or an exemption checked here.
    """
    for path, key, value in settings(cfg):
        if not path:
            continue
        if key == "packageRules":
            raise Rejected(
                f"{where((*path, key))} holds rules outside the top-level "
                f"packageRules this check reads. Renovate merges a block's "
                f"packageRules into the updates the block reaches, so a rule there "
                f"can undo any floor or exemption checked here."
            )
        if key == "extends":
            raise Rejected(
                f"{where(path)} extends {value!r}, so it takes settings from "
                f"presets this check does not read, and a preset can set a floor "
                f"or carry a rule that undoes one."
            )
        places = FLOOR_PLACES.get(key)
        if places is not None and place(path) not in places:
            raise Rejected(
                f"{where(path)} sets {key}, which this check reads only at the top "
                f"level and in {', '.join(places)}. A setting in any other block "
                f"or rule applies to every update that block or rule reaches, and "
                f"changes the floor there with nothing here reading it."
            )
    return [
        "every packageRule, preset and floor setting sits where these checks read it"
    ]


def check_action_ref_exemption(i: int, rule: Config, names: list[str]) -> None:
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


def check_package_rules(cfg: Config) -> list[str]:
    """Every rule that changes the floor names packages, and only first-party ones lose it.

    A packageRule can override the top-level floor, and a later rule wins. So
    the floor check_top_level reads is only the floor for packages no rule
    names — asserting it alone would report a floor the config does not
    actually enforce.
    """
    removed = 0
    raised = 0
    for i, rule in enumerate(cfg.get("packageRules") or []):
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

    return [
        f"{removed} packageRule(s) remove the floor, each naming first-party packages only",
        f"{raised} packageRule(s) set a floor of their own, none below pnpm's",
    ]


def ref_update(ref: str) -> dict[str, str]:
    """What an update of a first-party action ref shows the matchers this check reads.

    The github-actions extractor gives a ref with no host the depName
    owner/repo, and the packageName defaults to the depName.
    """
    return {
        "matchManagers": "github-actions",
        "matchPackageNames": ref,
        "matchDepNames": ref,
    }


def exact(pattern: str) -> bool:
    """Whether Renovate matches pattern only against its own text, ignoring case."""
    return not pattern.startswith(("/", "!", "#")) and not GLOB_SYNTAX.search(pattern)


def may_match(patterns: object, value: str) -> bool:
    """Whether Renovate could match value against a match* list. False only when it cannot.

    The list matches when some positive entry matches, if it has any, and no
    negated entry excludes the value.
    """
    if not isinstance(patterns, list) or not all(isinstance(p, str) for p in patterns):
        return True

    def same(pattern: str) -> bool:
        return exact(pattern) and pattern.lower() == value.lower()

    positive = [p for p in patterns if not p.startswith("!")]
    if positive and not any(same(p) or not exact(p) for p in positive):
        return False
    return not any(same(p[1:]) for p in patterns if p.startswith("!"))


def reaches(rule: Config, ref: str) -> bool:
    """Whether rule could apply to an update of ref: no matcher this check reads rules it out.

    A regex, a glob or a negation can match a name this check cannot predict,
    and a rule with none of these matchers reaches every dependency its other
    matchers allow, so each of those counts as reaching the ref.
    """
    return all(
        may_match(rule[key], value)
        for key, value in ref_update(ref).items()
        if key in rule
    )


def names_exactly(rule: Config, ref: str) -> bool:
    """Whether rule applies to every update of ref.

    Each matcher this check reads lists ref, or github-actions, by its exact
    text, and the rule has no other matcher to narrow it.
    """
    facts = ref_update(ref)
    if {key for key in rule if key.startswith("match")} != set(facts):
        return False
    return all(
        isinstance(rule[key], list)
        and value in rule[key]
        and all(isinstance(p, str) and exact(p) for p in rule[key])
        for key, value in facts.items()
    )


def check_renames(i: int, rule: Config, ref: str) -> None:
    """No rule renames ref, or gives another dependency its name."""
    for key in RENAMES:
        if key not in rule:
            continue
        target = rule[key]
        if reaches(rule, ref):
            raise Rejected(
                f"packageRules[{i}] sets {key} and can reach {ref}. Every later "
                f"rule, and Renovate's second pass over packageRules, then matches "
                f"the ref by the name this rule sets, while the exemption matches "
                f"by exact name, so the floor can come back on it."
            )
        if (
            not isinstance(target, str)
            or "{{" in target
            or target.lower() == ref.lower()
        ):
            raise Rejected(
                f"packageRules[{i}] sets {key} to {target!r}, which can give "
                f"another dependency the name {ref}, and the exemption then "
                f"removes the floor for a dependency nobody reviewed."
            )


def check_action_refs_exempt(cfg: Config) -> list[str]:
    """Every first-party action ref ends with no floor once every rule here has applied.

    Renovate applies the rules in order and a later rule wins, so the ref is
    exempt when the last rule that can reach it and sets minimumReleaseAge
    names it exactly and sets null. A rule that can reach the ref but does not
    name it exactly cannot be relied on to remove the floor, and can put it
    back.
    """
    rules = cfg.get("packageRules") or []
    for ref in sorted(FIRST_PARTY_ACTION_REFS):
        last: tuple[int, object] | None = None
        for i, rule in enumerate(rules):
            check_renames(i, rule, ref)
            if "minimumReleaseAge" not in rule or not reaches(rule, ref):
                continue
            value = rule["minimumReleaseAge"]
            if value is not None or names_exactly(rule, ref):
                last = (i, value)
        if last is None:
            raise Rejected(
                f"no packageRule removes the floor from every update of {ref}. A "
                f"rule that does lists it exactly in matchPackageNames and "
                f"matchDepNames, and github-actions in matchManagers, with no other "
                f"matcher. Its digest updates carry no release timestamp, so the "
                f"floor holds them, and the github-actions group branch they land "
                f"in, pending for as long as the branch exists."
            )
        i, value = last
        if value is not None:
            raise Rejected(
                f"packageRules[{i}] can reach {ref} and sets minimumReleaseAge to "
                f"{value!r}, and no rule after it removes the floor by naming "
                f"{ref} exactly. A later rule wins, so the floor is back on its "
                f"digest updates and holds the github-actions group branch "
                f"pending. A rule that sets a floor after the exemption rules the "
                f"ref out with an exact matchManagers, matchPackageNames or "
                f"matchDepNames list that does not name it, or with a negation of "
                f"its exact name, or moves above the exemption."
            )

    refs = sorted(FIRST_PARTY_ACTION_REFS)
    exempt = (
        f"the last rule that can reach each first-party action ref removes its "
        f"floor by naming it exactly: {refs}"
    )
    return [exempt]


def check(cfg: Config) -> list[str]:
    """Returns the list of things checked. Raises Rejected on the first failure."""
    checked, floor = check_top_level(cfg)
    checked += check_security_path(cfg)
    checked += check_lock_file_maintenance(cfg, floor)
    checked += check_placement(cfg)
    checked += check_package_rules(cfg)
    checked += check_action_refs_exempt(cfg)
    return checked


Breaks = list[tuple[str, Config, str]]
Keeps = list[tuple[str, Config]]


def variants(cfg: Config) -> tuple[Breaks, Keeps]:
    """Configs derived from cfg: those the check must reject, and those it must pass.

    Each break carries a fragment of the rejection it must produce. A break
    rejected by some other check is not evidence for the check it targets: a
    null floor caught only because parse_duration refuses None would survive
    the deletion of the check written for it.
    """

    def copy() -> Config:
        d: Config = json.loads(json.dumps(cfg))
        return d

    def without(key: str) -> Config:
        d = copy()
        d.pop(key, None)
        return d

    def with_key(
        key: str, value: object, block: str | None = None, present: bool = True
    ) -> Config:
        d = copy()
        target = d if block is None else d.setdefault(block, {})
        if present:
            target[key] = value
        else:
            target.pop(key, None)
        return d

    def with_rule(rule: Config, at: int | None = None) -> Config:
        d = copy()
        rules = d.setdefault("packageRules", [])
        rules.insert(len(rules) if at is None else at, rule)
        return d

    def action_exemption(
        name: str,
        managers: tuple[str, ...] | None = ("github-actions",),
        dep_names: bool | list[str] = True,
    ) -> Config:
        rule: Config = {"matchPackageNames": [name], "minimumReleaseAge": None}
        if managers is not None:
            rule["matchManagers"] = list(managers)
        if dep_names is True:
            rule["matchDepNames"] = [name]
        elif dep_names:
            rule["matchDepNames"] = list(dep_names)
        return with_rule(rule)

    def without_action_exemption() -> Config:
        d = copy()
        d["packageRules"] = [
            r
            for r in d.get("packageRules") or []
            if not set(r.get("matchPackageNames") or []) & FIRST_PARTY_ACTION_REFS
        ]
        return d

    def narrowed_action_exemption() -> Config:
        d = without_action_exemption()
        d["packageRules"].append(
            {
                "matchManagers": ["github-actions"],
                "matchPackageNames": ["nanohype/.github"],
                "matchDepNames": ["nanohype/.github"],
                "matchUpdateTypes": ["major"],
                "minimumReleaseAge": None,
            }
        )
        return d

    def lfm(key: str, value: object, present: bool = True) -> Config:
        return with_key(key, value, block="lockFileMaintenance", present=present)

    def later_floor(**matchers: list[str]) -> Config:
        return with_rule({**matchers, "minimumReleaseAge": "7 days"})

    def with_custom_manager(entry: Config) -> tuple[Config, int]:
        d = copy()
        managers = d.setdefault("customManagers", [])
        managers.append(entry)
        return d, len(managers) - 1

    def misplaced(at: str, key: str) -> str:
        return f"{at} sets {key}, which this check reads only at the top level"

    floor_in_custom_manager, custom_index = with_custom_manager(
        {"customType": "regex", "minimumReleaseAge": None}
    )
    # Where with_rule puts a rule when it is given no index.
    appended = f"packageRules[{len(cfg.get('packageRules') or [])}]"

    not_first_party = "which is not first-party"
    not_confined = "is not confined to them"
    rule_behaviour = misplaced(appended, "minimumReleaseAgeBehaviour")
    refloored = "can reach nanohype/.github and sets minimumReleaseAge to '7 days'"
    renamed = "sets overridePackageName and can reach nanohype/.github"

    breaks: Breaks = [
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
            "a manager block lifting the floor",
            with_key("minimumReleaseAge", None, block="npm"),
            misplaced("npm", "minimumReleaseAge"),
        ),
        (
            "a manager block lowering the floor below pnpm's",
            with_key("minimumReleaseAge", "1 hour", block="github-actions"),
            misplaced("github-actions", "minimumReleaseAge"),
        ),
        (
            "an update-type block lifting the floor",
            with_key("minimumReleaseAge", None, block="major"),
            misplaced("major", "minimumReleaseAge"),
        ),
        (
            "an update-type block letting undated updates through",
            with_key(
                "minimumReleaseAgeBehaviour", "timestamp-optional", block="digest"
            ),
            misplaced("digest", "minimumReleaseAgeBehaviour"),
        ),
        (
            "force, a block no check here names, lifting the floor",
            with_key("minimumReleaseAge", None, block="force"),
            misplaced("force", "minimumReleaseAge"),
        ),
        (
            "a lockFileMaintenance block nested in a manager block",
            with_key("lockFileMaintenance", {"minimumReleaseAge": None}, block="npm"),
            misplaced("npm.lockFileMaintenance", "minimumReleaseAge"),
        ),
        (
            "an update-type block nested in a packageRule",
            with_rule(
                {"matchPackageNames": ["lodash"], "major": {"minimumReleaseAge": None}}
            ),
            misplaced(f"{appended}.major", "minimumReleaseAge"),
        ),
        (
            "a floor in a custom manager",
            floor_in_custom_manager,
            misplaced(f"customManagers[{custom_index}]", "minimumReleaseAge"),
        ),
        (
            "minimumReleaseAgeBehaviour on the security path",
            with_key(
                "minimumReleaseAgeBehaviour",
                "timestamp-optional",
                block="vulnerabilityAlerts",
            ),
            misplaced("vulnerabilityAlerts", "minimumReleaseAgeBehaviour"),
        ),
        (
            "a rule in a manager block, appended after the top-level rules",
            with_key(
                "packageRules",
                [{"matchPackageNames": ["*"], "minimumReleaseAge": "7 days"}],
                block="github-actions",
            ),
            "github-actions.packageRules holds rules outside",
        ),
        (
            "a rule in an update-type block nested in a manager block",
            with_key(
                "major",
                {"packageRules": [{"matchPackageNames": ["*"], "enabled": False}]},
                block="npm",
            ),
            "npm.major.packageRules holds rules outside",
        ),
        (
            "a rule taking its floor from presets",
            with_rule(
                {
                    "matchPackageNames": ["*"],
                    "extends": ["security:minimumReleaseAgeNpm"],
                }
            ),
            f"{appended} extends ['security:minimumReleaseAgeNpm']",
        ),
        (
            "a manager block taking settings from presets",
            with_key("extends", ["security:minimumReleaseAgeNpm"], block="npm"),
            "npm extends ['security:minimumReleaseAgeNpm']",
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
            "no packageRule removes the floor from every update of nanohype/.github",
        ),
        (
            "the action-ref exemption overridden by a later rule naming it",
            later_floor(
                matchManagers=["github-actions"], matchPackageNames=["nanohype/.github"]
            ),
            refloored,
        ),
        (
            "the action-ref exemption overridden by a later rule naming it in other case",
            later_floor(matchPackageNames=["NanoHype/.GitHub"]),
            refloored,
        ),
        (
            "the action-ref exemption overridden by a later '*' rule",
            later_floor(matchPackageNames=["*"]),
            refloored,
        ),
        (
            "the action-ref exemption overridden by a later glob rule",
            later_floor(matchManagers=["github-*"], matchPackageNames=["nanohype/*"]),
            refloored,
        ),
        (
            "the action-ref exemption overridden by a later regex rule",
            later_floor(matchPackageNames=["/^nanohype\\//"]),
            refloored,
        ),
        (
            "the action-ref exemption overridden by a later negated rule",
            later_floor(matchPackageNames=["!lodash"]),
            refloored,
        ),
        (
            "the action-ref exemption overridden by a later rule keyed on depName",
            later_floor(matchPackageNames=["/.+/"], matchDepNames=["nanohype/.github"]),
            refloored,
        ),
        (
            "the action-ref exemption narrowed to some of the ref's updates",
            narrowed_action_exemption(),
            "no packageRule removes the floor from every update of nanohype/.github",
        ),
        (
            "the action ref renamed out from under the exemption",
            with_rule(
                {
                    "matchPackageNames": ["nanohype/.github"],
                    "overridePackageName": "nanohype/renamed",
                },
                at=0,
            ),
            renamed,
        ),
        (
            "another dependency renamed into the exemption",
            with_rule(
                {
                    "matchPackageNames": ["evil/x"],
                    "overrideDepName": "nanohype/.github",
                    "overridePackageName": "nanohype/.github",
                },
                at=0,
            ),
            "sets overrideDepName to 'nanohype/.github', which can give",
        ),
    ]

    keeps: Keeps = [
        (
            "lock file maintenance stating the top-level floor",
            lfm("minimumReleaseAge", cfg.get("minimumReleaseAge")),
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
            "a manager block that leaves the floor alone",
            with_key("rangeStrategy", "pin", block="npm"),
        ),
        (
            "an update-type block that leaves the floor alone",
            with_key("labels", ["deps", "digest"], block="digest"),
        ),
        (
            "a later rule raising the floor for a third-party package",
            later_floor(matchPackageNames=["lodash"]),
        ),
        (
            "a later rule raising the floor by pattern for another manager",
            later_floor(matchManagers=["npm"], matchPackageNames=["/^@aws-sdk\\//"]),
        ),
        (
            "a later '*' rule that excludes the action ref by name",
            later_floor(matchPackageNames=["*", "!nanohype/.github"]),
        ),
        (
            "a '*' rule placed before the action-ref exemption",
            with_rule(
                {"matchPackageNames": ["*"], "minimumReleaseAge": "7 days"}, at=0
            ),
        ),
        (
            "a rename that cannot reach the action ref",
            with_rule(
                {"matchPackageNames": ["evil/x"], "overrideDepName": "evil/renamed"}
            ),
        ),
    ]
    return breaks, keeps


def outcome(cfg: Config) -> tuple[str, str]:
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


def self_test(cfg: Config) -> int:
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
    cfg: Config = json.loads((ROOT / "default.json").read_text())
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
