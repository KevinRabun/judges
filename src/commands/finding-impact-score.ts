/**
 * Finding-impact-score — Score findings by estimated impact.
 */

import { readFileSync, existsSync } from "fs";

// ─── Scoring ────────────────────────────────────────────────────────────────

interface ScoredFinding {
  ruleId: string;
  title: string;
  severity: string;
  impactScore: number;
  factors: string[];
}

function scoreFinding(finding: {
  ruleId?: string;
  title?: string;
  severity?: string;
  description?: string;
  lineNumbers?: number[];
  confidence?: number;
}): ScoredFinding {
  let score = 0;
  const factors: string[] = [];

  // Severity weight
  const sevWeights: Record<string, number> = { critical: 40, high: 30, medium: 20, low: 10, info: 5 };
  const sev = (finding.severity || "medium").toLowerCase();
  score += sevWeights[sev] || 15;
  factors.push(`severity:${sev}`);

  // Confidence boost
  if (finding.confidence !== undefined && finding.confidence !== null) {
    const confBonus = Math.round(finding.confidence * 20);
    score += confBonus;
    factors.push(`confidence:${finding.confidence}`);
  }

  // Multiple affected lines
  const lineCount = (finding.lineNumbers || []).length;
  if (lineCount > 5) {
    score += 15;
    factors.push("wide-spread");
  } else if (lineCount > 1) {
    score += 5;
    factors.push("multi-line");
  }

  // Security-related keywords
  const desc = ((finding.description || "") + " " + (finding.title || "")).toLowerCase();
  if (desc.includes("injection") || desc.includes("xss") || desc.includes("sql")) {
    score += 20;
    factors.push("injection-risk");
  }
  if (desc.includes("authentication") || desc.includes("auth")) {
    score += 15;
    factors.push("auth-related");
  }
  if (desc.includes("sensitive") || desc.includes("credential") || desc.includes("secret")) {
    score += 15;
    factors.push("data-exposure");
  }
  if (desc.includes("denial") || desc.includes("dos")) {
    score += 10;
    factors.push("availability-risk");
  }

  return {
    ruleId: finding.ruleId || "unknown",
    title: finding.title || "",
    severity: sev,
    impactScore: Math.min(100, score),
    factors,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingImpactScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-impact-score — Score findings by estimated impact

Usage:
  judges finding-impact-score --file <results> [options]

Options:
  --file <path>         Results file with findings (required)
  --min-score <n>       Show only findings with score >= N
  --top <n>             Show top N highest-impact findings (default: 10)
  --format json         JSON output
  --help, -h            Show this help

Factors: severity, confidence, affected lines, security keywords.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const minScore = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--min-score") || "0", 10);
  const topN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--top") || "10", 10);
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let findings: Array<{
    ruleId?: string;
    title?: string;
    severity?: string;
    description?: string;
    lineNumbers?: number[];
    confidence?: number;
  }>;
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    findings = Array.isArray(data) ? data : data.findings || [];
  } catch {
    console.error("Error: could not parse results file");
    process.exitCode = 1;
    return;
  }

  let scored = findings
    .map(scoreFinding)
    .filter((s) => s.impactScore >= minScore)
    .sort((a, b) => b.impactScore - a.impactScore);

  scored = scored.slice(0, topN);

  if (scored.length === 0) {
    console.log("No findings meet the criteria.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(scored, null, 2));
    return;
  }

  console.log(`\nImpact Scores (top ${topN}):`);
  console.log("═".repeat(70));
  console.log("  Score  Severity    Rule ID                  Factors");
  console.log("─".repeat(70));
  for (const s of scored) {
    const ruleDisplay = s.ruleId.length > 22 ? s.ruleId.slice(0, 19) + "..." : s.ruleId;
    console.log(
      `  ${String(s.impactScore).padStart(5)}  ${s.severity.padEnd(10)}  ${ruleDisplay.padEnd(22)}  ${s.factors.join(", ")}`,
    );
  }
  console.log("═".repeat(70));

  const avg = scored.reduce((sum, s) => sum + s.impactScore, 0) / scored.length;
  console.log(`  Average impact: ${avg.toFixed(1)}`);
}
