#!/usr/bin/env python3
"""The rules .editorconfig declares that no formatter owns, read from the tree.

WHY THIS EXISTS

.editorconfig declares charset, line endings, a final newline and no trailing
whitespace for every file in a tree. A code formatter owns one language each --
Terraform, TypeScript, Go -- so everything outside those languages (YAML, HCL,
Markdown, shell, chart templates, JSON that no formatter claims) has nothing
observing those four rules unless something reads the whole tree against them.

WHY IT DECIDES FROM THE TREE

The npm `editorconfig-checker` package is a wrapper. It resolves a release
through the GitHub API and downloads a binary when the check runs; no published
version ships the binary. A gate built on it makes the verdict on a merge depend
on an unauthenticated call to a third party, at the moment a merge is waiting for
it, and that call fails in more than one way: a rate limit on the runner, and an
asset lookup whose glob matches nothing on any platform. Both print as a failing
format check on a tree with no formatting defect, and a lockfile entry for the
wrapper pins none of it.

A gate on the merge path decides from the tree. This reads `.editorconfig` and
the files `git ls-files` names, and opens no socket.

WHAT IT CHECKS

For each file, the properties the matching sections resolve to:

    charset                   utf-8, decoded rather than guessed at, and without
                              a byte-order mark, which is a charset of its own
    end_of_line               lf, so any carriage return is a finding
    insert_final_newline      the last byte is a newline, or under `false` is not
    trim_trailing_whitespace  no space or tab before a line ending

Sections apply in file order and later ones win, which is how `[*.md]` turns
trailing whitespace off for Markdown alone -- two trailing spaces are that
language's hard-break idiom.

WHAT IT REFUSES TO DECIDE, RATHER THAN PASSING

Indentation is delegated to the language formatters, with the owners named in
DELEGATED. Delegated is not ignored: a property in neither table stops the run,
and so does a value outside the ones this decides. A file that only ever matches
sections declaring delegated properties is not counted as checked, and a tree in
which no file was compared against a rule stops the run too.

Every line of the declaration is accounted for. A line parsing as neither a
section header nor a property stops the run rather than being dropped: a header
the reader misses leaves its properties attached to the section above it, so a
rule scoped to one language becomes a rule for the whole tree.

The same for pattern syntax. This resolves a literal name, a `*` inside one path
segment, and a brace list of either. A section naming a directory, a `**`, a `?`
or a character class exits without a verdict, because a pattern read
approximately selects a different set of files than the section declares and
reports success over the difference. A `.editorconfig` below the root exits the
same way: files under it resolve against rules this does not read.

THE EXIT CODES ARE THE POINT

    0  every file matches what .editorconfig declares for it
    1  a file does not, named with its line and the rule
    2  argparse -- an argument this does not take
    3  NOTHING WAS CHECKED

Three is the code a downloading checker cannot produce. Its download fails, the
step goes red, and a tree with no defect is reported as malformed. Anything this
cannot evaluate -- no .editorconfig, a line in it that parses as neither a section
nor a property, a property or a pattern outside what it decides, a tree in which
no file was compared against a rule, an unreadable file, no git -- exits 3 and
says in the same breath that it is not a finding about the tree.

Usage:
    check_editorconfig.py [--root PATH]
    check_editorconfig.py --self-test
"""

from __future__ import annotations

import argparse
import fnmatch
import re
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

# 1 is a finding about the tree and 2 is argparse's usage error, so the fourth
# outcome needs a code of its own. Sharing 2 would make a gate that never ran
# indistinguishable from one handed a flag it does not take, and sharing 1 is the
# defect this gate replaces: a checker that could not run, reported as a tree
# that does not conform.
EXIT_FINDING = 1
EXIT_CANNOT_EVALUATE = 3

# Decided here, against the file's bytes.
IMPLEMENTED = {
    "charset": {"utf-8"},
    "end_of_line": {"lf"},
    "insert_final_newline": {"true", "false"},
    "trim_trailing_whitespace": {"true", "false"},
}

# Owned elsewhere, with the owner named. An entry here is a decision not to
# check, which is different from a property nobody thought about -- and the
# difference is enforced, because a property in neither table stops the run.
DELEGATED = {
    "indent_style": "the formatter for each language, and a Makefile needs tabs in a recipe and "
    "spaces inside its continuation lines",
    "indent_size": "the same owners; the formatters disagree with each other by language, which "
    "is correct, and a single declared width cannot be true for all of them",
}

# The pattern syntax this resolves. Anything else is refused rather than
# approximated: a `/` or a `**` makes a section path-relative, and matching it on
# the basename would select a different set of files than the section names.
UNDECIDED_SYNTAX = re.compile(r"\*\*|/|\?|\[")

# A header may carry a trailing comment. The glob itself may not hold a bare `#`
# or `;`, so a section that does falls through to the refusal below rather than
# being cut in half at a character that was part of the name.
SECTION = re.compile(r"^\[(?P<glob>(?:[^#;]|\\#|\\;)+)\]\s*(?:[#;].*)?$")
# The key is anything up to the separator. Narrowing it to word characters would
# drop a legal property such as `dotnet_diagnostic.CA1822.severity` before it
# could reach the refusal that exists to catch a property this does not decide.
ASSIGNMENT = re.compile(r"^(?P<key>[^=:\s][^=:]*?)\s*[=:]\s*(?P<value>.*)$")
BRACE_LIST = re.compile(r"^(?P<pre>[^{}]*)\{(?P<body>[^{}]*)\}(?P<post>[^{}]*)$")

NEWLINE = b"\n"

# Enough of a file to decide whether it is text. A NUL inside it means bytes no
# line-ending or whitespace rule has an opinion about.
BINARY_SNIFF = 8192


class CannotEvaluate(Exception):
    """Nothing was checked. Distinct from a finding, and it must stay distinct.

    Raised rather than exited so the self-test can put a tree in front of the
    same code path and read the outcome, instead of mutating the tree this gate
    is meant to be reading.
    """


class Verdict:
    """What one run of `evaluate` decided, and how far it actually reached.

    `applied` is the properties compared against at least one file's bytes. It is
    reported rather than the IMPLEMENTED table, because naming a rule the run
    never applied is the claim this gate exists to stop making.
    """

    def __init__(self, code: int, problems: list, read: int, applied: set) -> None:
        self.code = code
        self.problems = problems
        self.read = read
        self.applied = applied


def cannot_evaluate(*lines: str) -> None:
    raise CannotEvaluate("\n".join(lines))


def report_cannot_evaluate(*lines: str) -> int:
    print(f"{sys.argv[0]}: NOTHING WAS CHECKED --", file=sys.stderr)
    for block in lines:
        for line in block.splitlines():
            print(f"  {line}", file=sys.stderr)
    print(
        "\n  This is not a finding about the tree. No verdict was reached about any file.",
        file=sys.stderr,
    )
    return EXIT_CANNOT_EVALUATE


def require_git() -> None:
    """Assert git exists AND runs, or exit 3 naming it.

    `shutil.which` proves a name resolves on PATH, not that it runs: a shim
    pointing at an uninstalled version manager resolves and then fails at the
    first real call, where the failure is indistinguishable from a rejection. So
    the probe runs it.
    """
    reason = (
        "git is needed to list the files under version control, which is the set this reads"
    )
    if shutil.which("git") is None:
        print(
            f"{sys.argv[0]}: NOTHING WAS CHECKED -- {reason}, and it is not on PATH.\n"
            "  This is not a finding about the tree. No file was compared against anything.",
            file=sys.stderr,
        )
        sys.exit(EXIT_CANNOT_EVALUATE)
    try:
        probe = subprocess.run(
            ["git", "--version"], capture_output=True, text=True, timeout=60, check=False
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(
            f"{sys.argv[0]}: NOTHING WAS CHECKED -- git resolves on PATH but could not be run "
            f"({exc}).\n"
            "  This is not a finding about the tree. No file was compared against anything.",
            file=sys.stderr,
        )
        sys.exit(EXIT_CANNOT_EVALUATE)
    if probe.returncode != 0:
        print(
            f"{sys.argv[0]}: NOTHING WAS CHECKED -- `git --version` exited "
            f"{probe.returncode}, so git resolves but does not run.\n"
            f"  git said: {probe.stderr.strip()[:200]}\n"
            "  This is not a finding about the tree. No file was compared against anything.",
            file=sys.stderr,
        )
        sys.exit(EXIT_CANNOT_EVALUATE)


def parse_config(text: str) -> list:
    """Sections in file order, each with its properties.

    Every line is accounted for. Dropping one that parses as neither a header nor
    an assignment is how a declaration silently becomes a different declaration:
    a header the reader misses leaves its properties in the section above, so a
    rule scoped to Markdown turns into a rule for the whole tree and the gate
    reports success over the difference. A line this cannot read stops the run.
    """
    sections = []
    current = None
    for number, raw in enumerate(text.lstrip("\ufeff").splitlines(), start=1):
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        found = SECTION.match(line)
        if found:
            current = {}
            sections.append((found.group("glob"), current))
            continue
        assignment = ASSIGNMENT.match(line)
        if not assignment:
            cannot_evaluate(
                f".editorconfig line {number} is neither a section nor a property: {line!r}",
                "A line this cannot read leaves the properties after it attached to whichever",
                "section came before, which is a different declaration than the one on disk.",
            )
        key = assignment.group("key").lower()
        value = assignment.group("value").strip().lower()
        if current is None:
            # `root` is the one key that belongs before any section. Anything else
            # there declares something for a scope this does not model.
            if key != "root":
                cannot_evaluate(
                    f".editorconfig line {number} declares `{key}` before any section.",
                    "Only `root` belongs there; a property outside a section names no files.",
                )
            continue
        current[key] = value
    return sections


def alternatives(glob: str) -> list:
    """A brace list becomes its members; anything else is itself.

    One list, one level, at any position: `{Makefile,*.mk}` is the form that
    names a file carrying no extension, and `*.{yml,yaml}` the form that names
    one spelling of a suffix. A nested list, an empty member, or a brace holding
    no comma returns nothing, which the caller reads as syntax this does not
    decide -- a lone `{name}` is literal text to .editorconfig and expanding it
    would match something else.
    """
    if "{" not in glob and "}" not in glob:
        return [glob]
    found = BRACE_LIST.match(glob)
    if not found:
        return []
    members = [member.strip() for member in found.group("body").split(",")]
    if len(members) < 2 or not all(members):
        return []
    return [found.group("pre") + member + found.group("post") for member in members]


def resolve(path: str, sections: list) -> dict:
    """Every matching section merged in order, later winning.

    Matched on the basename, which is the whole of what a section without a `/`
    selects. A section carrying one never reaches here.
    """
    out = {}
    name = path.rsplit("/", 1)[-1]
    for glob, properties in sections:
        if any(fnmatch.fnmatchcase(name, alt) for alt in alternatives(glob)):
            out.update(properties)
    return out


def tracked_files(root: Path) -> list:
    try:
        proc = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        cannot_evaluate(
            f"`git ls-files` could not be run in {root} ({exc}), so the set of files to read is "
            "unknown."
        )
    if proc.returncode != 0:
        cannot_evaluate(
            f"`git ls-files` failed in {root}, so the set of files to read is unknown.",
            f"git said: {proc.stderr.strip()[:200]}",
        )
    return [name for name in proc.stdout.split("\0") if name]


def inspect(path: Path, rules: dict, name: str, problems: list) -> set:
    """Read one file against its resolved rules.

    Returns the properties actually compared against its bytes. An empty set means
    nothing was compared, which is what the caller counts: a file matching only
    sections that delegate, or one holding bytes no line-ending rule describes,
    has not been checked, and counting it as checked is how a gate reports four
    rules held over a tree it never read.
    """
    try:
        data = path.read_bytes()
    except OSError as exc:
        # Not a finding. A file the gate could not open has not been compared
        # against anything, and exiting the way a malformed file exits would put
        # the blame on the branch.
        cannot_evaluate(f"{name} could not be read ({exc}), so the tree was not fully compared.")
    if not data:
        return set()
    if b"\0" in data[:BINARY_SNIFF]:
        return set()

    compared = set()

    if rules.get("charset") == "utf-8":
        compared.add("charset")
        if data.startswith(b"\xef\xbb\xbf"):
            problems.append(
                f"{name}:1: starts with a utf-8 byte-order mark, and charset is utf-8 rather "
                "than utf-8-bom"
            )
        else:
            try:
                data.decode("utf-8")
            except UnicodeDecodeError as exc:
                problems.append(
                    f"{name}: is not valid utf-8 ({exc.reason} at byte {exc.start}), and charset "
                    "is utf-8"
                )
                return compared

    text = data.decode("utf-8", errors="replace")
    lines = text.split("\n")

    if rules.get("end_of_line") == "lf":
        compared.add("end_of_line")
        # Any CR at all, not only one before a LF. A file separated by bare CRs
        # is one line to a reader splitting on LF, so asking whether a line ends
        # with CR would examine nothing and report the file as conforming.
        carriage = data.find(b"\r")
        if carriage != -1:
            line_number = data[:carriage].count(NEWLINE) + 1
            problems.append(
                f"{name}:{line_number}: carries a carriage return, and end_of_line is lf"
            )

    final_newline = rules.get("insert_final_newline")
    if final_newline == "true":
        compared.add("insert_final_newline")
        if not data.endswith(b"\n"):
            problems.append(
                f"{name}:{len(lines)}: has no final newline, and insert_final_newline is true"
            )
    elif final_newline == "false":
        compared.add("insert_final_newline")
        # The mirror is the rule, not the absence of one. A format that closes
        # without a newline says so here, and an editor that adds one back has
        # changed the file into something its own tooling rewrites.
        if data.endswith(b"\n"):
            problems.append(
                f"{name}:{len(lines) - 1}: ends with a final newline, and insert_final_newline "
                "is false"
            )

    if rules.get("trim_trailing_whitespace") == "true":
        compared.add("trim_trailing_whitespace")
        for number, line in enumerate(lines, start=1):
            stripped = line.rstrip("\r")
            if stripped and stripped[-1] in " \t":
                problems.append(
                    f"{name}:{number}: has trailing whitespace, and trim_trailing_whitespace is "
                    "true"
                )
                break

    return compared


def evaluate(root: Path) -> Verdict:
    """Read `root` against its .editorconfig. Raises CannotEvaluate for the rest.

    Reporting belongs to the caller: the self-test drives this against crafted
    trees, and a function printing its own verdict would bury the one the run is
    about.
    """
    if not root.is_dir():
        cannot_evaluate(f"{root} is not a directory, so there is no tree to read.")

    config = root / ".editorconfig"
    if not config.is_file():
        cannot_evaluate(f"{config} does not exist, so there are no rules to check against.")
    try:
        declared = config.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        cannot_evaluate(f"{config} could not be read as utf-8 ({exc}).")
    sections = parse_config(declared)
    if not sections:
        cannot_evaluate(f"{config} declares no section, so it matches no file.")

    for glob, properties in sections:
        if UNDECIDED_SYNTAX.search(glob) or not alternatives(glob):
            cannot_evaluate(
                f"section [{glob}] uses pattern syntax this does not decide.",
                "A literal name, a `*` inside one path segment, and a brace list of either are "
                "what it",
                "resolves. Matching anything else on the basename would read a different set of "
                "files than",
                "the section names, and report success over the difference.",
            )
        for key in properties:
            if key in IMPLEMENTED or key in DELEGATED:
                continue
            cannot_evaluate(
                f"section [{glob}] declares `{key}`, which this neither checks nor delegates.",
                "Passing over it would report the tree as matching a rule nothing read.",
                "Implement it, or record who owns it in DELEGATED with the reason.",
            )
        for key, value in properties.items():
            allowed = IMPLEMENTED.get(key)
            if allowed is not None and value not in allowed:
                cannot_evaluate(
                    f"section [{glob}] sets `{key} = {value}`, and this decides {sorted(allowed)}.",
                    "A value it cannot check is not a value it may skip.",
                )

    files = tracked_files(root)
    if not files:
        cannot_evaluate(f"`git ls-files` named no file in {root}, so nothing was read.")

    nested = sorted(name for name in files if name.endswith(".editorconfig") and "/" in name)
    if nested:
        cannot_evaluate(
            f"{nested[0]} declares rules for the files beneath it, and this reads only the one at "
            "the root.",
            "Every file under that directory would be checked against rules this never read, and "
            "reported",
            "as matching them.",
        )

    problems = []
    applied = set()
    read = 0
    for name in files:
        path = root / name
        if path.is_symlink():
            continue  # its content is a path, not the bytes any of these rules describe
        if not path.is_file():
            continue  # a submodule, or a path staged as deleted
        rules = resolve(name, sections)
        if not set(rules) & set(IMPLEMENTED):
            continue  # every property matching it is delegated, so nothing here compares it
        compared = inspect(path, rules, name, problems)
        if compared:
            read += 1
            applied |= compared

    if not read:
        cannot_evaluate(
            f"{len(files)} tracked path(s) in {root}, and not one was compared against a rule.",
            "Either every section that matches them delegates its properties, or the files hold",
            "bytes no charset, line-ending or whitespace rule describes. Reporting success here",
            "would name rules nothing read.",
        )

    return Verdict(EXIT_FINDING if problems else 0, problems, read, applied)


def main(root: Path) -> int:
    require_git()
    try:
        verdict = evaluate(root)
    except CannotEvaluate as why:
        return report_cannot_evaluate(str(why))
    except Exception:  # noqa: BLE001 - see below
        # 1 means a file in the branch is malformed, and an unhandled exception
        # exits 1 too. Every one of them would be reported as a formatting defect
        # inside a required gate, on a tree the gate never finished reading. The
        # class is closed here rather than one call site at a time.
        return report_cannot_evaluate(
            "the gate raised while reading the tree, so it did not finish comparing it.",
            traceback.format_exc().rstrip(),
        )

    if verdict.code:
        broken = {problem.split(":", 1)[0] for problem in verdict.problems}
        print(
            f".editorconfig declares rules {len(broken)} file(s) do not match, in "
            f"{len(verdict.problems)} place(s):\n",
            file=sys.stderr,
        )
        for problem in verdict.problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "\nEach is charset, line ending, final newline or trailing whitespace -- the rules no "
            "formatter owns. Fix the file; the declaration is in .editorconfig.",
            file=sys.stderr,
        )
        return verdict.code

    print(
        f"{verdict.read} tracked file(s) match what .editorconfig declares for them: "
        f"{', '.join(sorted(verdict.applied))}."
    )
    print(
        "  delegated to the language formatters, and not checked here: "
        f"{', '.join(sorted(DELEGATED))}"
    )
    return 0


# One tree per verdict this gate must be able to reach. A gate nobody has watched
# fail is not known to be a gate, and the two that must stay apart -- a tree that
# breaks a rule, and a ruleset this cannot decide -- are the reason it is here.
#
# (label, .editorconfig text or None, files, expected exit, text it must say),
# and optionally a sixth element naming the files to stage. Absent, everything is
# staged, which is what a checkout looks like; the two cases about a tree this
# reaches nothing in need an index that names less than the directory holds.
CASES = [
    (
        "a tree that matches its own declaration",
        "[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\n"
        "trim_trailing_whitespace = true\n",
        {"a.yaml": "key: value\n"},
        0,
        "",
    ),
    (
        "trailing whitespace",
        "[*]\ntrim_trailing_whitespace = true\n",
        {"a.yaml": "key: value \n"},
        EXIT_FINDING,
        "a.yaml:1: has trailing whitespace",
    ),
    (
        "no final newline",
        "[*]\ninsert_final_newline = true\n",
        {"a.yaml": "key: value"},
        EXIT_FINDING,
        "a.yaml:1: has no final newline",
    ),
    (
        "a CRLF line ending",
        "[*]\nend_of_line = lf\n",
        {"a.yaml": "key: value\r\n"},
        EXIT_FINDING,
        "a.yaml:1: carries a carriage return",
    ),
    (
        "bytes that are not utf-8",
        "[*]\ncharset = utf-8\n",
        {"a.yaml": b"key: caf\xe9\n"},
        EXIT_FINDING,
        "is not valid utf-8",
    ),
    (
        "a later section turning a rule off, which is how markdown keeps its hard breaks",
        "[*]\ntrim_trailing_whitespace = true\n\n[*.md]\ntrim_trailing_whitespace = false\n",
        {"a.md": "line  \n"},
        0,
        "",
    ),
    (
        "a later section turning the final newline off, which is how a generated format stays put",
        "[*]\ninsert_final_newline = true\n\n[*.excalidraw]\ninsert_final_newline = false\n",
        {"a.excalidraw": "{}"},
        0,
        "",
    ),
    (
        "a brace list, the form that names a file carrying no extension",
        "[*]\ntrim_trailing_whitespace = false\n\n[{Makefile,*.mk}]\n"
        "trim_trailing_whitespace = true\n",
        {"Makefile": "all: \n"},
        EXIT_FINDING,
        "Makefile:1: has trailing whitespace",
    ),
    (
        "a brace list after a prefix, the form that names one spelling of a suffix",
        "[*]\ntrim_trailing_whitespace = false\n\n[*.{yml,yaml}]\ntrim_trailing_whitespace = true\n",
        {"a.yml": "key: value \n", "b.yaml": "key: value\n"},
        EXIT_FINDING,
        "a.yml:1: has trailing whitespace",
    ),
    (
        "a binary file, which no line-ending rule describes",
        "[*]\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n",
        {"a.yaml": "key: value\n", "logo.bin": b"\x89PNG\x00\x1a\n\x00 "},
        0,
        "",
    ),
    (
        "a section that only delegates, so nothing in the tree is compared",
        "[*]\nindent_style = space\nindent_size = 2\n",
        {"a.yaml": "key: value \n"},
        EXIT_CANNOT_EVALUATE,
        "not one was compared against a rule",
    ),
    (
        "a final newline where the declaration says there is none",
        "[*]\ninsert_final_newline = true\n\n[*.excalidraw]\ninsert_final_newline = false\n",
        {"a.excalidraw": "{}\n"},
        EXIT_FINDING,
        "a.excalidraw:1: ends with a final newline, and insert_final_newline is false",
    ),
    (
        "a byte-order mark, which is a charset of its own",
        "[*]\ncharset = utf-8\n",
        {"a.yaml": b"\xef\xbb\xbfkey: value\n"},
        EXIT_FINDING,
        "starts with a utf-8 byte-order mark",
    ),
    (
        "a carriage return used as the line separator, which splitting on LF cannot see",
        "[*]\nend_of_line = lf\n",
        {"a.yaml": b"one\rtwo\rthree\n"},
        EXIT_FINDING,
        "a.yaml:1: carries a carriage return",
    ),
    (
        "a comment after a section header, which must not merge it into the section above",
        "[*]\ntrim_trailing_whitespace = true\n\n[*.md]  # markdown keeps its hard breaks\n"
        "trim_trailing_whitespace = false\n",
        {"a.md": "line  \n", "a.yaml": "key: value \n"},
        EXIT_FINDING,
        "a.yaml:1: has trailing whitespace",
    ),
    (
        "a property line missing its separator, which would delete the rule",
        "[*]\ntrim_trailing_whitespace true\n",
        {"a.yaml": "key: value \n"},
        EXIT_CANNOT_EVALUATE,
        "neither a section nor a property",
    ),
    (
        "a property named outside the word characters, which must still reach the refusal",
        "[*]\nmax-line-length = 80\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "neither checks nor delegates",
    ),
    (
        "a property declared before any section, which names no files",
        "indent_style = space\n\n[*]\ntrim_trailing_whitespace = true\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "before any section",
    ),
    (
        "a byte-order mark on the declaration itself, which must not delete its first section",
        "\ufeff[*]\ntrim_trailing_whitespace = true\n",
        {"a.yaml": "key: value \n"},
        EXIT_FINDING,
        "a.yaml:1: has trailing whitespace",
    ),
    (
        "a property the gate neither checks nor delegates",
        "[*]\nmax_line_length = 80\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "neither checks nor delegates",
    ),
    (
        "a value the gate does not decide",
        "[*]\nend_of_line = crlf\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "and this decides",
    ),
    (
        "a path-relative section, which would read a different set of files",
        "[*]\ntrim_trailing_whitespace = true\n\n[charts/**/*.yaml]\ncharset = utf-8\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "pattern syntax this does not decide",
    ),
    (
        "a nested brace list, which this expands one level",
        "[*]\ntrim_trailing_whitespace = true\n\n[{a,{b,c}}]\ncharset = utf-8\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "pattern syntax this does not decide",
    ),
    (
        "a brace holding no comma, which .editorconfig reads as literal text",
        "[*]\ntrim_trailing_whitespace = true\n\n[{a}]\ncharset = utf-8\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "pattern syntax this does not decide",
    ),
    (
        "a .editorconfig below the root, whose rules this does not read",
        "[*]\ntrim_trailing_whitespace = true\n",
        {"a.yaml": "key: value\n", "charts/.editorconfig": "[*]\ncharset = utf-8\n"},
        EXIT_CANNOT_EVALUATE,
        "declares rules for the files beneath it",
    ),
    (
        "no declaration at all",
        None,
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "does not exist",
    ),
    (
        "a declaration matching nothing",
        "root = true\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "declares no section",
    ),
    (
        "a tree holding nothing this can read, which is not a tree that conforms",
        "[*]\ninsert_final_newline = true\n",
        {"logo.bin": b"\x89PNG\x00\x1a\n\x00 "},
        EXIT_CANNOT_EVALUATE,
        "not one was compared against a rule",
        ["logo.bin"],
    ),
    (
        "a tree git names nothing in",
        "[*]\ntrim_trailing_whitespace = true\n",
        {"a.yaml": "key: value\n"},
        EXIT_CANNOT_EVALUATE,
        "named no file",
        [],
    ),
]


def build_tree(root: Path, config, files: dict, stage=None) -> None:
    """A crafted tree, written as bytes and staged so `git ls-files` names it.

    Bytes, not text: a case whose whole subject is a CR before a LF cannot go
    through a layer that translates line endings.

    `stage` names what the index carries, and defaults to everything on disk. The
    two are separable because what this gate reads is the index, not the
    directory, and a tree it reaches nothing in is a verdict it has to produce.
    """
    if config is not None:
        (root / ".editorconfig").write_bytes(config.encode("utf-8"))
    for name, body in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body if isinstance(body, bytes) else body.encode("utf-8"))
    subprocess.run(["git", "init", "-q"], cwd=str(root), capture_output=True, check=True)
    add = ["git", "add", "-A"] if stage is None else ["git", "add", "--"] + list(stage)
    if stage is None or stage:
        subprocess.run(add, cwd=str(root), capture_output=True, check=True)


def self_test() -> int:
    """Each verdict, against a tree built for it.

    The cases that matter are the last group. A gate whose checker is unavailable
    and a gate whose tree is malformed both exit non-zero, and the reader of a red
    build can act on neither until they are told apart. A checker downloaded when
    the check runs cannot tell them apart at all: the download fails, the step
    says `format`, and the tree it never read takes the blame. So the
    cannot-evaluate cases are asserted here by exit code AND by what they say.

    Crafted trees, not the tree under test. A gate that mutates what it is meant
    to be reading cannot run beside anything else.
    """
    require_git()
    failures = 0
    for case in CASES:
        label, config, files, want_code, want_text = case[:5]
        stage = case[5] if len(case) > 5 else None
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            build_tree(root, config, files, stage)
            problems = []
            try:
                verdict = evaluate(root)
                code, said = verdict.code, "\n".join(verdict.problems)
                problems = verdict.problems
            except CannotEvaluate as why:
                code, said = EXIT_CANNOT_EVALUATE, str(why)

        if code != want_code:
            failures += 1
            print(f"FAIL  {label}: exit {code}, expected {want_code}", file=sys.stderr)
            print(f"      said: {said or '(nothing)'}", file=sys.stderr)
            continue
        if want_text and want_text not in said:
            failures += 1
            print(
                f"FAIL  {label}: exit {code} was right and it said the wrong thing",
                file=sys.stderr,
            )
            print(f"      expected to contain: {want_text}", file=sys.stderr)
            print(f"      said: {said or '(nothing)'}", file=sys.stderr)
            continue
        if want_code == EXIT_CANNOT_EVALUATE and problems:
            failures += 1
            print(
                f"FAIL  {label}: reported {len(problems)} finding(s) about the tree while saying "
                "nothing was checked",
                file=sys.stderr,
            )

    kinds = {case[3] for case in CASES}
    for code, why in (
        (
            0,
            "a self-test with no passing case cannot tell a gate that refuses everything from a "
            "correct one",
        ),
        (EXIT_FINDING, "with no failing case it cannot tell one that accepts everything"),
        (
            EXIT_CANNOT_EVALUATE,
            "and with no could-not-evaluate case the distinction this gate exists to keep is "
            "untested",
        ),
    ):
        if code not in kinds:
            failures += 1
            print(f"FAIL  no case expects exit {code} -- {why}", file=sys.stderr)

    if failures:
        print(f"\n{failures} self-test case(s) failed.", file=sys.stderr)
        return EXIT_FINDING
    print(
        f"self-test: {len(CASES)} case(s), verdicts {sorted(kinds)}, each with the text it must "
        "say."
    )
    return 0


# Argument parsing is strict: a gate that ignores argv cannot tell a renamed flag
# from a correct one, so a CI step naming a mode this does not have would keep
# exiting 0 over a tree it never read.
def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--root",
        default=".",
        help="the tree to read: its .editorconfig, and the files git tracks under it "
        "(default: the working directory)",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run this gate against crafted trees and require each verdict, including the two it "
        "must keep apart: a tree that breaks a rule, and a ruleset it cannot decide",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if args.self_test:
        sys.exit(self_test())
    sys.exit(main(Path(args.root).resolve()))
