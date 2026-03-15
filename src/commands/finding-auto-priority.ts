import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-auto-priority ──────────────────────────────────────────
   Auto-prioritize findings using multi-factor scoring: severity,
   confidence, patch availability, and recommendation complexity.
   Outputs a priority-ordered list for efficient remediation.
   ─────────────────────────────────────────────────────────────────── */

interface PrioritizedFinding {
  rank: number;
  ruleId: string;
  title: string;
  severity: string;
  priorityScore: number;
  priorityLabel: string;
  factors: string[];
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 10,
  high: 8,
  medium: 5,
  low: 3,
  info: 1,
};

function prioritize(verdict: TribunalVerdict): PrioritizedFinding[] {
  const results: PrioritizedFinding[] = [];

  for (const f of verdict.findings ?? []) {
    const factors: string[] = [];
    let score = 0;

    // Severity factor
    const sevWeight = SEVERITY_WEIGHT[f.severity] ?? 3;
    score += sevWeight;
    factors.push(`severity=${f.severity} (+${sevWeight})`);

    // Confidence factor
    if (f.confidence !== undefined && f.confidence !== null) {
      const confBoost = f.confidence >= 0.9 ? 3 : f.confidence >= 0.7 ? 2 : 1;
      score += confBoost;
      factors.push(`confidence=${f.confidence} (+${confBoost})`);
    }

    // Patch availability factor
    if (f.patch !== undefined && f.patch !== null) {
      score += 2;
      factors.push("patch available (+2)");
    }

    // Short recommendation = likely simple fix = higher priority
    if (f.recommendation.length < 100) {
      score += 1;
      factors.push("simple recommendation (+1)");
    }

    let priorityLabel: string;
    if (score >= 12) priorityLabel = "P0 — Immediate";
    else if (score >= 9) priorityLabel = "P1 — High";
    else if (score >= 6) priorityLabel = "P2 — Normal";
    else if (score >= 3) priorityLabel = "P3 — Low";
    else priorityLabel = "P4 — Backlog";

    results.push({
      rank: 0,
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      priorityScore: score,
      priorityLabel,
      factors,
    });
  }

  results.sort((a, b) => b.priorityScore - a.priorityScore);
  for (let i = 0; i < results.length; i++) {
    results[i].rank = i + 1;
  }

  return results;
}

export function runFindingAutoPriority(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-auto-priority [options]

Auto-prioritize findings with multi-factor scoring.

Options:
  --report <path>      Path to verdict JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
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
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const prioritized = prioritize(data);

  if (format === "json") {
    console.log(JSON.stringify(prioritized, null, 2));
    return;
  }

  console.log(`\n=== Auto Priority (${prioritized.length} findings) ===\n`);

  if (prioritized.length === 0) {
    console.log("No findings to prioritize.");
    return;
  }

  console.log("  " + "#".padEnd(4) + "Score".padEnd(8) + "Priority".padEnd(18) + "Rule ID");
  console.log("  " + "-".repeat(55));

  for (const p of prioritized) {
    console.log(
      "  " + String(p.rank).padEnd(4) + String(p.priorityScore).padEnd(8) + p.priorityLabel.padEnd(18) + p.ruleId,
    );
  }
}
