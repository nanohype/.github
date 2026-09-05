#!/usr/bin/env python3
"""The gate as consumers run it: a process, invoked by argv, judged by exit code.

`--self-test` proves the reading. It cannot prove the things that live outside
the reading and still decide whether a merge is blocked correctly:

  - which exit code reaches the shell, and therefore which verdict a red check
    means. A gate that could not run must not exit 1, because 1 is how it says a
    file in the branch is malformed;
  - that argv is parsed strictly, so a step naming a mode this does not have
    fails instead of exiting 0 over an unread tree;
  - that the tree it reads comes from `--root` rather than from where the script
    happens to live, which is what lets one copy serve every repository;
  - that it decides with no network at all, which is the property the package it
    replaces could not hold;
  - that the .editorconfig every repository in this org carries is one it decides
    rather than one it refuses.

It reads the gate beside it, so the working directory does not matter:

    python3 actions/editorconfig-gate/test_check_editorconfig.py   # from the repository root
"""

from __future__ import annotations

import ast
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
GATE = HERE / "check_editorconfig.py"
MANIFEST = HERE / "action.yml"

EXIT_CLEAN = 0
EXIT_FINDING = 1
EXIT_USAGE = 2
EXIT_CANNOT_EVALUATE = 3

# The declaration every repository in this org carries. It is a fixture here so
# that a section added to it upstream and not decided by this gate fails on a
# pull request against this repository, rather than on a merge in the five that
# consume the gate.
ORG_CONFIG = """\
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.py]
indent_size = 4

[*.go]
indent_style = tab

[{Makefile,*.mk}]
indent_style = tab

[*.excalidraw]
insert_final_newline = false

[*.md]
trim_trailing_whitespace = false
"""

ORG_TREE = {
    "app.ts": "export const a = 1;\n",
    "main.go": "package main\n",
    "Makefile": "all:\n\techo hi\n",
    "build.mk": "X := 1\n",
    "tool.py": "x = 1\n",
    # Both idioms the config exists to protect: a markdown hard break, and a
    # generated format that closes without a final newline.
    "README.md": "a line ending in a hard break  \nand the line it breaks to\n",
    "diagram.excalidraw": '{"type":"excalidraw"}',
    "chart.yaml": "key: value\n",
}


def build(root: Path, config, files: dict, init_git: bool = True) -> None:
    if config is not None:
        (root / ".editorconfig").write_bytes(config.encode("utf-8"))
    for name, body in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body if isinstance(body, bytes) else body.encode("utf-8"))
    if init_git:
        subprocess.run(["git", "init", "-q"], cwd=str(root), capture_output=True, check=True)
        subprocess.run(["git", "add", "-A"], cwd=str(root), capture_output=True, check=True)


def wrapper_body():
    """The shell the composite step runs, lifted out of the manifest.

    Read rather than restated. The wrapper is where the exit code becomes the
    thing a reader sees, so a copy of it here would be the one version nothing
    checks. Extraction is deliberately strict: a manifest this cannot find the
    block in fails the run instead of silently testing an empty script.
    """
    lines = MANIFEST.read_text(encoding="utf-8").splitlines()
    starts = [i for i, line in enumerate(lines) if line.strip() == "run: |"]
    if len(starts) != 1:
        raise SystemExit(
            f"{MANIFEST} holds {len(starts)} `run: |` blocks; this reads exactly one"
        )
    head = lines[starts[0]]
    indent = len(head) - len(head.lstrip()) + 2
    body = []
    for line in lines[starts[0] + 1 :]:
        if line.strip() and not line.startswith(" " * indent):
            break
        body.append(line[indent:])
    if not [line for line in body if line.strip()]:
        raise SystemExit(f"{MANIFEST}: the `run:` block came back empty")
    return "\n".join(body) + "\n"


def run_wrapper(script: Path, self_test: str, tree: Path):
    """The step as Actions runs it: `bash -e -o pipefail`, which is the hazard.

    Under `-e` the gate's own non-zero exit ends the step before the wrapper can
    read the code, and the annotation naming which verdict it is never prints —
    leaving a reader with a red check and no way to tell a malformed file from a
    checker that did not run.
    """
    env = dict(os.environ, SELF_TEST=self_test, TREE=str(tree), GATE=str(GATE))
    proc = subprocess.run(
        ["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", str(script)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    return proc.returncode, proc.stdout + proc.stderr


def annotations(said: str) -> list:
    """The `::error` lines only.

    What a reader of a red check sees is the annotation, not the step log, so
    the assertion that the two non-zero verdicts stay apart has to be made
    against the annotation. The gate's own stderr says NOTHING WAS CHECKED on
    both sides of a badly written wrapper, and asserting on the log would pass
    over a wrapper that stopped telling them apart.
    """
    return [line for line in said.splitlines() if line.startswith("::error")]


def run(args, cwd=None, env=None, wrapper=None):
    command = list(wrapper or []) + [sys.executable, str(GATE)] + list(args)
    proc = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    return proc.returncode, proc.stdout + proc.stderr


def no_network_env():
    """An interpreter that cannot open a socket, so a gate that needs one says so.

    The package this replaces resolved a release and downloaded a binary when the
    check ran. Asserting the replacement does not is the whole property, and the
    way to assert it is to take the capability away and require the same verdict.
    """
    home = tempfile.mkdtemp(prefix="no-network-")
    (Path(home) / "sitecustomize.py").write_text(
        "import socket, urllib.request\n"
        "def _refuse(*a, **k):\n"
        "    raise OSError('the gate opened a socket, and it is not allowed one')\n"
        "socket.socket = _refuse\n"
        "socket.create_connection = _refuse\n"
        "socket.socketpair = _refuse\n"
        "urllib.request.urlopen = _refuse\n",
        encoding="utf-8",
    )
    env = dict(os.environ)
    env["PYTHONPATH"] = home + os.pathsep + env.get("PYTHONPATH", "")
    return env, home


def netns_wrapper():
    """`unshare` with no network at all, when the kernel allows it unprivileged.

    Blocking sockets inside the interpreter proves the Python opens none. A
    network namespace with no interface proves it of every process the gate
    starts, git included. Returns the wrapper and why it is or is not available,
    so a run that got the weaker of the two proofs says which one it got instead
    of ending on a line that reads as full coverage.
    """
    if not shutil.which("unshare"):
        return None, "`unshare` is not on PATH"
    probe = subprocess.run(
        ["unshare", "--user", "--map-root-user", "--net", "true"],
        capture_output=True,
        text=True,
        check=False,
    )
    if probe.returncode != 0:
        return None, (
            f"the kernel refused an unprivileged network namespace: "
            f"{probe.stderr.strip()[:120] or f'exit {probe.returncode}'}"
        )
    return ["unshare", "--user", "--map-root-user", "--net"], "available"


class Checks:
    """Results, plus which optional proofs ran.

    A proof that quietly did not run leaves a summary line reading as full
    coverage. The ones that depend on the machine are named either way, and the
    closing line says which of them this run actually got.
    """

    def __init__(self) -> None:
        self.failures = 0
        self.ran = []
        self.missed = []

    def covered(self, proof: str) -> None:
        self.ran.append(proof)

    def skipped(self, proof: str, why: str) -> None:
        self.missed.append(f"{proof} ({why})")
        print(f"  --    {proof} did not run: {why}")

    def that(self, label: str, ok: bool, detail: str = "") -> None:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
        if not ok:
            self.failures += 1
            if detail:
                for line in detail.strip().splitlines()[:12]:
                    print(f"        {line}")

    def verdict(self, label, args, want_code, want_text="", cwd=None, env=None, wrapper=None):
        code, said = run(args, cwd=cwd, env=env, wrapper=wrapper)
        ok = code == want_code and (not want_text or want_text in said)
        self.that(
            f"{label:<58} exit={code}",
            ok,
            f"wanted exit {want_code} containing {want_text!r}\ngot: {said}",
        )
        return code, said


def main() -> int:
    check = Checks()
    print(f"the gate as a process: {GATE}")

    with tempfile.TemporaryDirectory() as raw:
        clean = Path(raw) / "clean"
        clean.mkdir()
        build(clean, ORG_CONFIG, ORG_TREE)

        dirty = Path(raw) / "dirty"
        dirty.mkdir()
        build(dirty, ORG_CONFIG, dict(ORG_TREE, **{"chart.yaml": "key: value \n"}))

        undecidable = Path(raw) / "undecidable"
        undecidable.mkdir()
        build(
            undecidable,
            "[*]\ntrim_trailing_whitespace = true\n\n[charts/**/*.yaml]\ncharset = utf-8\n",
            {"chart.yaml": "key: value \n"},
        )

        undeclared = Path(raw) / "undeclared"
        undeclared.mkdir()
        build(undeclared, None, {"chart.yaml": "key: value\n"})

        untracked = Path(raw) / "untracked"
        untracked.mkdir()
        build(untracked, ORG_CONFIG, ORG_TREE, init_git=False)

        # The reading itself, and its own coverage assertion.
        _, said = check.verdict(
            "the gate self-tests before it is trusted", ["--self-test"], EXIT_CLEAN
        )
        check.that(
            "the self-test says which verdicts it covered",
            "verdicts [0, 1, 3]" in said,
            said,
        )
        # The coverage assertion, exercised rather than trusted. Narrow the case
        # set until it stops reaching one of the three verdicts and the
        # self-test has to say so — otherwise a case set that quietly stopped
        # covering rejection would keep reporting that every case passes.
        narrowed = (
            "import importlib.util, sys\n"
            f"spec = importlib.util.spec_from_file_location('gate', {str(GATE)!r})\n"
            "gate = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(gate)\n"
            "gate.CASES = [c for c in gate.CASES if c[3] != gate.EXIT_FINDING]\n"
            "sys.exit(gate.self_test())\n"
        )
        narrowed_run = subprocess.run(
            [sys.executable, "-c", narrowed], capture_output=True, text=True, check=False
        )
        check.that(
            "a case set that stops reaching a verdict fails the self-test",
            narrowed_run.returncode != 0
            and "no case expects exit 1" in narrowed_run.stdout + narrowed_run.stderr,
            narrowed_run.stdout + narrowed_run.stderr,
        )

        # The org declaration is one this decides, on a tree exercising every
        # section of it.
        check.verdict(
            "the org .editorconfig is decided, not refused",
            ["--root", str(clean)],
            EXIT_CLEAN,
            "match what .editorconfig declares",
        )

        # A finding names the file, the line and the rule, because a reader who
        # cannot act on the message has been told the branch is broken and
        # nothing else.
        _, said = check.verdict(
            "a planted violation is refused",
            ["--root", str(dirty)],
            EXIT_FINDING,
            "chart.yaml:1: has trailing whitespace",
        )
        check.that(
            "the finding names the rule that refused it",
            "trim_trailing_whitespace is true" in said,
            said,
        )

        # The two non-zero verdicts, kept apart. This is the defect the gate
        # exists to end: a checker that could not run, exiting the way a
        # malformed tree exits.
        check.verdict(
            "no .editorconfig is not a malformed tree",
            ["--root", str(undeclared)],
            EXIT_CANNOT_EVALUATE,
            "NOTHING WAS CHECKED",
        )
        # GIT_CEILING_DIRECTORIES is git's own knob for "stop looking upward
        # here", not a seam invented for this. Without it the case would depend
        # on TMPDIR happening to sit outside every repository, and would quietly
        # start reading the enclosing one on a machine where it does not.
        outside = dict(os.environ, GIT_CEILING_DIRECTORIES=str(Path(raw)))
        check.verdict(
            "a tree git does not track is not a malformed tree",
            ["--root", str(untracked)],
            EXIT_CANNOT_EVALUATE,
            "NOTHING WAS CHECKED",
            env=outside,
        )
        check.verdict(
            "a --root that does not exist is not a malformed tree",
            ["--root", str(Path(raw) / "absent")],
            EXIT_CANNOT_EVALUATE,
            "is not a directory",
        )
        # A ruleset with one undecidable section over a tree that also has a real
        # finding: the undecidable half wins. Reporting the half it could read
        # would claim a verdict over files it never compared.
        check.verdict(
            "a section it cannot decide outranks a finding it could make",
            ["--root", str(undecidable)],
            EXIT_CANNOT_EVALUATE,
            "pattern syntax this does not decide",
        )

        # The success line names the rules this run applied, not the table of
        # rules the gate knows. Naming the table is how a run that compared one
        # property reports four, which is the claim the read counter exists to
        # stop the gate making.
        narrow = Path(raw) / "narrow"
        narrow.mkdir()
        build(narrow, "[*]\ninsert_final_newline = true\n", {"a.yaml": "key: value\n"})
        _, said = check.verdict(
            "success names the rules it applied, not the ones it knows",
            ["--root", str(narrow)],
            EXIT_CLEAN,
            "insert_final_newline.",
        )
        check.that(
            "and names none it did not apply",
            not any(rule in said.split("declares for them:")[-1]
                    for rule in ("charset", "end_of_line", "trim_trailing_whitespace")),
            said,
        )

        # A file the gate cannot open is not a malformed file. Exit 1 is reserved
        # for a finding, and a required gate that spends it on an I/O error blames
        # the branch for the runner.
        unreadable = Path(raw) / "unreadable"
        unreadable.mkdir()
        build(unreadable, ORG_CONFIG, dict(ORG_TREE))
        locked = unreadable / "chart.yaml"
        locked.chmod(0o000)
        try:
            readable_by_root = os.access(str(locked), os.R_OK)
            if readable_by_root:
                check.skipped(
                    "the unreadable-file proof", "this process can read a mode-000 file"
                )
            else:
                check.verdict(
                    "a file it cannot open is not a malformed file",
                    ["--root", str(unreadable)],
                    EXIT_CANNOT_EVALUATE,
                    "could not be read",
                )
                check.covered("the unreadable-file proof")
        finally:
            locked.chmod(0o644)

        # argv, strictly. A gate that ignores its arguments cannot tell a renamed
        # flag from a correct one and keeps exiting 0 over a tree it never read.
        check.verdict(
            "a flag it does not have is a usage error",
            ["--disable-indentation", "--root", str(dirty)],
            EXIT_USAGE,
        )
        check.verdict("a positional it does not take is refused", [str(dirty)], EXIT_USAGE)

        # The tree comes from --root, not from where the script lives. This is
        # what lets one copy under actions/ serve every repository: when a runner
        # unpacks the action, the script sits outside the checkout it is reading.
        check.verdict(
            "--root reads the named tree, not the script's own",
            ["--root", str(dirty)],
            EXIT_FINDING,
            "chart.yaml:1",
            cwd=clean,
        )
        check.verdict(
            "with no --root it reads the working directory",
            [],
            EXIT_FINDING,
            "chart.yaml:1",
            cwd=dirty,
        )

        # No network, asserted by removing it.
        env, home = no_network_env()
        try:
            check.verdict(
                "it decides with every socket refused",
                ["--root", str(dirty)],
                EXIT_FINDING,
                "chart.yaml:1: has trailing whitespace",
                env=env,
            )
            check.verdict(
                "and still passes a clean tree with every socket refused",
                ["--root", str(clean)],
                EXIT_CLEAN,
                env=env,
            )
            wrapper, why = netns_wrapper()
            if wrapper:
                check.verdict(
                    "it decides inside a network namespace with no interface",
                    ["--root", str(dirty)],
                    EXIT_FINDING,
                    "chart.yaml:1: has trailing whitespace",
                    wrapper=wrapper,
                )
                check.covered("the process-level network proof")
            else:
                check.skipped("the process-level network proof", why)
        finally:
            shutil.rmtree(home, ignore_errors=True)

        # The composite wrapper, run the way Actions runs it. Everything above
        # tests the Python; this tests the shell that turns its exit code into
        # something a reader of a red check can act on.
        script = Path(raw) / "step.sh"
        script.write_text(wrapper_body(), encoding="utf-8")

        code, said = run_wrapper(script, "true", clean)
        check.that(
            f"{'the wrapper forwards a passing verdict, silently':<58} exit={code}",
            code == EXIT_CLEAN and not annotations(said),
            said,
        )
        # The self-test ran, rather than the input merely being accepted. A
        # wrapper that skipped it would look identical on every tree that passes,
        # and would stop noticing a gate that had stopped rejecting.
        check.that(
            "the wrapper runs the self-test before the tree",
            "self-test:" in said and said.index("self-test:") < said.index("tracked file(s)"),
            said,
        )
        _, without = run_wrapper(script, "false", clean)
        check.that(
            "and skips it when told to, so the input is not decoration",
            "self-test:" not in without,
            without,
        )

        code, said = run_wrapper(script, "false", dirty)
        marks = annotations(said)
        check.that(
            f"{'the wrapper annotates a finding as a finding':<58} exit={code}",
            code == EXIT_FINDING
            and len(marks) == 1
            and "do not match" in marks[0]
            and "NOTHING WAS CHECKED" not in marks[0],
            said,
        )

        code, said = run_wrapper(script, "false", undeclared)
        marks = annotations(said)
        check.that(
            f"{'the wrapper annotates an unrun check as one, not as a bad file':<58} exit={code}",
            code == EXIT_CANNOT_EVALUATE
            and len(marks) == 1
            and "NOTHING WAS CHECKED" in marks[0]
            and "do not match" not in marks[0],
            said,
        )

    # Static, alongside the behavioural proof: nothing in the gate can reach the
    # network even by a path no case happens to walk. Parsed rather than searched
    # for, because `from urllib import request` carries no "import urllib" to find
    # and a mention inside a comment is not an import.
    source = GATE.read_text(encoding="utf-8")
    banned = {"socket", "urllib", "http", "ssl", "requests", "ftplib", "smtplib", "asyncio"}
    imported = set()
    dynamic = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            imported |= {alias.name.split(".")[0] for alias in node.names} & banned
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported |= {node.module.split(".")[0]} & banned
        elif isinstance(node, ast.Call):
            named = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
            if named in {"__import__", "import_module"}:
                dynamic.add(named)
    check.that(
        "the gate imports no module that can reach the network",
        not imported and not dynamic,
        f"imports {', '.join(sorted(imported))}; resolves imports at runtime via "
        f"{', '.join(sorted(dynamic))}",
    )

    # The shell in the manifest ships with the action and runs before the Python
    # does, so a fetch written there would defeat the property with nothing in the
    # gate itself to find.
    shell = wrapper_body()
    fetchers = [
        tool
        for tool in ("curl", "wget", "npx", "npm", "pip", "pip3", "go install", "gh api")
        # Whole words: `pipefail` is not pip, and a gate failing on its own
        # comment teaches people to weaken the check rather than read it.
        if re.search(rf"\b{re.escape(tool)}\b", shell)
    ]
    check.that(
        "the shell the action ships fetches nothing",
        not fetchers,
        f"it names: {', '.join(fetchers)}",
    )
    check.that(
        "the gate installs nothing: its directory carries no package manifest",
        not [p.name for p in HERE.iterdir() if p.name in {"package.json", "requirements.txt"}],
        "a manifest here would be a dependency resolved at check time",
    )

    print(f"\n{'FAILED' if check.failures else 'every case passes'} ({check.failures} failing)")
    if check.ran:
        print(f"  machine-dependent proofs that ran: {'; '.join(check.ran)}")
    if check.missed:
        print(f"  machine-dependent proofs that did not: {'; '.join(check.missed)}")
    return 1 if check.failures else 0


if __name__ == "__main__":
    sys.exit(main())
