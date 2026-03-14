/**
 * Review-config-diff — Diff two review configurations to see what changed.
 */

import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewConfigDiff(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges review-config-diff — Diff two review configurations

Usage:
  judges review-config-diff --left <path> --right <path> [options]

Options:
  --left <path>      First config file (required)
  --right <path>     Second config file (required)
  --format json      JSON output
  --help, -h         Show this help

Compares two configuration files and shows added, removed, and changed settings.
`);
    return;
  }

  const left = argv.find((_a: string, i: number) => argv[i - 1] === "--left");
  const right = argv.find((_a: string, i: number) => argv[i - 1] === "--right");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!left || !right) {
    console.error("Error: --left and --right required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(left)) {
    console.error(`Error: file not found: ${left}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(right)) {
    console.error(`Error: file not found: ${right}`);
    process.exitCode = 1;
    return;
  }

  let leftConfig: Record<string, unknown>;
  let rightConfig: Record<string, unknown>;
  try {
    leftConfig = JSON.parse(readFileSync(left, "utf-8"));
  } catch {
    console.error("Error: could not parse left file");
    process.exitCode = 1;
    return;
  }
  try {
    rightConfig = JSON.parse(readFileSync(right, "utf-8"));
  } catch {
    console.error("Error: could not parse right file");
    process.exitCode = 1;
    return;
  }

  const allKeys = new Set([...Object.keys(leftConfig), ...Object.keys(rightConfig)]);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: { key: string; from: unknown; to: unknown }[] = [];
  const unchanged: string[] = [];

  for (const key of allKeys) {
    const inLeft = key in leftConfig;
    const inRight = key in rightConfig;

    if (!inLeft && inRight) {
      added.push(key);
    } else if (inLeft && !inRight) {
      removed.push(key);
    } else if (JSON.stringify(leftConfig[key]) !== JSON.stringify(rightConfig[key])) {
      changed.push({ key, from: leftConfig[key], to: rightConfig[key] });
    } else {
      unchanged.push(key);
    }
  }

  if (format === "json") {
    console.log(JSON.stringify({ added, removed, changed, unchanged: unchanged.length }, null, 2));
    return;
  }

  console.log(`\nConfig Diff:`);
  console.log("═".repeat(65));
  console.log(
    `  Added: ${added.length}  Removed: ${removed.length}  Changed: ${changed.length}  Unchanged: ${unchanged.length}`,
  );
  console.log("─".repeat(65));

  if (added.length > 0) {
    console.log("\n  + Added:");
    for (const k of added) console.log(`    + ${k}: ${JSON.stringify(rightConfig[k])}`);
  }
  if (removed.length > 0) {
    console.log("\n  - Removed:");
    for (const k of removed) console.log(`    - ${k}: ${JSON.stringify(leftConfig[k])}`);
  }
  if (changed.length > 0) {
    console.log("\n  ~ Changed:");
    for (const c of changed) {
      console.log(`    ~ ${c.key}:`);
      console.log(`      from: ${JSON.stringify(c.from)}`);
      console.log(`      to:   ${JSON.stringify(c.to)}`);
    }
  }
  console.log("\n" + "═".repeat(65));
}
