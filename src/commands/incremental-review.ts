/**
 * Incremental-review — Only review files changed since last review.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IncrementalState {
  lastReviewTimestamp: string;
  lastCommit: string;
  fileHashes: Record<string, string>;
}

// ─── Hash helper ────────────────────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// ─── Git helpers ────────────────────────────────────────────────────────────

function getGitChangedFiles(since?: string): string[] {
  try {
    const args = since ? `diff --name-only ${since}` : "diff --name-only HEAD";
    const output = execSync(`git ${args}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (!output) return [];
    return output.split("\n").filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function getGitStagedFiles(): string[] {
  try {
    const output = execSync("git diff --name-only --cached", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (!output) return [];
    return output.split("\n").filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function getCurrentCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "unknown";
  }
}

// ─── State management ───────────────────────────────────────────────────────

const STATE_DIR = join(".judges", "incremental");
const STATE_FILE = join(STATE_DIR, "state.json");

function loadState(): IncrementalState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as IncrementalState;
  } catch {
    return null;
  }
}

function saveState(state: IncrementalState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Changed file detection ────────────────────────────────────────────────

function detectChangedFiles(
  state: IncrementalState | null,
  allFiles: string[],
): { changed: string[]; unchanged: string[]; newFiles: string[] } {
  if (!state) {
    return { changed: allFiles, unchanged: [], newFiles: allFiles };
  }

  const changed: string[] = [];
  const unchanged: string[] = [];
  const newFiles: string[] = [];

  for (const file of allFiles) {
    if (!existsSync(file)) continue;

    const previousHash = state.fileHashes[file];
    if (!previousHash) {
      newFiles.push(file);
      changed.push(file);
      continue;
    }

    try {
      const content = readFileSync(file, "utf-8");
      const currentHash = hashContent(content);

      if (currentHash !== previousHash) {
        changed.push(file);
      } else {
        unchanged.push(file);
      }
    } catch {
      changed.push(file);
    }
  }

  return { changed, unchanged, newFiles };
}

// ─── Update state with current hashes ───────────────────────────────────────

function buildStateFromFiles(files: string[]): IncrementalState {
  const fileHashes: Record<string, string> = {};

  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, "utf-8");
      fileHashes[file] = hashContent(content);
    } catch {
      // skip unreadable files
    }
  }

  return {
    lastReviewTimestamp: new Date().toISOString(),
    lastCommit: getCurrentCommit(),
    fileHashes,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runIncrementalReview(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges incremental-review — Only review files changed since last review

Usage:
  judges incremental-review                 Show changed files since last review
  judges incremental-review --git           Use git diff to detect changes
  judges incremental-review --save          Save current state as baseline
  judges incremental-review --reset         Reset incremental state
  judges incremental-review --format json   JSON output

Subcommands:
  status               Show what would be reviewed (default)
  save                 Save current file state as baseline
  reset                Clear incremental state

Options:
  --git                Include git-tracked changed files
  --staged             Include only staged files
  --since <commit>     Git diff since specific commit
  --files <glob>       Only consider files matching pattern
  --save               Save state after showing changes
  --reset              Clear incremental state
  --format json        JSON output
  --help, -h           Show this help

Uses content hashing and git status to skip unchanged files.
Run after a review to save state, then on next run only changed
files are flagged for review.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const useGit = argv.includes("--git");
  const useStaged = argv.includes("--staged");
  const sinceCommit = argv.find((_a: string, i: number) => argv[i - 1] === "--since");
  const doSave = argv.includes("--save");
  const doReset = argv.includes("--reset");

  if (doReset) {
    if (existsSync(STATE_FILE)) {
      writeFileSync(STATE_FILE, "{}", "utf-8");
      console.log("Incremental state reset.");
    } else {
      console.log("No incremental state found.");
    }
    return;
  }

  // Collect files to consider
  let targetFiles: string[];

  if (useStaged) {
    targetFiles = getGitStagedFiles();
  } else if (useGit || sinceCommit) {
    targetFiles = getGitChangedFiles(sinceCommit);
  } else {
    // No git flag — use state-based detection
    // Collect all tracked files from git
    try {
      const output = execSync("git ls-files", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      targetFiles = output
        .split("\n")
        .filter((f) => f.length > 0 && /\.(ts|js|py|go|rs|java|cs|cpp|c|rb|php|tsx|jsx)$/.test(f));
    } catch {
      console.error("Error: Cannot list files. Are you in a git repository?");
      process.exitCode = 1;
      return;
    }
  }

  const state = loadState();
  const { changed, unchanged, newFiles } = detectChangedFiles(state, targetFiles);

  if (doSave) {
    const newState = buildStateFromFiles(targetFiles);
    saveState(newState);
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          hasState: state !== null,
          lastReview: state?.lastReviewTimestamp || null,
          lastCommit: state?.lastCommit || null,
          totalFiles: targetFiles.length,
          changedFiles: changed.length,
          unchangedFiles: unchanged.length,
          newFiles: newFiles.length,
          changed,
          saved: doSave,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n  Incremental Review Status\n  ─────────────────────────────`);

  if (state) {
    console.log(`    Last review: ${state.lastReviewTimestamp}`);
    console.log(`    Last commit: ${state.lastCommit.slice(0, 8)}`);
  } else {
    console.log(`    No previous state — all files will be reviewed`);
  }

  console.log(`\n    Total files: ${targetFiles.length}`);
  console.log(`    Changed: ${changed.length}`);
  console.log(`    Unchanged: ${unchanged.length}`);
  console.log(`    New: ${newFiles.length}`);

  if (changed.length > 0) {
    console.log(`\n    Files to review:`);
    for (const f of changed.slice(0, 30)) {
      const marker = newFiles.includes(f) ? "🆕" : "📝";
      console.log(`      ${marker} ${f}`);
    }
    if (changed.length > 30) {
      console.log(`      ... and ${changed.length - 30} more`);
    }
  } else {
    console.log(`\n    ✅ No files have changed since last review.`);
  }

  if (doSave) {
    console.log(`\n    💾 State saved.`);
  }

  console.log();
}
