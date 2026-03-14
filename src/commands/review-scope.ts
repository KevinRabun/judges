/**
 * Review-scope — Define and manage review scope boundaries.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScopeConfig {
  version: string;
  name: string;
  include: string[];
  exclude: string[];
  languages: string[];
  maxFileSize: number;
  maxFiles: number;
  focusDirs: string[];
  ignoreDirs: string[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const SCOPE_FILE = join(".judges", "review-scope.json");

function loadScope(): ScopeConfig {
  if (!existsSync(SCOPE_FILE)) {
    return {
      version: "1.0.0",
      name: "default",
      include: ["**/*"],
      exclude: ["node_modules/**", "dist/**", ".git/**", "*.min.js", "*.min.css"],
      languages: [],
      maxFileSize: 500000,
      maxFiles: 1000,
      focusDirs: [],
      ignoreDirs: ["node_modules", "dist", ".git", "vendor", "build", "coverage"],
    };
  }
  try {
    return JSON.parse(readFileSync(SCOPE_FILE, "utf-8")) as ScopeConfig;
  } catch {
    return {
      version: "1.0.0",
      name: "default",
      include: ["**/*"],
      exclude: [],
      languages: [],
      maxFileSize: 500000,
      maxFiles: 1000,
      focusDirs: [],
      ignoreDirs: [],
    };
  }
}

function saveScope(config: ScopeConfig): void {
  mkdirSync(dirname(SCOPE_FILE), { recursive: true });
  writeFileSync(SCOPE_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewScope(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-scope — Define review scope boundaries

Usage:
  judges review-scope show                     Show current scope
  judges review-scope set --name production    Set scope name
  judges review-scope include --pattern "src/**"   Add include pattern
  judges review-scope exclude --pattern "test/**"  Add exclude pattern
  judges review-scope focus --dir src/core          Add focus directory
  judges review-scope ignore --dir vendor           Add ignore directory
  judges review-scope language --add python         Add language filter
  judges review-scope reset                         Reset to defaults

Subcommands:
  show                 Show current scope configuration
  set                  Set a scope property
  include              Add include pattern
  exclude              Add exclude pattern
  focus                Add focus directory
  ignore               Add ignore directory
  language             Manage language filters
  reset                Reset to default scope

Options:
  --pattern <glob>      Glob pattern (for include/exclude)
  --dir <path>          Directory (for focus/ignore)
  --name <name>         Scope name
  --add <lang>          Add language filter
  --remove <lang>       Remove language filter
  --max-size <bytes>    Maximum file size to review
  --max-files <n>       Maximum number of files
  --format json         JSON output
  --help, -h            Show this help

Scope configuration is stored in .judges/review-scope.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand =
    argv.find((a) => ["show", "set", "include", "exclude", "focus", "ignore", "language", "reset"].includes(a)) ||
    "show";
  const config = loadScope();

  if (subcommand === "reset") {
    const defaults = loadScope();
    defaults.include = ["**/*"];
    defaults.exclude = ["node_modules/**", "dist/**", ".git/**", "*.min.js", "*.min.css"];
    defaults.languages = [];
    defaults.focusDirs = [];
    defaults.ignoreDirs = ["node_modules", "dist", ".git", "vendor", "build", "coverage"];
    saveScope(defaults);
    console.log("Scope reset to defaults.");
    return;
  }

  if (subcommand === "set") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");
    const maxSize = argv.find((_a: string, i: number) => argv[i - 1] === "--max-size");
    const maxFiles = argv.find((_a: string, i: number) => argv[i - 1] === "--max-files");

    if (name) config.name = name;
    if (maxSize) config.maxFileSize = parseInt(maxSize, 10);
    if (maxFiles) config.maxFiles = parseInt(maxFiles, 10);

    saveScope(config);
    console.log("Scope updated.");
    return;
  }

  if (subcommand === "include") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern");
    if (pattern && !config.include.includes(pattern)) {
      config.include.push(pattern);
      saveScope(config);
      console.log(`Added include pattern: ${pattern}`);
    } else {
      console.error("Error: --pattern is required.");
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "exclude") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern");
    if (pattern && !config.exclude.includes(pattern)) {
      config.exclude.push(pattern);
      saveScope(config);
      console.log(`Added exclude pattern: ${pattern}`);
    } else {
      console.error("Error: --pattern is required.");
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "focus") {
    const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir");
    if (dir && !config.focusDirs.includes(dir)) {
      config.focusDirs.push(dir);
      saveScope(config);
      console.log(`Added focus directory: ${dir}`);
    } else {
      console.error("Error: --dir is required.");
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "ignore") {
    const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir");
    if (dir && !config.ignoreDirs.includes(dir)) {
      config.ignoreDirs.push(dir);
      saveScope(config);
      console.log(`Added ignore directory: ${dir}`);
    } else {
      console.error("Error: --dir is required.");
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "language") {
    const add = argv.find((_a: string, i: number) => argv[i - 1] === "--add");
    const remove = argv.find((_a: string, i: number) => argv[i - 1] === "--remove");
    if (add && !config.languages.includes(add)) {
      config.languages.push(add);
      saveScope(config);
      console.log(`Added language filter: ${add}`);
    } else if (remove) {
      config.languages = config.languages.filter((l) => l !== remove);
      saveScope(config);
      console.log(`Removed language filter: ${remove}`);
    } else {
      console.log(`Languages: ${config.languages.length > 0 ? config.languages.join(", ") : "(all)"}`);
    }
    return;
  }

  // Show
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\n  Review Scope: ${config.name}\n  ═════════════════════════════`);
  console.log(`    Include: ${config.include.join(", ")}`);
  console.log(`    Exclude: ${config.exclude.join(", ")}`);
  console.log(`    Languages: ${config.languages.length > 0 ? config.languages.join(", ") : "(all)"}`);
  console.log(`    Max file size: ${config.maxFileSize} bytes`);
  console.log(`    Max files: ${config.maxFiles}`);
  console.log(`    Focus dirs: ${config.focusDirs.length > 0 ? config.focusDirs.join(", ") : "(none)"}`);
  console.log(`    Ignore dirs: ${config.ignoreDirs.join(", ")}`);
  console.log();
}
