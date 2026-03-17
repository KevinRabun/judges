/**
 * Review-ignore-pattern — Manage file/path ignore patterns for reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { matchGlobPath } from "../tools/command-safety.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IgnoreConfig {
  version: number;
  patterns: string[];
  lastUpdated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CONFIG_PATH = ".judges/ignore-patterns.json";

function loadConfig(): IgnoreConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { version: 1, patterns: [], lastUpdated: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { version: 1, patterns: [], lastUpdated: new Date().toISOString() };
  }
}

function saveConfig(config: IgnoreConfig): void {
  const dir = CONFIG_PATH.substring(0, CONFIG_PATH.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  config.lastUpdated = new Date().toISOString();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function matchesPattern(filePath: string, pattern: string): boolean {
  return matchGlobPath(filePath, pattern);
}

export function isIgnored(filePath: string): boolean {
  const config = loadConfig();
  return config.patterns.some((p) => matchesPattern(filePath, p));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIgnorePattern(argv: string[]): void {
  const sub = argv[0];

  if (argv.includes("--help") || argv.includes("-h") || !sub) {
    console.log(`
judges review-ignore-pattern — Manage review ignore patterns

Usage:
  judges review-ignore-pattern add <pattern>
  judges review-ignore-pattern remove <pattern>
  judges review-ignore-pattern list [--format table|json]
  judges review-ignore-pattern test <filepath>

Subcommands:
  add       Add an ignore pattern
  remove    Remove an ignore pattern
  list      List all patterns
  test      Test if a file matches any pattern

Examples:
  judges review-ignore-pattern add "node_modules/**"
  judges review-ignore-pattern add "*.test.ts"
  judges review-ignore-pattern test "src/index.ts"

Options:
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (sub === "add") {
    const pattern = argv[1];
    if (!pattern) {
      console.error("Error: pattern required");
      process.exitCode = 1;
      return;
    }

    const config = loadConfig();
    if (config.patterns.includes(pattern)) {
      console.log(`Pattern already exists: ${pattern}`);
      return;
    }
    config.patterns.push(pattern);
    saveConfig(config);
    console.log(`Added pattern: ${pattern}`);
    return;
  }

  if (sub === "remove") {
    const pattern = argv[1];
    if (!pattern) {
      console.error("Error: pattern required");
      process.exitCode = 1;
      return;
    }

    const config = loadConfig();
    const idx = config.patterns.indexOf(pattern);
    if (idx < 0) {
      console.error(`Pattern not found: ${pattern}`);
      process.exitCode = 1;
      return;
    }
    config.patterns.splice(idx, 1);
    saveConfig(config);
    console.log(`Removed pattern: ${pattern}`);
    return;
  }

  if (sub === "list") {
    const config = loadConfig();
    if (config.patterns.length === 0) {
      console.log("No ignore patterns configured.");
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log(`\nIgnore Patterns (${config.patterns.length})`);
    console.log("═".repeat(50));
    for (const p of config.patterns) {
      console.log(`  ${p}`);
    }
    console.log("═".repeat(50));
    return;
  }

  if (sub === "test") {
    const filePath = argv[1];
    if (!filePath) {
      console.error("Error: filepath required");
      process.exitCode = 1;
      return;
    }

    const config = loadConfig();
    const matched = config.patterns.filter((p) => matchesPattern(filePath, p));

    if (matched.length > 0) {
      console.log(`${filePath} — IGNORED (matches: ${matched.join(", ")})`);
    } else {
      console.log(`${filePath} — NOT ignored`);
    }
    return;
  }

  console.error(`Error: unknown subcommand: ${sub}`);
  process.exitCode = 1;
}
