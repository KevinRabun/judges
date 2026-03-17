/**
 * Ownership map — generate and validate code ownership coverage from
 * CODEOWNERS, git history, and module boundaries.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, relative } from "path";
import { matchGlobPath, runGit } from "../tools/command-safety.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OwnershipGap {
  path: string;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

interface OwnerEntry {
  pattern: string;
  owners: string[];
}

// ─── CODEOWNERS Parsing ─────────────────────────────────────────────────────

function parseCodeowners(dir: string): OwnerEntry[] {
  const candidates = [join(dir, "CODEOWNERS"), join(dir, ".github", "CODEOWNERS"), join(dir, "docs", "CODEOWNERS")];
  for (const path of candidates) {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      const entries: OwnerEntry[] = [];
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          entries.push({ pattern: parts[0], owners: parts.slice(1) });
        }
      }
      return entries;
    }
  }
  return [];
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs", ".rb"]);

function collectSourceFiles(dir: string, max = 500): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function matchesPattern(filepath: string, pattern: string): boolean {
  return matchGlobPath(filepath, pattern) || filepath.startsWith(pattern) || filepath === pattern;
}

function getRecentAuthors(dir: string, filepath: string, months = 6): string[] {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const dateStr = since.toISOString().split("T")[0];
    const output = runGit(["log", `--since=${dateStr}`, "--format=%ae", "--", filepath], {
      cwd: dir,
      timeout: 5000,
    });
    if (!output) return [];
    return [...new Set(output.split("\n"))];
  } catch {
    return [];
  }
}

function analyze(dir: string): {
  gaps: OwnershipGap[];
  stats: { total: number; owned: number; orphaned: number; stale: number };
} {
  const gaps: OwnershipGap[] = [];
  const entries = parseCodeowners(dir);
  const files = collectSourceFiles(dir);

  if (entries.length === 0) {
    gaps.push({
      path: "CODEOWNERS",
      issue: "No CODEOWNERS file",
      severity: "high",
      detail: "Create a CODEOWNERS file to formalize code ownership",
    });
    return { gaps, stats: { total: files.length, owned: 0, orphaned: files.length, stale: 0 } };
  }

  let owned = 0;
  let orphaned = 0;
  let stale = 0;

  // Check top-level directories for ownership
  const dirs = new Set<string>();
  for (const f of files) {
    const rel = relative(dir, f).replace(/\\/g, "/");
    const topDir = rel.split("/")[0];
    dirs.add(topDir);

    // Check if file has an owner
    const hasOwner = entries.some((e) => matchesPattern(rel, e.pattern));
    if (hasOwner) {
      owned++;
    } else {
      orphaned++;
      if (orphaned <= 15) {
        gaps.push({
          path: rel,
          issue: "No code owner",
          severity: "medium",
          detail: "File has no matching CODEOWNERS entry",
        });
      }
    }
  }

  if (orphaned > 15) {
    gaps.push({
      path: "(multiple)",
      issue: `${orphaned - 15} more unowned files`,
      severity: "medium",
      detail: "Add broader patterns to CODEOWNERS",
    });
  }

  // Check for stale owners (paths with owner but no recent commits)
  for (const entry of entries) {
    const matchingFiles = files.filter((f) => matchesPattern(relative(dir, f).replace(/\\/g, "/"), entry.pattern));
    if (matchingFiles.length === 0) {
      gaps.push({
        path: entry.pattern,
        issue: "CODEOWNERS pattern matches no files",
        severity: "low",
        detail: `Pattern "${entry.pattern}" → ${entry.owners.join(", ")} matches nothing`,
      });
      continue;
    }
    // Sample one file for recency
    const sample = matchingFiles[0];
    const authors = getRecentAuthors(dir, sample);
    if (authors.length === 0) {
      stale++;
      gaps.push({
        path: entry.pattern,
        issue: "Stale ownership",
        severity: "medium",
        detail: `No commits in 6 months for "${entry.pattern}" (owners: ${entry.owners.join(", ")})`,
      });
    }
  }

  // Check for overlapping patterns
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const iFiles = files.filter((f) => matchesPattern(relative(dir, f).replace(/\\/g, "/"), entries[i].pattern));
      const jFiles = files.filter((f) => matchesPattern(relative(dir, f).replace(/\\/g, "/"), entries[j].pattern));
      const overlap = iFiles.filter((f) => jFiles.includes(f));
      if (overlap.length > 0) {
        gaps.push({
          path: `${entries[i].pattern} ∩ ${entries[j].pattern}`,
          issue: "Overlapping ownership patterns",
          severity: "low",
          detail: `${overlap.length} files match both patterns — later pattern takes precedence`,
        });
      }
    }
  }

  return { gaps, stats: { total: files.length, owned, orphaned, stale } };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runOwnershipMap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ownership-map — Generate and validate code ownership coverage

Usage:
  judges ownership-map [dir]
  judges ownership-map --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: CODEOWNERS coverage, orphaned files, stale owners, overlapping patterns.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const { gaps, stats } = analyze(dir);
  const coveragePct = stats.total > 0 ? Math.round((stats.owned / stats.total) * 100) : 100;
  const score = Math.max(0, coveragePct - stats.stale * 5);

  if (format === "json") {
    console.log(
      JSON.stringify({ gaps, stats, coverage: coveragePct, score, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    const badge = coveragePct >= 90 ? "✅ GOOD" : coveragePct >= 60 ? "⚠️  PARTIAL" : "❌ LOW";
    console.log(`\n  Ownership Coverage: ${badge} (${coveragePct}%)\n  ──────────────────────────────`);
    console.log(
      `    Total files: ${stats.total} | Owned: ${stats.owned} | Orphaned: ${stats.orphaned} | Stale: ${stats.stale}\n`,
    );

    if (gaps.length === 0) {
      console.log("    No ownership issues detected.\n");
      return;
    }

    for (const g of gaps) {
      const icon = g.severity === "high" ? "🔴" : g.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${g.issue}`);
      console.log(`        ${g.path}`);
      console.log(`        ${g.detail}`);
    }

    console.log(`\n    Score: ${score}/100\n`);
  }
}
