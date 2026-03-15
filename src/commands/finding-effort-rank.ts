import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-effort-rank ────────────────────────────────────────────
   Rank findings by estimated fix effort based on severity, rule
   complexity, and whether auto-patches are available. Helps teams
   prioritize which findings to tackle first.
   ─────────────────────────────────────────────────────────────────── */

interface EffortEntry {
  ruleId: string;
  title: string;
  severity: string;
  effortScore: number;
  effortLabel: string;
  hasPatch: boolean;
  rationale: string;
}

const SEVERITY_EFFORT: Record<string, number> = {
  critical: 8,
  high: 6,
  medium: 4,
  low: 2,
  info: 1,
};

function estimateEffort(verdict: TribunalVerdict): EffortEntry[] {
  const results: EffortEntry[] = [];

  for (const f of verdict.findings ?? []) {
    const baseEffort = SEVERITY_EFFORT[f.severity] ?? 3;
    const hasPatch = f.patch !== undefined && f.patch !== null;
    const patchDiscount = hasPatch ? 0.5 : 1.0;
    const complexityBoost = f.recommendation.length > 200 ? 1.5 : 1.0;
    const effortScore = Math.round(baseEffort * patchDiscount * complexityBoost * 10) / 10;

    let effortLabel: string;
    if (effortScore <= 2) effortLabel = "Trivial";
    else if (effortScore <= 4) effortLabel = "Small";
    else if (effortScore <= 6) effortLabel = "Medium";
    else if (effortScore <= 8) effortLabel = "Large";
    else effortLabel = "Complex";

    const reasons: string[] = [];
    reasons.push(`base=${baseEffort} (${f.severity})`);
    if (hasPatch) reasons.push("patch available (-50%)");
    if (complexityBoost > 1) reasons.push("complex recommendation (+50%)");

    results.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      effortScore,
      effortLabel,
      hasPatch,
      rationale: reasons.join(", "),
    });
  }

  // Sort by effort ascending — easiest first (quick wins)
  results.sort((a, b) => a.effortScore - b.effortScore);
  return results;
}

export function runFindingEffortRank(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-effort-rank [options]

Rank findings by estimated fix effort.

Options:
  --report <path>      Path to verdict JSON
  --sort <order>       Sort order: easy-first (default) or hard-first
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const sortIdx = argv.indexOf("--sort");
  const sortOrder = sortIdx !== -1 && argv[sortIdx + 1] ? argv[sortIdx + 1] : "easy-first";

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
  const ranked = estimateEffort(data);

  if (sortOrder === "hard-first") ranked.reverse();

  if (format === "json") {
    console.log(JSON.stringify(ranked, null, 2));
    return;
  }

  console.log(`\n=== Effort Ranking (${ranked.length} findings, ${sortOrder}) ===\n`);

  if (ranked.length === 0) {
    console.log("No findings to rank.");
    return;
  }

  console.log("  " + "Effort".padEnd(10) + "Score".padEnd(8) + "Severity".padEnd(10) + "Rule ID");
  console.log("  " + "-".repeat(60));

  for (const e of ranked) {
    const patch = e.hasPatch ? " [patch]" : "";
    console.log(
      "  " + e.effortLabel.padEnd(10) + String(e.effortScore).padEnd(8) + e.severity.padEnd(10) + e.ruleId + patch,
    );
  }
}
