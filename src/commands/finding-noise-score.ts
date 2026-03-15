import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-noise-score ────────────────────────────────────────────
   Score each finding's "noise" level based on confidence, severity,
   and whether actionable information (patch, recommendation) is
   provided. Helps teams identify and suppress low-signal findings
   that reduce engagement.
   ─────────────────────────────────────────────────────────────────── */

interface NoiseEntry {
  ruleId: string;
  title: string;
  severity: string;
  noiseScore: number;
  noiseLevel: string;
  factors: string[];
}

function computeNoiseScore(finding: {
  severity: string;
  confidence?: number;
  patch?: unknown;
  recommendation: string;
}): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  if (finding.confidence !== undefined && finding.confidence !== null && finding.confidence < 0.5) {
    score += 30;
    factors.push("low confidence");
  }

  if (finding.severity === "info") {
    score += 20;
    factors.push("info-level severity");
  } else if (finding.severity === "low") {
    score += 10;
    factors.push("low severity");
  }

  if (finding.patch === undefined || finding.patch === null) {
    score += 15;
    factors.push("no patch available");
  }

  if (finding.recommendation.length < 30) {
    score += 15;
    factors.push("vague recommendation");
  }

  if (factors.length === 0) {
    factors.push("actionable finding");
  }

  return { score: Math.min(100, score), factors };
}

export function runFindingNoiseScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-noise-score [options]

Score finding noise levels to identify low-signal findings.

Options:
  --report <path>      Path to verdict JSON
  --threshold <n>      Noise score threshold to flag (default: 40)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const threshIdx = argv.indexOf("--threshold");
  const threshold = threshIdx !== -1 && argv[threshIdx + 1] ? parseInt(argv[threshIdx + 1], 10) : 40;

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
  const findings = data.findings ?? [];

  const entries: NoiseEntry[] = [];
  for (const f of findings) {
    const result = computeNoiseScore(f);

    let noiseLevel: string;
    if (result.score >= 60) noiseLevel = "high noise";
    else if (result.score >= 30) noiseLevel = "moderate noise";
    else noiseLevel = "low noise";

    entries.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      noiseScore: result.score,
      noiseLevel,
      factors: result.factors,
    });
  }

  entries.sort((a, b) => b.noiseScore - a.noiseScore);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  const noisy = entries.filter((e) => e.noiseScore >= threshold);
  console.log(`\n=== Noise Score (${noisy.length}/${entries.length} above threshold ${threshold}) ===\n`);

  if (entries.length === 0) {
    console.log("No findings to score.");
    return;
  }

  for (const e of entries) {
    const flag = e.noiseScore >= threshold ? " ⚠" : "";
    console.log(`  ${String(e.noiseScore).padStart(3)}  ${e.noiseLevel.padEnd(16)} ${e.ruleId}${flag}`);
    console.log(`       ${e.factors.join(", ")}`);
  }
}
