/**
 * Review-workspace-init — Initialize a workspace for Judges code review.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ─── Default configs ────────────────────────────────────────────────────────

const DEFAULT_JUDGESRC = {
  preset: "default",
  disabledJudges: [] as string[],
  disabledRules: [] as string[],
  ruleOverrides: {},
  minSeverity: "low",
};

const DEFAULT_BASELINE = {
  version: 1,
  baselinedAt: new Date().toISOString().split("T")[0],
  findings: [] as string[],
};

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewWorkspaceInit(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : ".";
  const force = argv.includes("--force");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-workspace-init — Initialize workspace for Judges

Usage:
  judges review-workspace-init [--dir <path>] [--force] [--format table|json]

Options:
  --dir <path>     Workspace root (default: current directory)
  --force          Overwrite existing config files
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help

This creates:
  .judgesrc         — Judges configuration file
  .judges-baseline.json — Baseline for existing findings
  .judges/          — Local data directory
`);
    return;
  }

  const created: string[] = [];
  const skipped: string[] = [];

  // 1. .judgesrc
  const rcPath = join(dir, ".judgesrc");
  if (!existsSync(rcPath) || force) {
    writeFileSync(rcPath, JSON.stringify(DEFAULT_JUDGESRC, null, 2));
    created.push(".judgesrc");
  } else {
    skipped.push(".judgesrc (exists)");
  }

  // 2. .judges-baseline.json
  const baselinePath = join(dir, ".judges-baseline.json");
  if (!existsSync(baselinePath) || force) {
    writeFileSync(baselinePath, JSON.stringify(DEFAULT_BASELINE, null, 2));
    created.push(".judges-baseline.json");
  } else {
    skipped.push(".judges-baseline.json (exists)");
  }

  // 3. .judges/ directory
  const judgesDir = join(dir, ".judges");
  if (!existsSync(judgesDir)) {
    mkdirSync(judgesDir, { recursive: true });
    created.push(".judges/");
  } else {
    skipped.push(".judges/ (exists)");
  }

  // 4. .judges/cache directory
  const cacheDir = join(judgesDir, "cache");
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
    created.push(".judges/cache/");
  } else {
    skipped.push(".judges/cache/ (exists)");
  }

  if (format === "json") {
    console.log(JSON.stringify({ created, skipped }, null, 2));
    return;
  }

  console.log(`\nWorkspace Initialization`);
  console.log("═".repeat(50));

  if (created.length > 0) {
    console.log(`\n  Created:`);
    for (const c of created) {
      console.log(`    + ${c}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n  Skipped:`);
    for (const s of skipped) {
      console.log(`    - ${s}`);
    }
  }

  console.log(`\n  Workspace ready at: ${dir === "." ? process.cwd() : dir}`);
  console.log("═".repeat(50));
}
