/**
 * Ignore-list — Configurable ignore patterns for files, directories, and rules.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, relative } from "path";
import { matchGlobPath } from "../tools/command-safety.js";

// ─── Simple glob matcher ────────────────────────────────────────────────────

function matchGlob(filePath: string, pattern: string): boolean {
  return matchGlobPath(filePath, pattern);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface IgnoreConfig {
  version: string;
  filePatterns: string[];
  directoryPatterns: string[];
  ruleIgnores: string[];
  inlineSuppressions: boolean;
}

interface _IgnoreResult {
  totalPaths: number;
  ignoredPaths: number;
  ignoredRules: number;
  effectiveFiles: string[];
  summary: string;
}

// ─── Default config ────────────────────────────────────────────────────────

function defaultIgnoreConfig(): IgnoreConfig {
  return {
    version: "1.0.0",
    filePatterns: [
      "**/*.test.ts",
      "**/*.test.js",
      "**/*.spec.ts",
      "**/*.spec.js",
      "**/*.d.ts",
      "**/fixtures/**",
      "**/testdata/**",
    ],
    directoryPatterns: ["node_modules", "dist", "build", "coverage", ".git", ".next", "__pycache__", "vendor"],
    ruleIgnores: [],
    inlineSuppressions: true,
  };
}

// ─── Matching engine ───────────────────────────────────────────────────────

function shouldIgnoreFile(filePath: string, baseDir: string, config: IgnoreConfig): boolean {
  const rel = relative(baseDir, filePath).replace(/\\/g, "/");

  for (const pattern of config.filePatterns) {
    if (matchGlob(rel, pattern)) return true;
  }

  // Check directory patterns
  const parts = rel.split("/");
  for (const dir of config.directoryPatterns) {
    if (parts.includes(dir)) return true;
  }

  return false;
}

function shouldIgnoreRule(ruleId: string, config: IgnoreConfig): boolean {
  return config.ruleIgnores.includes(ruleId);
}

function filterFiles(
  files: string[],
  baseDir: string,
  config: IgnoreConfig,
): { effective: string[]; ignored: string[] } {
  const effective: string[] = [];
  const ignored: string[] = [];

  for (const f of files) {
    if (shouldIgnoreFile(f, baseDir, config)) {
      ignored.push(f);
    } else {
      effective.push(f);
    }
  }

  return { effective, ignored };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runIgnoreList(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ignore-list — Manage review ignore patterns

Usage:
  judges ignore-list init                   Create .judgesignore.json template
  judges ignore-list show                   Show current ignore config
  judges ignore-list test <path>            Test if a path would be ignored
  judges ignore-list --format json          JSON output

Subcommands:
  init                 Create a .judgesignore.json template
  show                 Display current ignore configuration
  test <path>          Test whether a specific path is ignored

Options:
  --format json        JSON output
  --help, -h           Show this help

Ignore patterns are stored in .judgesignore.json and control which files,
directories, and rules are excluded from review.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const configPath = join(".", ".judgesignore.json");
  const subcommand = argv.find((a) => !a.startsWith("-") && a !== "ignore-list") || "show";

  if (subcommand === "init") {
    if (existsSync(configPath)) {
      console.error("Error: .judgesignore.json already exists.");
      process.exitCode = 1;
      return;
    }
    writeFileSync(configPath, JSON.stringify(defaultIgnoreConfig(), null, 2), "utf-8");
    console.log("Created .judgesignore.json with default patterns.");
    return;
  }

  // Load config
  let config: IgnoreConfig;
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8")) as IgnoreConfig;
    } catch {
      console.error("Error: .judgesignore.json is not valid JSON.");
      process.exitCode = 1;
      return;
    }
  } else {
    config = defaultIgnoreConfig();
  }

  if (subcommand === "test") {
    const testPath = argv.find((a) => !a.startsWith("-") && a !== "ignore-list" && a !== "test");
    if (!testPath) {
      console.error("Error: Provide a path to test.");
      process.exitCode = 1;
      return;
    }

    const ignored = shouldIgnoreFile(testPath, ".", config);
    if (format === "json") {
      console.log(JSON.stringify({ path: testPath, ignored }));
    } else {
      console.log(`  ${testPath}: ${ignored ? "❌ IGNORED" : "✅ INCLUDED"}`);
    }
    return;
  }

  // Show
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\n  Ignore Configuration\n  ─────────────────────────────`);
  console.log(`    Source: ${existsSync(configPath) ? configPath : "defaults (no .judgesignore.json)"}`);

  console.log(`\n    File Patterns (${config.filePatterns.length}):`);
  for (const p of config.filePatterns) console.log(`      ⬜ ${p}`);

  console.log(`\n    Directory Patterns (${config.directoryPatterns.length}):`);
  for (const p of config.directoryPatterns) console.log(`      ⬜ ${p}`);

  if (config.ruleIgnores.length > 0) {
    console.log(`\n    Ignored Rules (${config.ruleIgnores.length}):`);
    for (const r of config.ruleIgnores) console.log(`      ⬜ ${r}`);
  }

  console.log(`\n    Inline suppressions: ${config.inlineSuppressions ? "enabled" : "disabled"}`);
  console.log();
}

// Export helpers for use by other commands
export { shouldIgnoreFile, shouldIgnoreRule, filterFiles, IgnoreConfig };
