/**
 * Review-scope-lock — Lock review scope to specific files or directories.
 *
 * Prevents accidental review of out-of-scope code by maintaining
 * a local scope configuration.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScopeConfig {
  includes: string[];
  excludes: string[];
  lockedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function scopeFile(): string {
  return join(process.cwd(), ".judges", "scope-lock.json");
}

function loadScope(): ScopeConfig {
  const f = scopeFile();
  if (!existsSync(f)) return { includes: [], excludes: [], lockedAt: "" };
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return { includes: [], excludes: [], lockedAt: "" };
  }
}

function saveScope(scope: ScopeConfig): void {
  const f = scopeFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(scope, null, 2));
}

function fileInScope(filePath: string, scope: ScopeConfig): boolean {
  if (scope.excludes.some((e) => filePath.startsWith(e) || filePath.includes(e))) return false;
  if (scope.includes.length === 0) return true;
  return scope.includes.some((inc) => filePath.startsWith(inc) || filePath.includes(inc));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewScopeLock(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-scope-lock — Lock review scope

Usage:
  judges review-scope-lock show
  judges review-scope-lock add-include <path>
  judges review-scope-lock add-exclude <path>
  judges review-scope-lock remove <path>
  judges review-scope-lock test <file>
  judges review-scope-lock clear

Options:
  --help, -h    Show this help
`);
    return;
  }

  const scope = loadScope();

  if (sub === "show") {
    if (scope.includes.length === 0 && scope.excludes.length === 0) {
      console.log("No scope lock configured. All files are in scope.");
      return;
    }
    console.log("\nScope Lock Configuration");
    console.log("═".repeat(50));
    if (scope.includes.length > 0) {
      console.log("Includes:");
      for (const p of scope.includes) console.log(`  + ${p}`);
    }
    if (scope.excludes.length > 0) {
      console.log("Excludes:");
      for (const p of scope.excludes) console.log(`  - ${p}`);
    }
    if (scope.lockedAt) console.log(`\nLocked at: ${scope.lockedAt}`);
    console.log("═".repeat(50));
  } else if (sub === "add-include") {
    const path = argv[1];
    if (!path) {
      console.error("Error: path required");
      process.exitCode = 1;
      return;
    }
    if (!scope.includes.includes(path)) {
      scope.includes.push(path);
      scope.lockedAt = new Date().toISOString();
      saveScope(scope);
    }
    console.log(`Added include: ${path}`);
  } else if (sub === "add-exclude") {
    const path = argv[1];
    if (!path) {
      console.error("Error: path required");
      process.exitCode = 1;
      return;
    }
    if (!scope.excludes.includes(path)) {
      scope.excludes.push(path);
      scope.lockedAt = new Date().toISOString();
      saveScope(scope);
    }
    console.log(`Added exclude: ${path}`);
  } else if (sub === "remove") {
    const path = argv[1];
    if (!path) {
      console.error("Error: path required");
      process.exitCode = 1;
      return;
    }
    scope.includes = scope.includes.filter((p) => p !== path);
    scope.excludes = scope.excludes.filter((p) => p !== path);
    saveScope(scope);
    console.log(`Removed: ${path}`);
  } else if (sub === "test") {
    const file = argv[1];
    if (!file) {
      console.error("Error: file path required");
      process.exitCode = 1;
      return;
    }
    const inScope = fileInScope(file, scope);
    console.log(`${file}: ${inScope ? "IN SCOPE" : "OUT OF SCOPE"}`);
  } else if (sub === "clear") {
    saveScope({ includes: [], excludes: [], lockedAt: "" });
    console.log("Scope lock cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
