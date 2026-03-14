/**
 * Review-exclude-vendor — Exclude vendor/third-party code from reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VendorExclusion {
  pattern: string;
  reason: string;
  addedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function exclusionFile(): string {
  return join(process.cwd(), ".judges", "vendor-exclusions.json");
}

function loadExclusions(): VendorExclusion[] {
  const f = exclusionFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveExclusions(exclusions: VendorExclusion[]): void {
  const f = exclusionFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(exclusions, null, 2));
}

const DEFAULT_VENDOR_PATTERNS = [
  "node_modules/**",
  "vendor/**",
  "third_party/**",
  "bower_components/**",
  "dist/**",
  "build/**",
  "*.min.js",
  "*.min.css",
  "*.bundle.js",
  "**/*.lock",
  "**/package-lock.json",
  "**/yarn.lock",
];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewExcludeVendor(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-exclude-vendor — Exclude vendor/third-party code

Usage:
  judges review-exclude-vendor list
  judges review-exclude-vendor add     --pattern <glob> [--reason <text>]
  judges review-exclude-vendor remove  --pattern <glob>
  judges review-exclude-vendor init    (add default vendor patterns)
  judges review-exclude-vendor test    --file <path>
  judges review-exclude-vendor clear

Options:
  --pattern <glob>   Glob pattern to exclude
  --reason <text>    Reason for exclusion
  --file <path>      Test if a file matches exclusions
  --help, -h         Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const exclusions = loadExclusions();

  if (sub === "list") {
    if (exclusions.length === 0) {
      console.log("No vendor exclusions configured. Run 'init' to add defaults.");
      return;
    }
    console.log(`\nVendor Exclusions (${exclusions.length}):`);
    console.log("═".repeat(60));
    for (const e of exclusions) {
      const reason = e.reason ? ` (${e.reason})` : "";
      console.log(`  ${e.pattern}${reason}`);
    }
    console.log("═".repeat(60));
  } else if (sub === "add") {
    const pattern = args.find((_a: string, i: number) => args[i - 1] === "--pattern");
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    if (exclusions.some((e) => e.pattern === pattern)) {
      console.log(`Pattern already exists: ${pattern}`);
      return;
    }
    const reason = args.find((_a: string, i: number) => args[i - 1] === "--reason") || "";
    exclusions.push({ pattern, reason, addedAt: new Date().toISOString() });
    saveExclusions(exclusions);
    console.log(`Added exclusion: ${pattern}`);
  } else if (sub === "remove") {
    const pattern = args.find((_a: string, i: number) => args[i - 1] === "--pattern");
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    const filtered = exclusions.filter((e) => e.pattern !== pattern);
    if (filtered.length === exclusions.length) {
      console.error(`Pattern not found: ${pattern}`);
      process.exitCode = 1;
      return;
    }
    saveExclusions(filtered);
    console.log(`Removed exclusion: ${pattern}`);
  } else if (sub === "init") {
    const existing = new Set(exclusions.map((e) => e.pattern));
    let added = 0;
    for (const p of DEFAULT_VENDOR_PATTERNS) {
      if (!existing.has(p)) {
        exclusions.push({ pattern: p, reason: "default vendor pattern", addedAt: new Date().toISOString() });
        added++;
      }
    }
    saveExclusions(exclusions);
    console.log(`Initialized: ${added} default patterns added (${exclusions.length} total)`);
  } else if (sub === "test") {
    const filePath = args.find((_a: string, i: number) => args[i - 1] === "--file");
    if (!filePath) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }

    const matched = exclusions.filter((e) => {
      if (e.pattern.includes("**")) {
        const prefix = e.pattern.split("**")[0];
        return filePath.startsWith(prefix);
      }
      if (e.pattern.startsWith("*.")) {
        return filePath.endsWith(e.pattern.slice(1));
      }
      return filePath.includes(e.pattern.replace(/\*/g, ""));
    });

    if (matched.length > 0) {
      console.log(`Excluded: ${filePath} matches ${matched.length} pattern(s):`);
      for (const m of matched) console.log(`  - ${m.pattern}`);
    } else {
      console.log(`Not excluded: ${filePath}`);
    }
  } else if (sub === "clear") {
    saveExclusions([]);
    console.log("All vendor exclusions cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
