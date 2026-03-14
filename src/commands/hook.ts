/**
 * `judges hook` — Install/uninstall pre-commit git hooks.
 *
 * Usage:
 *   judges hook install                 # Install pre-commit hook
 *   judges hook uninstall               # Remove pre-commit hook
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { join, resolve } from "path";

// ─── Hook Content ───────────────────────────────────────────────────────────

const HOOK_MARKER = "# judges-panel-hook";

function generateHookScript(): string {
  return `#!/usr/bin/env sh
${HOOK_MARKER}
# Judges Panel pre-commit hook — evaluate staged files in a single pass.

# Check if judges is available
if ! command -v judges >/dev/null 2>&1; then
  echo "  ⚠️  judges not found — skipping pre-commit review"
  exit 0
fi

# Single-pass evaluation of all staged files
judges eval . --staged-only --summary --fail-on-findings
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  echo ""
  echo "  ⛔ Judges found critical issues. Commit blocked."
  echo "  Run 'judges eval . --staged-only' to see details."
  echo "  Run 'judges fix <file> --apply' to auto-fix."
  echo "  Use 'git commit --no-verify' to bypass."
  echo ""
  exit 1
fi
`;
}

// ─── Find Git Hooks Directory ───────────────────────────────────────────────

function findGitHooksDir(cwd: string): string | undefined {
  // Check for Husky first
  const huskyDir = join(cwd, ".husky");
  if (existsSync(huskyDir)) return huskyDir;

  // Check for .git/hooks
  const gitHooksDir = join(cwd, ".git", "hooks");
  if (existsSync(join(cwd, ".git"))) return gitHooksDir;

  return undefined;
}

// ─── Main Hook Command ─────────────────────────────────────────────────────

export function runHook(argv: string[]): void {
  const subcommand = argv[3]; // install, uninstall
  const cwd = resolve(".");

  if (!subcommand || subcommand === "install") {
    installHook(cwd);
  } else if (subcommand === "uninstall") {
    uninstallHook(cwd);
  } else {
    console.error(`Unknown hook subcommand: ${subcommand}`);
    console.error("Usage: judges hook install | judges hook uninstall");
    process.exit(1);
  }
}

function installHook(cwd: string): void {
  const hooksDir = findGitHooksDir(cwd);
  if (!hooksDir) {
    console.error("Error: Not a git repository (no .git directory found).");
    console.error("Run this command from the root of a git repository.");
    process.exit(1);
  }

  // Ensure hooks directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = join(hooksDir, "pre-commit");

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (existing.includes(HOOK_MARKER)) {
      console.log("\n  ℹ  Judges pre-commit hook is already installed.\n");
      process.exit(0);
    }
    // Append to existing hook
    const appended = existing.trimEnd() + "\n\n" + generateHookScript();
    writeFileSync(hookPath, appended, "utf-8");
    try {
      chmodSync(hookPath, 0o755);
    } catch {
      /* Windows */
    }
    console.log("\n  ✅ Judges hook appended to existing pre-commit hook.");
    console.log(`  Location: ${hookPath}\n`);
  } else {
    writeFileSync(hookPath, generateHookScript(), "utf-8");
    try {
      chmodSync(hookPath, 0o755);
    } catch {
      /* Windows */
    }
    console.log("\n  ✅ Judges pre-commit hook installed.");
    console.log(`  Location: ${hookPath}\n`);
  }

  console.log("  Staged files will be evaluated before each commit.");
  console.log("  Use 'git commit --no-verify' to bypass.\n");
  process.exit(0);
}

function uninstallHook(cwd: string): void {
  const hooksDir = findGitHooksDir(cwd);
  if (!hooksDir) {
    console.error("Error: Not a git repository.");
    process.exit(1);
  }

  const hookPath = join(hooksDir, "pre-commit");
  if (!existsSync(hookPath)) {
    console.log("\n  ℹ  No pre-commit hook found. Nothing to uninstall.\n");
    process.exit(0);
  }

  const content = readFileSync(hookPath, "utf-8");
  if (!content.includes(HOOK_MARKER)) {
    console.log("\n  ℹ  Pre-commit hook exists but was not installed by Judges.\n");
    process.exit(0);
  }

  // Remove the judges block
  const lines = content.split("\n");
  const markerIndex = lines.findIndex((l) => l.includes(HOOK_MARKER));
  if (markerIndex <= 1) {
    // Entire file is the judges hook — remove it
    unlinkSync(hookPath);
    console.log("\n  ✅ Judges pre-commit hook removed.\n");
  } else {
    // Remove from marker to end (judges block is at the end)
    const cleaned =
      lines
        .slice(0, markerIndex - 1)
        .join("\n")
        .trimEnd() + "\n";
    writeFileSync(hookPath, cleaned, "utf-8");
    console.log("\n  ✅ Judges section removed from pre-commit hook.\n");
  }
  process.exit(0);
}
