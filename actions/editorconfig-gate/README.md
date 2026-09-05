# editorconfig-gate

The rules `.editorconfig` declares that no formatter owns, checked against the tree.

A code formatter owns one language each. `.editorconfig` declares charset, line endings, a
final newline and no trailing whitespace for *every* file, so everything outside those
languages — YAML, HCL, Markdown, shell, chart templates, generated JSON — has nothing
observing those four rules unless something reads the whole tree against them.

## Why this is an action and not a dependency

The `editorconfig-checker` npm package is a wrapper. It resolves a release through the
GitHub API and downloads a binary **when the check runs**; no published version ships the
binary. A gate built on it makes the verdict on a merge depend on an unauthenticated call
to a third party, at the moment a merge is waiting for it — and that call fails in more
than one way:

| how the download fails | what the runner prints |
| --- | --- |
| the API rate-limits an unauthenticated runner | `403` |
| the wrapper's asset glob `ec-<os>-<arch>*` matches no published asset name | `Error: The binary 'ec-linux-amd64*' not found` |
| the wrapper asks for an architecture the release does not carry | the same miss, on a developer's machine |

All three print as a failing **format** check on a tree with no formatting defect. And a
lockfile entry pins the wrapper, not the checker: on the runs that did succeed, the binary
was whatever the release lookup resolved at that moment.

A gate on the merge path decides from the tree. This reads `.editorconfig` and the files
`git ls-files` names. It opens no socket, installs nothing, and needs `python3` and `git`.

## Usage

```yaml
      - uses: nanohype/.github/actions/editorconfig-gate@<sha>
```

That is the whole call for a repository whose `.editorconfig` sits at the root of the
checkout. Put it in the job that already runs the formatters.

| input | default | what it is |
| --- | --- | --- |
| `path` | `.` | The tree to read: its `.editorconfig`, and the files git tracks under it. Relative paths resolve against the workspace. |
| `self-test` | `true` | Run the gate against crafted trees before reading the real one. Leave it on. |

The action needs the repository checked out **with its git directory** — `git ls-files` is
how it learns which files are the repository's rather than the runner's.

## The two non-zero verdicts, and why they are separate

A tree that breaks a rule and a checker that could not run both exit non-zero, and a reader
of a red build can act on neither until they are told apart.

| exit | meaning |
| --- | --- |
| 0 | every file matches what `.editorconfig` declares for it |
| 1 | a file does not, named with its file, line and rule |
| 2 | an argument the gate does not take |
| 3 | **NOTHING WAS CHECKED** — and it says so, in the same breath as saying it is not a finding about the tree |

Exit 3 covers every way the gate can fail to reach a verdict: no `.editorconfig`, a line in
it that parses as neither a section nor a property, a property or a pattern outside what the
gate decides, a file it could not open, a tree in which not one file was compared against a
rule, and no git. An unhandled exception is caught and reported the same way, because the
interpreter would otherwise exit 1 — the code that means a file in the branch is malformed.

Actions surfaces only pass/fail, so the wrapper reads the code and turns it into an
annotation naming which verdict this is. A downloading checker cannot produce the third
one at all: the download fails, the step goes red, and the tree it never read takes the
blame.

## What it decides, and what it refuses to decide

Checked against the file's bytes:

- `charset` — `utf-8`: decoded rather than guessed at, and without a byte-order mark, which
  the specification treats as the separate charset `utf-8-bom`
- `end_of_line` — `lf`: any carriage return is a finding, not only one before a newline. A
  file separated by bare CRs is a single line to a reader splitting on newlines, so asking
  whether a line ends in CR would examine nothing and report it as conforming
- `insert_final_newline` — `true` requires the last byte to be a newline; `false` requires
  that it is not, which is what a generated format that closes without one is declaring
- `trim_trailing_whitespace` — `true` requires no space or tab before a line ending; `false`
  turns the check off

Sections apply in file order and later ones win, which is how `[*.md]` turns trailing
whitespace off for Markdown alone — two trailing spaces are that language's hard-break
idiom.

`indent_style` and `indent_size` are **delegated**, with the owners named in the script's
`DELEGATED` table: the formatter for each language owns indentation, and a `Makefile` needs
tabs in a recipe and spaces inside its continuation lines. Delegated is not ignored, and
the difference is enforced — a property in neither table stops the run, and so does a value
outside the ones the gate decides. A file matching no section that declares a property the
gate checks is not counted as checked, and a tree in which not one file was compared against
a rule exits 3 — a declaration carrying only `indent_style` and `indent_size` delegates
everything, so there is nothing to report success about.

Every line of the declaration is accounted for. A line that parses as neither a section
header nor a property exits 3 rather than being dropped: a header the reader misses leaves
its properties attached to the section above it, so a rule scoped to Markdown becomes a rule
for the whole tree and the gate reports success over the difference. A section header may
carry a trailing `#` or `;` comment; a property key may be any text up to the separator, so
a property the gate does not decide reaches the refusal instead of vanishing.

Pattern syntax is refused rather than approximated. The gate resolves a literal name, a `*`
inside one path segment, and a brace list of either (`{Makefile,*.mk}`, `*.{yml,yaml}`). A
section naming a directory, a `**`, a `?`, a character class or a nested brace list exits
3, because a pattern read approximately selects a different set of files than the section
declares and reports success over the difference. A `.editorconfig` below the root exits 3
for the same reason: the files under it resolve against rules this does not read.

Adding a property or a pattern form is a change to `IMPLEMENTED`, `DELEGATED` or
`alternatives()`, plus the case in `CASES` that proves it.

## Tests

Two, because they prove different things.

```bash
python3 actions/editorconfig-gate/check_editorconfig.py --self-test
python3 actions/editorconfig-gate/test_check_editorconfig.py
```

`--self-test` is the reading: one crafted tree per verdict, asserted by exit code **and** by
what it says, and a coverage assertion that fails if the case set stops reaching any of the
three verdicts. It ships with the action and runs on the consumer's runner ahead of the real
check, so a gate that has stopped rejecting says so rather than passing everything.

`test_check_editorconfig.py` is the process: which exit code reaches the shell, that argv is
parsed strictly, that `--root` reads the named tree rather than the one the script lives in,
that the `.editorconfig` this org carries is decided rather than refused, and that the gate
still decides with every socket taken away from it.
