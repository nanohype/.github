/**
 * Explain how the committed diagrams differ from a fresh render.
 *
 * The gate itself is `git diff`, but its bare output — "22 files changed" — is
 * the same whether the model genuinely moved or the renderer varies by
 * platform, and those call for opposite responses. This prints the first
 * differing region so the answer is visible from the failed job rather than
 * requiring someone to reproduce it.
 *
 * Usage: node scripts/diff-report.ts <pathspec> [--limit=3]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const pathspec = args.find((a) => !a.startsWith("--")) ?? "profile/assets/atlas";
const limit = Number((args.find((a) => a.startsWith("--limit=")) ?? "--limit=3").slice(8));

const CONTEXT = 90;

function git(...a: string[]): string {
  return execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const changed = git("diff", "--name-only", "--", pathspec).split("\n").filter(Boolean);

if (changed.length === 0) {
  console.log(`committed files under ${pathspec} match a fresh render`);
  process.exit(0);
}

console.log(`${changed.length} file(s) under ${pathspec} differ from a fresh render:\n`);

for (const file of changed.slice(0, limit)) {
  const committed = git("show", `HEAD:${file}`);
  const rendered = readFileSync(file, "utf8");

  console.log(`${file}  (${committed.length} -> ${rendered.length} bytes)`);

  let at = -1;
  const shared = Math.min(committed.length, rendered.length);
  for (let i = 0; i < shared; i++) {
    if (committed[i] !== rendered[i]) {
      at = i;
      break;
    }
  }

  if (at === -1) {
    console.log("  identical up to the shorter length — one is a prefix of the other\n");
    continue;
  }

  const slice = (s: string) => JSON.stringify(s.slice(Math.max(0, at - CONTEXT), at + 70));
  console.log(`  first difference at byte ${at}`);
  console.log(`    committed: ${slice(committed)}`);
  console.log(`    rendered : ${slice(rendered)}\n`);
}

if (changed.length > limit) {
  console.log(`… and ${changed.length - limit} more`);
}
