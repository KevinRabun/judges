/**
 * Review-incremental — Run reviews only on changed files since last review.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IncrementalState {
  version: string;
  lastCommit: string;
  lastTimestamp: string;
  reviewedFiles: string[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STATE_FILE = ".judges/incremental-state.json";

function loadState(): IncrementalState {
  if (!existsSync(STATE_FILE)) return { version: "1.0.0", lastCommit: "", lastTimestamp: "", reviewedFiles: [] };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as IncrementalState;
  } catch {
    return { version: "1.0.0", lastCommit: "", lastTimestamp: "", reviewedFiles: [] };
  }
}

function saveState(state: IncrementalState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIncremental(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-incremental — Review only changed files

Usage:
  judges review-incremental                    Show changed files since last review
  judges review-incremental mark               Mark current state as reviewed
  judges review-incremental diff               Show diff of changed files
  judges review-incremental reset              Reset incremental state

Options:
  --since <commit>    Compare against specific commit
  --extensions <exts> Filter by extensions (e.g., "ts,js,py")
  --format json       JSON output
  --help, -h          Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["mark", "diff", "reset"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const state = loadState();

  if (subcommand === "mark") {
    try {
      const commit = execSync("git rev-parse HEAD", { encoding: "utf-8", timeout: 5000 }).trim();
      state.lastCommit = commit;
      state.lastTimestamp = new Date().toISOString();
      saveState(state);
      console.log(`Marked as reviewed at ${commit.slice(0, 8)}`);
    } catch {
      console.error("Error: could not get current commit (is this a git repo?)");
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "reset") {
    saveState({ version: "1.0.0", lastCommit: "", lastTimestamp: "", reviewedFiles: [] });
    console.log("Incremental state reset.");
    return;
  }

  // Get changed files
  const sinceCommit = argv.find((_a: string, i: number) => argv[i - 1] === "--since") || state.lastCommit;
  const extensions = argv.find((_a: string, i: number) => argv[i - 1] === "--extensions");

  let changedFiles: string[];
  try {
    if (sinceCommit) {
      const output = execSync(`git diff --name-only ${sinceCommit} HEAD`, { encoding: "utf-8", timeout: 10000 });
      changedFiles = output.trim().split("\n").filter(Boolean);
    } else {
      const output = execSync("git diff --name-only HEAD~1 HEAD", { encoding: "utf-8", timeout: 10000 });
      changedFiles = output.trim().split("\n").filter(Boolean);
    }
  } catch {
    console.error("Error: could not determine changed files (is this a git repo?)");
    process.exitCode = 1;
    return;
  }

  if (extensions) {
    const extList = extensions.split(",").map((e) => e.trim().replace(/^\./, ""));
    changedFiles = changedFiles.filter((f) => {
      const ext = f.split(".").pop() || "";
      return extList.includes(ext);
    });
  }

  if (subcommand === "diff") {
    if (changedFiles.length === 0) {
      console.log("No changed files.");
      return;
    }
    try {
      const ref = sinceCommit || "HEAD~1";
      const diff = execSync(`git diff ${ref} HEAD -- ${changedFiles.slice(0, 10).join(" ")}`, {
        encoding: "utf-8",
        timeout: 10000,
      });
      console.log(diff);
    } catch {
      console.error("Error: could not generate diff");
      process.exitCode = 1;
    }
    return;
  }

  // Default: show changed files
  if (format === "json") {
    console.log(
      JSON.stringify({ sinceCommit: sinceCommit || "(none)", changedFiles, count: changedFiles.length }, null, 2),
    );
    return;
  }

  console.log(`\nIncremental Review — ${changedFiles.length} changed file(s):`);
  console.log("═".repeat(50));
  if (sinceCommit) console.log(`  Since: ${sinceCommit.slice(0, 8)}`);
  if (state.lastTimestamp) console.log(`  Last review: ${state.lastTimestamp.slice(0, 19)}`);
  console.log("─".repeat(50));
  for (const f of changedFiles) {
    console.log(`  ${f}`);
  }
  if (changedFiles.length === 0) console.log("  (no changes)");
  console.log("═".repeat(50));
}
