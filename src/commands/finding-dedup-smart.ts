import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-dedup-smart ────────────────────────────────────────────
   Smart deduplication of similar findings using rule ID, severity,
   title similarity, and line proximity to reduce noise and help
   reviewers focus on unique issues.
   ─────────────────────────────────────────────────────────────────── */

interface DedupGroup {
  canonical: string;
  severity: string;
  count: number;
  duplicateRules: string[];
  lineRanges: number[];
  recommendation: string;
}

function smartDedup(findings: Finding[]): DedupGroup[] {
  const groups: DedupGroup[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < findings.length; i++) {
    if (processed.has(i)) continue;

    const f = findings[i];
    const duplicates: string[] = [];
    const lines: number[] = f.lineNumbers !== undefined ? [...f.lineNumbers] : [];

    for (let j = i + 1; j < findings.length; j++) {
      if (processed.has(j)) continue;

      const other = findings[j];

      const sameRule = f.ruleId === other.ruleId;
      const sameSeverity = f.severity === other.severity;
      const similarTitle = titleSimilarity(f.title, other.title) > 0.6;
      const closeLines = linesOverlap(f.lineNumbers, other.lineNumbers);

      if ((sameRule && sameSeverity) || (similarTitle && closeLines)) {
        processed.add(j);
        duplicates.push(other.ruleId);
        if (other.lineNumbers !== undefined) {
          lines.push(...other.lineNumbers);
        }
      }
    }

    processed.add(i);

    const uniqueLines = [...new Set(lines)].sort((a, b) => a - b);

    groups.push({
      canonical: f.ruleId,
      severity: f.severity,
      count: 1 + duplicates.length,
      duplicateRules: duplicates,
      lineRanges: uniqueLines,
      recommendation:
        duplicates.length > 0 ? `${duplicates.length} duplicate(s) can be consolidated` : "Unique finding",
    });
  }

  return groups;
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const total = Math.max(wordsA.size, wordsB.size);
  return total > 0 ? overlap / total : 0;
}

function linesOverlap(a?: number[], b?: number[]): boolean {
  if (a === undefined || b === undefined) return false;
  if (a.length === 0 || b.length === 0) return false;
  const minA = Math.min(...a);
  const maxA = Math.max(...a);
  const minB = Math.min(...b);
  const maxB = Math.max(...b);
  return Math.abs(minA - minB) <= 5 || (minA <= maxB && minB <= maxA);
}

export function runFindingDedupSmart(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-dedup-smart [options]

Smart deduplication of similar findings.

Options:
  --report <path>    Path to verdict JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    console.log("Run a review first or provide --report.");
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to deduplicate.");
    return;
  }

  const groups = smartDedup(findings);
  const totalDuplicates = groups.reduce((sum, g) => sum + g.count - 1, 0);

  if (format === "json") {
    console.log(JSON.stringify({ groups, totalDuplicates, uniqueGroups: groups.length }, null, 2));
    return;
  }

  console.log("\n=== Smart Deduplication ===\n");
  console.log(`Original findings: ${findings.length}`);
  console.log(`Unique groups: ${groups.length}`);
  console.log(`Duplicates removed: ${totalDuplicates}\n`);

  for (const g of groups) {
    console.log(`[${g.severity.toUpperCase()}] ${g.canonical} (${g.count} instance(s))`);
    if (g.lineRanges.length > 0) {
      console.log(`  Lines: ${g.lineRanges.join(", ")}`);
    }
    console.log(`  → ${g.recommendation}`);
  }
}
