/**
 * Review-diff-stats — Statistics about diff/change metrics for reviews.
 */

import { execSync } from "child_process";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDiffStats(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges review-diff-stats — Diff and change statistics

Usage:
  judges review-diff-stats --since <ref> [options]
  judges review-diff-stats --compare <ref1>..<ref2> [options]

Options:
  --since <ref>      Git ref to compare against (e.g., HEAD~5, main)
  --compare <range>  Git range (e.g., main..feature)
  --extensions <ext> Filter by extensions (default: all)
  --format json      JSON output
  --help, -h         Show this help

Shows statistics about code changes including lines added/removed per file.
`);
    return;
  }

  const since = argv.find((_a: string, i: number) => argv[i - 1] === "--since");
  const compare = argv.find((_a: string, i: number) => argv[i - 1] === "--compare");
  const extsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--extensions");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const ref = compare || (since ? `${since}..HEAD` : null);
  if (!ref) {
    console.error("Error: --since or --compare required");
    process.exitCode = 1;
    return;
  }

  // Check we're in a git repo
  try {
    execSync("git rev-parse --git-dir", { encoding: "utf-8" });
  } catch {
    console.error("Error: not in a git repository");
    process.exitCode = 1;
    return;
  }

  interface FileStat {
    file: string;
    added: number;
    removed: number;
    total: number;
  }

  const stats: FileStat[] = [];
  try {
    const output = execSync(`git diff --numstat ${ref}`, { encoding: "utf-8" });
    const extensions = extsStr ? extsStr.split(",").map((e) => e.trim()) : null;

    for (const line of output.split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const added = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
      const removed = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
      const file = parts[2];

      if (extensions) {
        const ext = "." + file.split(".").pop();
        if (!extensions.includes(ext)) continue;
      }

      stats.push({ file, added, removed, total: added + removed });
    }
  } catch (err) {
    console.error(`Error running git diff: ${err}`);
    process.exitCode = 1;
    return;
  }

  stats.sort((a, b) => b.total - a.total);

  const totalAdded = stats.reduce((s, f) => s + f.added, 0);
  const totalRemoved = stats.reduce((s, f) => s + f.removed, 0);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { ref, files: stats.length, totalAdded, totalRemoved, totalChanged: totalAdded + totalRemoved, stats },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nDiff Statistics (${ref}):`);
  console.log("═".repeat(70));
  console.log(`  Files changed: ${stats.length}`);
  console.log(`  Lines added:   +${totalAdded}`);
  console.log(`  Lines removed: -${totalRemoved}`);
  console.log(`  Net change:    ${totalAdded - totalRemoved > 0 ? "+" : ""}${totalAdded - totalRemoved}`);
  console.log("─".repeat(70));

  for (const s of stats.slice(0, 20)) {
    const bar = "+".repeat(Math.min(s.added, 20)) + "-".repeat(Math.min(s.removed, 20));
    console.log(`  ${s.file.padEnd(40)} +${String(s.added).padStart(4)} -${String(s.removed).padStart(4)}  ${bar}`);
  }
  if (stats.length > 20) console.log(`  ... and ${stats.length - 20} more files`);
  console.log("═".repeat(70));
}
