# editorconfig-gate: what shipped, and what each consumer changes

## What shipped

`actions/editorconfig-gate/` — a composite action that reads `.editorconfig` and the files
`git ls-files` names, and decides charset, line endings, final newline and trailing
whitespace from the bytes. It downloads nothing.

| file | what it is |
| --- | --- |
| `check_editorconfig.py` | the reading, plus `--self-test`: one crafted tree per verdict, asserted by exit code and by what it says |
| `action.yml` | the composite wrapper: `path`, `self-test`, and the exit code turned into an annotation naming which verdict it is |
| `test_check_editorconfig.py` | the process as a consumer invokes it — exit codes, strict argv, `--root`, the org `.editorconfig`, and the gate deciding with every socket taken away |
| `README.md` | why it is an action and not a dependency, and what it refuses to decide |

`.github/workflows/ci.yml` gained three jobs, all inside the existing `merge gate`:
`editorconfig gate fails closed` (both test suites), `every action.yml is loadable` (widened
from one manifest to all of them), and `editorconfig gate, invoked` — the only place the
action is invoked rather than read, against a tree that matches its declaration and one that
does not.

The workflow was renamed from `merge-gate-action.yml` to `ci.yml`. The required check is the
job name `merge gate`, which is unchanged, so branch protection needs no edit here.

## Why a composite action rather than a vendored script

Both keep the property that matters, so the choice is decided by what happens next.

A vendored script is five files that begin identical. Every one of them is edited by
whoever hits its next edge case, in the repository where they hit it, and the estate ends up
with five readings of one rule and no way to tell which is right. That is the shape this
change exists to remove, not to reproduce five times.

The action is one file, pinned by SHA, and Renovate already watches first-party action pins
under the org preset's `github-actions` manager — so a fix reaches all five as a normal
dependency PR with a diff, rather than as five hand-copied edits nobody can diff against
each other.

**On "no network at check time", precisely.** The runner resolves and unpacks a pinned
action during job setup, before any step of the job runs, from the same fetch that brings in
`actions/checkout`. It is authenticated, first-party, and pinned to a SHA. If it fails, the
job fails at action resolution with `Unable to resolve action …`, before the format step
exists — which cannot be mistaken for a finding about a file. The property the npm wrapper
broke is different and is fully held here: at the moment the check runs, nothing is fetched
and no third party is consulted. `test_check_editorconfig.py` proves it by taking the
capability away — the gate returns the same verdicts with every socket refused, and where
the kernel allows an unprivileged network namespace it is re-run inside one with no
interface at all.

**On the local loop.** `npm run editorconfig` sits inside `npm run check`, and the
package it calls cannot run on an arm64 machine at all — the shim asks for
`ec-darwin-amd64*`. So the local command is already not a working check. After adoption the
gate runs in CI, and the four properties it owns are the ones an editor applies from
`.editorconfig` on save, which is where they are cheapest to hold. A repository that still
wants the command can point its `editorconfig` script at a checkout of this repository:
`python3 <path-to>/.github/actions/editorconfig-gate/check_editorconfig.py --root .` needs
only `python3` and `git`.

## Proof

Run from this worktree:

```bash
python3 actions/editorconfig-gate/check_editorconfig.py --self-test
python3 actions/editorconfig-gate/test_check_editorconfig.py
```

**The gate decides with no network.** `test_check_editorconfig.py` runs the gate under an
interpreter whose `socket.socket`, `socket.create_connection`, `socket.socketpair` and
`urllib.request.urlopen` all raise, and requires exit 1 on a tree with a planted violation
and exit 0 on one without. It also asserts, statically, that the gate imports no module that
can reach the network and that its directory carries no package manifest.

**A planted violation is refused, and named.** Against a tree whose only defect is one
trailing space:

```
.editorconfig declares rules 1 file(s) do not match:

  - chart.yaml:1: has trailing whitespace, and trim_trailing_whitespace is true
```

**The gate fails without the fix.** Thirty-four mutations, each applied to a copy of the
action and run against both suites. None survives. The reading:

| mutation | caught by |
| --- | --- |
| trailing whitespace goes unchecked | `--self-test`, case *trailing whitespace* |
| a final newline goes unchecked | `--self-test`, case *no final newline* |
| a CRLF goes unchecked | `--self-test`, case *a CRLF line ending* |
| only a CR before a LF is seen, so a lone CR passes | `--self-test`, case *a carriage return used as the line separator* |
| non-utf-8 bytes go unchecked | `--self-test`, case *bytes that are not utf-8* |
| a byte-order mark passes as utf-8 | `--self-test`, case *a byte-order mark, which is a charset of its own* |
| `insert_final_newline = false` stops being a rule | `--self-test`, case *a final newline where the declaration says there is none* |
| a brace list stops expanding | `--self-test`, case *a brace list, the form that names a file carrying no extension* |
| an undecidable pattern is matched approximately | `--self-test`, case *a path-relative section* |
| a `.editorconfig` below the root is ignored | `--self-test`, case *a .editorconfig below the root* |
| a section header carrying a comment stops resolving | `--self-test`, case *a comment after a section header, which must not merge it into the section above* |
| a line the declaration parser cannot read is dropped | `--self-test`, case *a property line missing its separator, which would delete the rule* |
| a property named outside the word characters is dropped | `--self-test`, case *a property named outside the word characters, which must still reach the refusal* |
| a property in neither table is passed over | `--self-test`, case *a property the gate neither checks nor delegates* |
| a value outside the decided set is passed over | `--self-test`, case *a value the gate does not decide* |
| a file nothing was compared against counts as checked | `--self-test`, case *a tree holding nothing this can read* |
| a tree nothing was compared in reports success | `--self-test`, case *a section that only delegates, so nothing in the tree is compared* |
| git's file list is not required | `--self-test`, case *a tree git names nothing in* |
| could-not-evaluate collapses into the finding code | `--self-test`, *reported 1 finding(s) about the tree while saying nothing was checked* |
| could-not-evaluate collapses into success | `test_check_editorconfig.py`, *no .editorconfig is not a malformed tree* |
| a file the gate cannot open exits the way a malformed file exits | `test_check_editorconfig.py`, *a file it cannot open is not a malformed file* |
| the success line names the whole table rather than what ran | `test_check_editorconfig.py`, *success names the rules it applied, not the ones it knows* |
| `--root` is ignored and the script's own directory is read | `test_check_editorconfig.py`, *the org .editorconfig is decided, not refused* |
| argv is parsed loosely | `test_check_editorconfig.py`, *a flag it does not have is a usage error* |
| the gate acquires a network module | `test_check_editorconfig.py`, *the gate imports no module that can reach the network* |
| the self-test loses every rejecting case | `--self-test` coverage assertion, *no case expects exit 1* |
| the self-test's coverage assertion is removed | `test_check_editorconfig.py`, *a case set that stops reaching a verdict fails the self-test* |

And the composite wrapper, because the exit code only becomes something a reader can act on
after the shell in `action.yml` has read it:

| mutation | caught by |
| --- | --- |
| the wrapper stops disabling `-e`, so the verdict never gets named | `test_check_editorconfig.py`, *the wrapper annotates a finding as a finding* |
| the wrapper stops distinguishing the two non-zero verdicts | `test_check_editorconfig.py`, *the wrapper annotates a finding as a finding* |
| the wrapper swallows the gate's exit code | `test_check_editorconfig.py`, *the wrapper annotates a finding as a finding* |
| the wrapper stops running the self-test | `test_check_editorconfig.py`, *the wrapper runs the self-test before the tree* |
| the `self-test` input becomes decoration | `test_check_editorconfig.py`, *and skips it when told to, so the input is not decoration* |
| the wrapper ignores the `path` input | `test_check_editorconfig.py`, *the wrapper forwards a passing verdict, silently* |
| the wrapper acquires a fetch of its own | `test_check_editorconfig.py`, *the shell the action ships fetches nothing* |

Actions runs a composite `shell: bash` step as `bash -e -o pipefail`, and under `-e` the
gate's own non-zero exit ends the step before its code can be read — leaving a red check
with no annotation saying which of the two non-zero verdicts it is. The wrapper turns `-e`
off for exactly that reason, and `test_check_editorconfig.py` lifts the shell out of the
manifest and runs it under the same flags rather than restating it.

**What it refuses that a looser reading would pass.** Worth knowing before adoption, since
each of these is a rule the declaration already makes: a byte-order mark under
`charset = utf-8` (the specification calls that `utf-8-bom`, a separate charset); any
carriage return under `end_of_line = lf`, not only one before a newline; a final newline
under `insert_final_newline = false`, which is the mirror the declaration asserts; and a
`.editorconfig` line that parses as neither a section nor a property, which stops the run
rather than being dropped. None of the five trees trips any of them.

**Against the five real trees.** The gate was run against a clone of each consumer. Four
pass. One has a real finding, which the checker being replaced was never able to report
because it never completed a run:

| repository | verdict |
| --- | --- |
| `incident-response` | 204 files, clean |
| `digest-pipeline` | 194 files, clean |
| `slack-knowledge-bot` | 196 files, clean |
| `competitive-intelligence` | 136 files, clean |
| `nanohype` | four files under `docs/diagrams/svg/` have no final newline |

Every section of the `.editorconfig` those five carry is one the gate decides. None uses a
path-relative pattern, a `?`, a character class or a nested brace list, and none carries a
`.editorconfig` below the root.

## Adoption, per repository

The common change, in every one of the five:

1. **`package.json`** — drop `"editorconfig-checker"` from `devDependencies`, drop the
   `"editorconfig"` script, and remove `npm run editorconfig` from the `"check"` script.
   Refresh the lockfile.
2. **The CI step** — replace the `npm run editorconfig` step with:

   ```yaml
         - uses: nanohype/.github/actions/editorconfig-gate@<sha>
   ```

   Delete the step's `env:` block with it: `GITHUB_TOKEN` was there to raise the rate limit
   on the download, and `EC_VERSION` to pin the binary the wrapper fetched. Neither has
   anything to pin any more.
3. **Nothing else.** The step keeps its place in the same job, so the job name and the
   `needs:` list of that repository's `merge gate` are untouched, and branch protection needs
   no edit.

Per repository, the exact call sites:

| repository | file | job | what to remove |
| --- | --- | --- | --- |
| `nanohype` | `.github/workflows/validate-templates.yml` | `editorconfig` (job name `editorconfig`) | the `npm run editorconfig` step with its `GITHUB_TOKEN` and `EC_VERSION` env, **and the `# renovate: datasource=github-releases depName=editorconfig-checker/editorconfig-checker` annotation above it**. Also the `npm ci` and `actions/setup-node` steps, if nothing else in that job needs them. |
| `incident-response` | `.github/workflows/ci.yml` | `lint` (job name `Lint + Format`) | the unnamed `npm run editorconfig` step and its `GITHUB_TOKEN` env |
| `competitive-intelligence` | `.github/workflows/ci.yml` | `verify` (job name `build + lint + typecheck + test`) | the `Editorconfig` step and its `GITHUB_TOKEN` env |
| `digest-pipeline` | `.github/workflows/ci.yml` | `verify` (job name `build + lint + typecheck + test`) | the `Editorconfig` step and its `GITHUB_TOKEN` env |
| `slack-knowledge-bot` | `.github/workflows/ci.yml` | `verify` (job name `build + lint + typecheck + test`) | the `Editorconfig` step and its `GITHUB_TOKEN` and `EC_VERSION` env |

Two repositories carry extra work:

- **`nanohype`** merges red until the four files under `docs/diagrams/svg/` end in a newline.
  They are `agentic-loop.svg`, `mcp-topology.svg`, `rag-pipeline.svg` and
  `template-lifecycle.svg`. If a generator writes them, the newline belongs in the generator.
  Fix them in the same pull request that adopts the gate.
- **`nanohype`** also carries the comment block above its `editorconfig` job explaining the
  download and the rate limit. It describes the download this replaces, so it goes with the
  step it explains.

Three repositories that already carry a `.editorconfig` are not in the list and could adopt
the same action: `eks-agent-platform` (which carries its own copy of this reading, and would
converge onto the shared one), and this repository, whose only blocker is that
`atlas/scripts/emit.ts` writes the eleven SVGs under `profile/assets/atlas/` without a final
newline.

## Branch tip

Branch `editorconfig-gate`, pushed to `origin`. Not merged.
