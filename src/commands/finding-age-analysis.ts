/**
 * Finding-age-analysis — Analyze the age and lifecycle of findings over time.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgeBucket {
  label: string;
  count: number;
  ruleIds: string[];
}

interface AgeReport {
  totalFindings: number;
  oldestTimestamp: string;
  newestTimestamp: string;
  buckets: AgeBucket[];
  recurringRules: Array<{ ruleId: string; occurrences: number }>;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeAge(verdicts: Array<{ verdict: TribunalVerdict; timestamp: string }>): AgeReport {
  const ruleOccurrences = new Map<string, number>();
  const ruleFirstSeen = new Map<string, string>();
  const now = Date.now();

  const timestamps = verdicts.map((v) => v.timestamp).sort();

  for (const v of verdicts) {
    for (const f of v.verdict.findings) {
      ruleOccurrences.set(f.ruleId, (ruleOccurrences.get(f.ruleId) || 0) + 1);
      if (!ruleFirstSeen.has(f.ruleId)) {
        ruleFirstSeen.set(f.ruleId, v.timestamp);
      }
    }
  }

  // bucket by age
  const buckets: AgeBucket[] = [
    { label: "< 1 day", count: 0, ruleIds: [] },
    { label: "1-7 days", count: 0, ruleIds: [] },
    { label: "1-4 weeks", count: 0, ruleIds: [] },
    { label: "> 4 weeks", count: 0, ruleIds: [] },
  ];

  for (const [ruleId, firstSeen] of ruleFirstSeen) {
    const age = now - new Date(firstSeen).getTime();
    const days = age / (1000 * 60 * 60 * 24);

    if (days < 1) {
      buckets[0].count++;
      buckets[0].ruleIds.push(ruleId);
    } else if (days < 7) {
      buckets[1].count++;
      buckets[1].ruleIds.push(ruleId);
    } else if (days < 28) {
      buckets[2].count++;
      buckets[2].ruleIds.push(ruleId);
    } else {
      buckets[3].count++;
      buckets[3].ruleIds.push(ruleId);
    }
  }

  // recurring rules
  const recurring = [...ruleOccurrences.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([ruleId, occurrences]) => ({ ruleId, occurrences }));

  return {
    totalFindings: ruleFirstSeen.size,
    oldestTimestamp: timestamps[0] || "",
    newestTimestamp: timestamps[timestamps.length - 1] || "",
    buckets,
    recurringRules: recurring,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAgeAnalysis(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-age-analysis — Analyze finding age over time

Usage:
  judges finding-age-analysis --dir <verdicts-dir> [--format table|json]
  judges finding-age-analysis --file <verdict.json> [--format table|json]

Options:
  --dir <path>       Directory of verdict JSON files
  --file <path>      Single verdict JSON file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const verdicts: Array<{ verdict: TribunalVerdict; timestamp: string }> = [];

  if (dirPath && existsSync(dirPath)) {
    const files = readdirSync(dirPath) as unknown as string[];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = readFileSync(`${dirPath}/${file}`, "utf-8");
        const verdict = JSON.parse(content) as TribunalVerdict;
        verdicts.push({ verdict, timestamp: verdict.timestamp || file.replace(".json", "") });
      } catch {
        // skip invalid files
      }
    }
  } else if (filePath && existsSync(filePath)) {
    try {
      const verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
      verdicts.push({ verdict, timestamp: verdict.timestamp || new Date().toISOString() });
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }
  } else {
    console.error("Error: --dir or --file required");
    process.exitCode = 1;
    return;
  }

  if (verdicts.length === 0) {
    console.log("No verdict files found");
    return;
  }

  const report = analyzeAge(verdicts);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nFinding Age Analysis`);
  console.log("═".repeat(60));
  console.log(`  Total unique findings: ${report.totalFindings}`);
  console.log(`  Reports analyzed: ${verdicts.length}`);
  console.log(`  Range: ${report.oldestTimestamp} → ${report.newestTimestamp}`);
  console.log("─".repeat(60));
  console.log(`${"Age Bucket".padEnd(16)} ${"Count".padEnd(8)} Rules`);
  console.log("─".repeat(60));

  for (const b of report.buckets) {
    const rules = b.ruleIds.slice(0, 3).join(", ");
    const more = b.ruleIds.length > 3 ? ` +${b.ruleIds.length - 3} more` : "";
    console.log(`${b.label.padEnd(16)} ${String(b.count).padEnd(8)} ${rules}${more}`);
  }

  if (report.recurringRules.length > 0) {
    console.log(`\n  Recurring Rules (${report.recurringRules.length}):`);
    for (const r of report.recurringRules.slice(0, 10)) {
      console.log(`    ${r.ruleId.padEnd(20)} × ${r.occurrences}`);
    }
  }

  console.log("═".repeat(60));
}
