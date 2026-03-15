/**
 * Finding-pattern-library — Manage a local library of finding patterns for reuse.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PatternEntry {
  ruleId: string;
  title: string;
  severity: string;
  description: string;
  recommendation: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

interface PatternLibrary {
  version: number;
  patterns: PatternEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadLibrary(libPath: string): PatternLibrary {
  if (!existsSync(libPath)) {
    return { version: 1, patterns: [] };
  }
  try {
    return JSON.parse(readFileSync(libPath, "utf-8"));
  } catch {
    return { version: 1, patterns: [] };
  }
}

function saveLibrary(libPath: string, lib: PatternLibrary): void {
  const dir = dirname(libPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(libPath, JSON.stringify(lib, null, 2));
}

function importPatterns(lib: PatternLibrary, verdict: TribunalVerdict): number {
  const now = new Date().toISOString();
  let added = 0;

  for (const f of verdict.findings) {
    const existing = lib.patterns.find((p) => p.ruleId === f.ruleId);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = now;
    } else {
      lib.patterns.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        description: f.description,
        recommendation: f.recommendation,
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
      });
      added++;
    }
  }

  return added;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingPatternLibrary(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const fileIdx = argv.indexOf("--file");
  const libIdx = argv.indexOf("--library");
  const formatIdx = argv.indexOf("--format");
  const searchIdx = argv.indexOf("--search");
  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "list";
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const libPath = libIdx >= 0 ? argv[libIdx + 1] : ".judges-patterns.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const searchTerm = searchIdx >= 0 ? argv[searchIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-pattern-library — Manage finding pattern library

Usage:
  judges finding-pattern-library --action <action> [options]

Actions:
  list       List patterns in library (default)
  import     Import patterns from verdict file
  search     Search patterns by keyword

Options:
  --action <act>     Action: list, import, search
  --file <path>      Verdict JSON file (required for import)
  --library <path>   Library file (default: .judges-patterns.json)
  --search <term>    Search term (for search action)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const lib = loadLibrary(libPath);

  if (action === "import") {
    if (!filePath) {
      console.error("Error: --file required for import");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(filePath)) {
      console.error(`Error: not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }

    const added = importPatterns(lib, verdict);
    saveLibrary(libPath, lib);
    console.log(`Imported ${added} new patterns (${lib.patterns.length} total in library)`);
    return;
  }

  if (action === "search") {
    const term = (searchTerm || "").toLowerCase();
    const matches = lib.patterns.filter(
      (p) =>
        p.ruleId.toLowerCase().includes(term) ||
        p.title.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term),
    );

    if (format === "json") {
      console.log(JSON.stringify(matches, null, 2));
      return;
    }

    console.log(`\nPattern Search: "${searchTerm}" (${matches.length} matches)`);
    console.log("═".repeat(70));
    for (const p of matches) {
      console.log(`  ${p.ruleId.padEnd(20)} ${p.title}`);
      console.log(`    Severity: ${p.severity}  |  Occurrences: ${p.occurrences}`);
    }
    console.log("═".repeat(70));
    return;
  }

  // default: list
  if (format === "json") {
    console.log(JSON.stringify(lib, null, 2));
    return;
  }

  console.log(`\nPattern Library (${lib.patterns.length} patterns)`);
  console.log("═".repeat(75));
  console.log(`${"Rule".padEnd(20)} ${"Severity".padEnd(10)} ${"Seen".padEnd(6)} ${"Last Seen".padEnd(22)} Title`);
  console.log("─".repeat(75));

  const sorted = [...lib.patterns].sort((a, b) => b.occurrences - a.occurrences);
  for (const p of sorted) {
    const rule = p.ruleId.length > 18 ? p.ruleId.slice(0, 18) + "…" : p.ruleId;
    const title = p.title.length > 20 ? p.title.slice(0, 20) + "…" : p.title;
    const lastSeen = p.lastSeen.slice(0, 19);
    console.log(
      `${rule.padEnd(20)} ${p.severity.padEnd(10)} ${String(p.occurrences).padEnd(6)} ${lastSeen.padEnd(22)} ${title}`,
    );
  }
  console.log("═".repeat(75));
}
