/**
 * Review-depth — Control review depth (shallow, normal, deep).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

type DepthLevel = "shallow" | "normal" | "deep";

interface DepthProfile {
  level: DepthLevel;
  maxJudges: number;
  enableAST: boolean;
  enableCrossFile: boolean;
  description: string;
}

interface DepthConfig {
  version: string;
  currentLevel: DepthLevel;
  perPath: Record<string, DepthLevel>;
}

// ─── Profiles ───────────────────────────────────────────────────────────────

const PROFILES: Record<DepthLevel, DepthProfile> = {
  shallow: {
    level: "shallow",
    maxJudges: 5,
    enableAST: false,
    enableCrossFile: false,
    description: "Quick scan — top security rules only",
  },
  normal: {
    level: "normal",
    maxJudges: 20,
    enableAST: true,
    enableCrossFile: false,
    description: "Standard review — core judges with AST",
  },
  deep: {
    level: "deep",
    maxJudges: 45,
    enableAST: true,
    enableCrossFile: true,
    description: "Full review — all judges, cross-file analysis",
  },
};

// ─── Storage ────────────────────────────────────────────────────────────────

const DEPTH_FILE = ".judges/review-depth.json";

function loadConfig(): DepthConfig {
  if (!existsSync(DEPTH_FILE)) return { version: "1.0.0", currentLevel: "normal", perPath: {} };
  try {
    return JSON.parse(readFileSync(DEPTH_FILE, "utf-8")) as DepthConfig;
  } catch {
    return { version: "1.0.0", currentLevel: "normal", perPath: {} };
  }
}

function saveConfig(config: DepthConfig): void {
  mkdirSync(dirname(DEPTH_FILE), { recursive: true });
  writeFileSync(DEPTH_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDepth(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-depth — Control review depth

Usage:
  judges review-depth                                Show current depth
  judges review-depth set --level deep
  judges review-depth set-path --path src/auth --level deep
  judges review-depth profiles
  judges review-depth reset

Subcommands:
  (default)             Show current depth setting
  set                   Set global review depth
  set-path              Set depth for a specific path
  profiles              Show available depth profiles
  reset                 Reset to default (normal)

Depth Levels:
  shallow               Quick scan — top security rules only
  normal                Standard review — core judges with AST
  deep                  Full review — all judges, cross-file analysis

Options:
  --level <level>       Depth level: shallow, normal, deep
  --path <path>         File or directory path
  --format json         JSON output
  --help, -h            Show this help

Config stored in .judges/review-depth.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["set", "set-path", "profiles", "reset"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const config = loadConfig();

  if (subcommand === "set") {
    const level = argv.find((_a: string, i: number) => argv[i - 1] === "--level") as DepthLevel | undefined;
    if (!level || !PROFILES[level]) {
      console.log("Invalid level. Use: shallow, normal, deep");
      return;
    }
    config.currentLevel = level;
    saveConfig(config);
    console.log(`Review depth set to: ${level} — ${PROFILES[level].description}`);
    return;
  }

  if (subcommand === "set-path") {
    const path = argv.find((_a: string, i: number) => argv[i - 1] === "--path") || "";
    const level = argv.find((_a: string, i: number) => argv[i - 1] === "--level") as DepthLevel | undefined;
    if (!path || !level || !PROFILES[level]) {
      console.log("Specify --path and --level (shallow, normal, deep).");
      return;
    }
    config.perPath[path] = level;
    saveConfig(config);
    console.log(`Set ${path} → ${level}`);
    return;
  }

  if (subcommand === "profiles") {
    if (format === "json") {
      console.log(JSON.stringify(PROFILES, null, 2));
      return;
    }
    console.log("\nDepth Profiles:");
    console.log("═".repeat(50));
    for (const [, p] of Object.entries(PROFILES)) {
      console.log(`  ${p.level.padEnd(10)} ${p.description}`);
      console.log(`             judges=${p.maxJudges}  AST=${p.enableAST}  crossFile=${p.enableCrossFile}`);
    }
    console.log("═".repeat(50));
    return;
  }

  if (subcommand === "reset") {
    saveConfig({ version: "1.0.0", currentLevel: "normal", perPath: {} });
    console.log("Review depth reset to normal.");
    return;
  }

  // Default: show current
  const profile = PROFILES[config.currentLevel];
  if (format === "json") {
    console.log(JSON.stringify({ current: config.currentLevel, profile, perPath: config.perPath }, null, 2));
    return;
  }
  console.log(`\nCurrent Review Depth: ${config.currentLevel}`);
  console.log(`  ${profile.description}`);
  console.log(`  Max judges: ${profile.maxJudges}  AST: ${profile.enableAST}  Cross-file: ${profile.enableCrossFile}`);

  const pathEntries = Object.entries(config.perPath);
  if (pathEntries.length > 0) {
    console.log("\nPath Overrides:");
    for (const [p, l] of pathEntries) {
      console.log(`  ${p} → ${l}`);
    }
  }
}
