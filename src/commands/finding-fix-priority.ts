/**
 * Finding-fix-priority — Prioritize findings for fixing based on impact.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PrioritizedFinding {
  rank: number;
  ruleId: string;
  title: string;
  severity: string;
  confidence: number;
  priorityScore: number;
  reason: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEV_WEIGHT: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 2, info: 1 };

function prioritize(verdict: TribunalVerdict): PrioritizedFinding[] {
  return verdict.findings
    .map((f) => {
      const sev = (f.severity || "medium").toLowerCase();
      const conf = f.confidence !== undefined && f.confidence !== null ? f.confidence : 0.7;
      const sevScore = SEV_WEIGHT[sev] || 4;
      const hasFix = f.recommendation ? 1.2 : 1.0;
      const priorityScore = Math.round(sevScore * conf * hasFix * 100) / 100;

      const reasons: string[] = [];
      if (sev === "critical" || sev === "high") reasons.push("high severity");
      if (conf >= 0.8) reasons.push("high confidence");
      if (f.recommendation) reasons.push("has fix recommendation");
      if (f.patch) reasons.push("has patch available");

      return {
        rank: 0,
        ruleId: f.ruleId,
        title: f.title,
        severity: sev,
        confidence: conf,
        priorityScore,
        reason: reasons.join(", ") || "standard priority",
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((f, i) => ({ ...f, rank: i + 1 }));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFixPriority(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const topIdx = argv.indexOf("--top");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const top = topIdx >= 0 ? parseInt(argv[topIdx + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-fix-priority — Prioritize findings for fixing

Usage:
  judges finding-fix-priority --file <verdict.json> [--format table|json]
                               [--top <n>]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json
  --top <n>          Show only top N findings
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
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

  let results = prioritize(verdict);
  if (top > 0) results = results.slice(0, top);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nFix Priority (${results.length} findings)`);
  console.log("═".repeat(70));
  console.log(`${"#".padEnd(4)} ${"Score".padEnd(8)} ${"Severity".padEnd(10)} Title`);
  console.log("─".repeat(70));

  for (const r of results) {
    const title = r.title.length > 38 ? r.title.slice(0, 38) + "…" : r.title;
    console.log(`${String(r.rank).padEnd(4)} ${String(r.priorityScore).padEnd(8)} ${r.severity.padEnd(10)} ${title}`);
    if (r.reason) console.log(`     ${r.reason}`);
  }

  console.log("═".repeat(70));
}
