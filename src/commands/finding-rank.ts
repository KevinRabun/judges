/**
 * Finding-rank — Rank findings by business impact and fix effort.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Scoring ────────────────────────────────────────────────────────────────

const SEVERITY_IMPACT: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  info: 10,
};

function estimateEffort(f: Finding): number {
  // Estimated fix effort (1-10 scale): lower = easier to fix
  if (f.patch) return 2; // Has auto-fix
  if (f.recommendation) return 4; // Has guidance
  const sev = (f.severity || "medium").toLowerCase();
  if (sev === "low" || sev === "info") return 3;
  if (sev === "critical") return 8;
  return 5;
}

function computePriority(f: Finding): number {
  const impact = SEVERITY_IMPACT[(f.severity || "medium").toLowerCase()] || 50;
  const conf = (f.confidence ?? 0.5) * 100;
  const effort = estimateEffort(f);
  // Priority = high impact + high confidence + low effort = higher score
  return Math.round(impact * 0.5 + conf * 0.3 + (10 - effort) * 2);
}

interface RankedFinding {
  rank: number;
  priority: number;
  impact: number;
  effort: number;
  finding: Finding;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRank(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-rank — Rank findings by business impact and fix effort

Usage:
  judges finding-rank --file verdict.json       Rank all findings
  judges finding-rank --file verdict.json --top 10  Show top 10
  judges finding-rank --file verdict.json --quick-wins  Show easy high-impact fixes

Options:
  --file <path>         Verdict JSON to rank
  --top <n>             Show only top N findings
  --quick-wins          Show findings with high impact and low effort
  --format json         JSON output
  --help, -h            Show this help

Rankings prioritize by: severity (50%), confidence (30%),
and fix ease (20%). Quick-wins filter for high-impact, low-effort items.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const topN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--top") || "0", 10);
  const quickWins = argv.includes("--quick-wins");

  if (!file) {
    console.error("Error: --file is required.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Could not parse ${file}`);
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  let ranked: RankedFinding[] = findings.map((f) => ({
    rank: 0,
    priority: computePriority(f),
    impact: SEVERITY_IMPACT[(f.severity || "medium").toLowerCase()] || 50,
    effort: estimateEffort(f),
    finding: f,
  }));

  // Sort by priority descending
  ranked.sort((a, b) => b.priority - a.priority);

  // Assign ranks
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });

  // Filter quick wins: high impact (>=50), low effort (<=4)
  if (quickWins) {
    ranked = ranked.filter((r) => r.impact >= 50 && r.effort <= 4);
  }

  // Limit
  if (topN > 0) {
    ranked = ranked.slice(0, topN);
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          total: findings.length,
          shown: ranked.length,
          rankings: ranked.map((r) => ({
            rank: r.rank,
            priority: r.priority,
            impact: r.impact,
            effort: r.effort,
            ruleId: r.finding.ruleId,
            title: r.finding.title,
            severity: r.finding.severity,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n  Finding Rankings${quickWins ? " (Quick Wins)" : ""}\n  ═════════════════════════════`);
  console.log(`    Total findings: ${findings.length}`);
  console.log(`    Showing: ${ranked.length}`);
  console.log();

  if (ranked.length === 0) {
    console.log("    No findings match criteria.");
    console.log();
    return;
  }

  console.log("    Rank  Priority  Impact  Effort  Finding");
  console.log("    ────  ────────  ──────  ──────  ───────");

  for (const r of ranked) {
    const sev = (r.finding.severity || "").toUpperCase().slice(0, 4).padEnd(4);
    const title = (r.finding.title || r.finding.ruleId || "").slice(0, 40);
    const hasPatch = r.finding.patch ? " 🔧" : "";
    console.log(
      `    #${String(r.rank).padEnd(4)} ${String(r.priority).padStart(4)}      ${String(r.impact).padStart(4)}    ${String(r.effort).padStart(4)}    [${sev}] ${title}${hasPatch}`,
    );
  }

  if (quickWins && ranked.length > 0) {
    console.log(`\n    💡 ${ranked.length} quick win(s) — high impact, low effort`);
  }

  console.log();
}
