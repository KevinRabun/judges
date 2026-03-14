/**
 * Review-skip-list — Manage a list of files to skip during review.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SkipEntry {
  pattern: string;
  reason: string;
  addedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function skipFile(): string {
  return join(process.cwd(), ".judges", "skip-list.json");
}

function loadSkipList(): SkipEntry[] {
  const f = skipFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveSkipList(list: SkipEntry[]): void {
  const f = skipFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(list, null, 2));
}

function shouldSkip(filePath: string, list: SkipEntry[]): SkipEntry | null {
  for (const entry of list) {
    if (entry.pattern.startsWith("*.") && filePath.endsWith(entry.pattern.slice(1))) return entry;
    if (filePath.includes(entry.pattern)) return entry;
    if (filePath === entry.pattern) return entry;
  }
  return null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSkipList(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-skip-list — Manage skip list for reviews

Usage:
  judges review-skip-list list
  judges review-skip-list add     --pattern <glob> [--reason <text>]
  judges review-skip-list remove  --pattern <glob>
  judges review-skip-list test    --file <path>
  judges review-skip-list clear

Options:
  --pattern <glob>   File pattern to skip
  --reason <text>    Reason for skipping
  --file <path>      Test if a file would be skipped
  --help, -h         Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const list = loadSkipList();

  if (sub === "list") {
    if (list.length === 0) {
      console.log("Skip list is empty.");
      return;
    }
    console.log(`\nSkip List (${list.length} entries)`);
    console.log("═".repeat(60));
    for (const e of list) {
      const reason = e.reason ? ` — ${e.reason}` : "";
      console.log(`  ${e.pattern}${reason}`);
    }
    console.log("═".repeat(60));
  } else if (sub === "add") {
    const patIdx = args.indexOf("--pattern");
    const reasonIdx = args.indexOf("--reason");
    const pattern = patIdx >= 0 ? args[patIdx + 1] : undefined;
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    if (list.some((e) => e.pattern === pattern)) {
      console.log(`Already in skip list: ${pattern}`);
      return;
    }
    const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : "";
    list.push({ pattern, reason, addedAt: new Date().toISOString() });
    saveSkipList(list);
    console.log(`Added to skip list: ${pattern}`);
  } else if (sub === "remove") {
    const patIdx = args.indexOf("--pattern");
    const pattern = patIdx >= 0 ? args[patIdx + 1] : undefined;
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    const filtered = list.filter((e) => e.pattern !== pattern);
    if (filtered.length === list.length) {
      console.error(`Not found: ${pattern}`);
      process.exitCode = 1;
      return;
    }
    saveSkipList(filtered);
    console.log(`Removed: ${pattern}`);
  } else if (sub === "test") {
    const fileIdx = args.indexOf("--file");
    const filePath = fileIdx >= 0 ? args[fileIdx + 1] : undefined;
    if (!filePath) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    const match = shouldSkip(filePath, list);
    if (match) {
      console.log(`SKIPPED: ${filePath} matches "${match.pattern}"${match.reason ? ` (${match.reason})` : ""}`);
    } else {
      console.log(`NOT SKIPPED: ${filePath}`);
    }
  } else if (sub === "clear") {
    saveSkipList([]);
    console.log("Skip list cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
