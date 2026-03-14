/**
 * Review-file-stats — Per-file review statistics.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileStatEntry {
  file: string;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  rules: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadVerdicts(dir: string): TribunalVerdict[] {
  if (!existsSync(dir)) return [];
  const results: TribunalVerdict[] = [];
  const files = readdirSync(dir) as unknown as string[];
  for (const f of files) {
    if (!String(f).endsWith(".json")) continue;
    try {
      const data = JSON.parse(readFileSync(join(dir, String(f)), "utf-8"));
      if (data && data.findings) results.push(data);
    } catch {
      /* skip */
    }
  }
  return results;
}

function inferFileFromFinding(title: string, ruleId: string): string {
  // Try to extract file reference from the finding title
  const fileMatch = title.match(/in\s+[`']?(\S+\.\w{1,5})[`']?/i);
  if (fileMatch) return fileMatch[1];
  // Fall back to rule-based grouping
  return ruleId.split("/")[0] || "unknown";
}

function computeStats(verdicts: TribunalVerdict[]): FileStatEntry[] {
  const map = new Map<string, FileStatEntry>();

  for (const v of verdicts) {
    for (const f of v.findings) {
      const file = inferFileFromFinding(f.title, f.ruleId);
      const entry = map.get(file) || {
        file,
        findingCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        rules: [],
      };

      entry.findingCount++;
      const sev = (f.severity || "medium").toLowerCase();
      if (sev === "critical") entry.criticalCount++;
      else if (sev === "high") entry.highCount++;
      else if (sev === "medium") entry.mediumCount++;
      else entry.lowCount++;

      if (!entry.rules.includes(f.ruleId)) entry.rules.push(f.ruleId);
      map.set(file, entry);
    }
  }

  return [...map.values()].sort((a, b) => b.findingCount - a.findingCount);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFileStats(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const topIdx = argv.indexOf("--top");
  const extIdx = argv.indexOf("--ext");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : join(process.cwd(), ".judges", "verdicts");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const top = topIdx >= 0 ? parseInt(argv[topIdx + 1], 10) : 0;
  const ext = extIdx >= 0 ? argv[extIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-file-stats — Per-file review statistics

Usage:
  judges review-file-stats [--dir <path>] [--format table|json|markdown]
                           [--top <n>] [--ext <extension>]

Options:
  --dir <path>       Directory with verdict JSON files (default: .judges/verdicts)
  --format <fmt>     Output format: table (default), json, markdown
  --top <n>          Show only top N files by finding count
  --ext <extension>  Filter by file extension (e.g., .ts, .py)
  --help, -h         Show this help
`);
    return;
  }

  const verdicts = loadVerdicts(dir);
  if (verdicts.length === 0) {
    console.log("No verdicts found.");
    return;
  }

  let stats = computeStats(verdicts);

  if (ext) {
    stats = stats.filter((s) => extname(s.file) === ext || s.file.endsWith(ext));
  }
  if (top > 0) {
    stats = stats.slice(0, top);
  }

  if (format === "json") {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (format === "markdown") {
    console.log("| File | Findings | Critical | High | Medium | Low | Rules |");
    console.log("|------|----------|----------|------|--------|-----|-------|");
    for (const s of stats) {
      console.log(
        `| ${s.file} | ${s.findingCount} | ${s.criticalCount} | ${s.highCount} | ${s.mediumCount} | ${s.lowCount} | ${s.rules.length} |`,
      );
    }
    return;
  }

  // Table format
  console.log("\nPer-File Review Statistics");
  console.log("═".repeat(80));
  console.log(
    `${"File".padEnd(30)} ${"Total".padEnd(7)} ${"Crit".padEnd(6)} ${"High".padEnd(6)} ${"Med".padEnd(6)} ${"Low".padEnd(6)} Rules`,
  );
  console.log("─".repeat(80));

  for (const s of stats) {
    const name = s.file.length > 28 ? "…" + s.file.slice(-27) : s.file;
    console.log(
      `${name.padEnd(30)} ${String(s.findingCount).padEnd(7)} ${String(s.criticalCount).padEnd(6)} ` +
        `${String(s.highCount).padEnd(6)} ${String(s.mediumCount).padEnd(6)} ${String(s.lowCount).padEnd(6)} ${s.rules.length}`,
    );
  }

  console.log("─".repeat(80));
  const totalFindings = stats.reduce((s, e) => s + e.findingCount, 0);
  console.log(`${stats.length} files, ${totalFindings} total findings`);
  console.log("═".repeat(80));
}
