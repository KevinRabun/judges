/**
 * Finding-duplicate-detect — Detect duplicate or near-duplicate findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  representativeRule: string;
  title: string;
  count: number;
  indices: number[];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDuplicateDetect(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const thresholdIdx = argv.indexOf("--threshold");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const threshold = thresholdIdx >= 0 ? parseFloat(argv[thresholdIdx + 1]) : 0.8;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-duplicate-detect — Detect duplicate findings

Usage:
  judges finding-duplicate-detect --report <path> [--threshold <n>]
                                  [--format table|json]

Options:
  --report <path>     Report file with findings
  --threshold <n>     Similarity threshold 0-1 (default: 0.8)
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  if (reportIdx < 0) {
    console.error("Missing --report <path>");
    process.exitCode = 1;
    return;
  }

  const reportPath = argv[reportIdx + 1];
  if (!existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
  const findings = report.findings ?? [];

  if (findings.length < 2) {
    console.log("Need at least 2 findings to detect duplicates.");
    return;
  }

  // Group by exact ruleId match first
  const ruleGroups: Record<string, number[]> = {};
  for (let i = 0; i < findings.length; i++) {
    const key = findings[i].ruleId;
    if (ruleGroups[key] === undefined) {
      ruleGroups[key] = [];
    }
    ruleGroups[key].push(i);
  }

  // Then check title similarity within different rules
  const duplicates: DuplicateGroup[] = [];

  // Exact rule duplicates
  for (const [ruleId, indices] of Object.entries(ruleGroups)) {
    if (indices.length > 1) {
      duplicates.push({
        representativeRule: ruleId,
        title: findings[indices[0]].title,
        count: indices.length,
        indices,
      });
    }
  }

  // Near-duplicate by title similarity across different rules
  const checked = new Set<string>();
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      if (findings[i].ruleId === findings[j].ruleId) continue;
      const key = `${i}:${j}`;
      if (checked.has(key)) continue;
      checked.add(key);

      const sim = jaccardSimilarity(findings[i].title, findings[j].title);
      if (sim >= threshold) {
        duplicates.push({
          representativeRule: `${findings[i].ruleId} ~ ${findings[j].ruleId}`,
          title: findings[i].title,
          count: 2,
          indices: [i, j],
        });
      }
    }
  }

  if (format === "json") {
    console.log(JSON.stringify({ threshold, duplicates }, null, 2));
    return;
  }

  console.log(`\nDuplicate Detection (threshold: ${threshold})`);
  console.log("═".repeat(65));

  if (duplicates.length === 0) {
    console.log("  No duplicates detected.");
  } else {
    for (const d of duplicates) {
      console.log(`  [${d.count}x] ${d.representativeRule}`);
      console.log(`    "${d.title}"`);
      console.log(`    Indices: ${d.indices.join(", ")}`);
    }
  }

  console.log(`\n  Total findings: ${findings.length} | Duplicate groups: ${duplicates.length}`);
  console.log("═".repeat(65));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
