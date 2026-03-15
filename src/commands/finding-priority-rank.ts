import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-priority-rank ──────────────────────────────────────────
   Rank findings by actionable priority using severity, confidence,
   and impact heuristics. Helps teams focus on the most valuable
   fixes first.
   ─────────────────────────────────────────────────────────────────── */

interface RankedFinding {
  rank: number;
  ruleId: string;
  title: string;
  severity: string;
  confidence: number;
  priorityScore: number;
  rationale: string;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  info: 10,
};

function rankFindings(findings: Finding[]): RankedFinding[] {
  const scored: RankedFinding[] = findings.map((f) => {
    const sevWeight = SEVERITY_WEIGHT[f.severity] ?? 10;
    const conf = f.confidence ?? 0.5;
    const hasFix = f.patch !== undefined && f.patch !== null ? 15 : 0;
    const priorityScore = Math.round(sevWeight * conf + hasFix);

    let rationale = `${f.severity} severity`;
    if (conf >= 0.8) rationale += ", high confidence";
    if (hasFix > 0) rationale += ", fix available";

    return {
      rank: 0,
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      confidence: Math.round(conf * 100),
      priorityScore,
      rationale,
    };
  });

  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1;
  }

  return scored;
}

export function runFindingPriorityRank(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-priority-rank [options]

Rank findings by actionable priority.

Options:
  --report <path>      Path to verdict JSON file
  --top <n>            Show top N findings (default: all)
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

  const topIdx = argv.indexOf("--top");
  const topN = topIdx !== -1 && argv[topIdx + 1] ? parseInt(argv[topIdx + 1], 10) : 0;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to rank.");
    return;
  }

  let ranked = rankFindings(findings);
  if (topN > 0) {
    ranked = ranked.slice(0, topN);
  }

  if (format === "json") {
    console.log(JSON.stringify(ranked, null, 2));
    return;
  }

  console.log("\n=== Finding Priority Ranking ===\n");
  for (const r of ranked) {
    console.log(`#${r.rank} [Score: ${r.priorityScore}] ${r.ruleId}: ${r.title}`);
    console.log(`   ${r.severity} | ${r.confidence}% confidence | ${r.rationale}`);
    console.log();
  }
}
