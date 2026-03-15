/**
 * Review-parallel-run — Configure and summarize parallel review runs.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParallelSummary {
  totalRuns: number;
  scores: number[];
  avgScore: number;
  scoreVariance: number;
  consensusVerdict: string;
  verdictAgreement: number;
  mergedFindings: Array<{ ruleId: string; title: string; agreedCount: number; totalRuns: number }>;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function summarizeParallel(verdicts: TribunalVerdict[]): ParallelSummary {
  const totalRuns = verdicts.length;
  const scores = verdicts.map((v) => v.overallScore);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / totalRuns);

  // variance
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / totalRuns;
  const scoreVariance = Math.round(Math.sqrt(variance) * 10) / 10;

  // verdict agreement
  const verdictCounts = new Map<string, number>();
  for (const v of verdicts) {
    verdictCounts.set(v.overallVerdict, (verdictCounts.get(v.overallVerdict) || 0) + 1);
  }
  const maxVerdictEntry = [...verdictCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const consensusVerdict = maxVerdictEntry[0];
  const verdictAgreement = Math.round((maxVerdictEntry[1] / totalRuns) * 100);

  // finding consensus
  const findingCounts = new Map<string, { title: string; count: number }>();
  for (const v of verdicts) {
    const seen = new Set<string>();
    for (const f of v.findings) {
      if (!seen.has(f.ruleId)) {
        seen.add(f.ruleId);
        const existing = findingCounts.get(f.ruleId);
        if (existing) {
          existing.count++;
        } else {
          findingCounts.set(f.ruleId, { title: f.title, count: 1 });
        }
      }
    }
  }

  const mergedFindings = [...findingCounts.entries()]
    .map(([ruleId, data]) => ({
      ruleId,
      title: data.title,
      agreedCount: data.count,
      totalRuns,
    }))
    .sort((a, b) => b.agreedCount - a.agreedCount);

  return { totalRuns, scores, avgScore, scoreVariance, consensusVerdict, verdictAgreement, mergedFindings };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewParallelRun(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const minAgreeIdx = argv.indexOf("--min-agree");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const minAgree = minAgreeIdx >= 0 ? parseInt(argv[minAgreeIdx + 1], 10) : 1;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-parallel-run — Summarize parallel review runs

Usage:
  judges review-parallel-run --dir <verdicts-dir> [--min-agree <n>]
                             [--format table|json]

Options:
  --dir <path>         Directory of verdict JSON files (required)
  --min-agree <n>      Minimum agreement count to include finding (default: 1)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (!dirPath) {
    console.error("Error: --dir required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(dirPath)) {
    console.error(`Error: not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  const files = (readdirSync(dirPath) as unknown as string[]).filter((f) => f.endsWith(".json"));
  const verdicts: TribunalVerdict[] = [];

  for (const file of files) {
    try {
      verdicts.push(JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")));
    } catch {
      // skip
    }
  }

  if (verdicts.length === 0) {
    console.error("Error: no valid verdict files found");
    process.exitCode = 1;
    return;
  }

  const summary = summarizeParallel(verdicts);
  const filtered = summary.mergedFindings.filter((f) => f.agreedCount >= minAgree);

  if (format === "json") {
    console.log(JSON.stringify({ ...summary, mergedFindings: filtered }, null, 2));
    return;
  }

  console.log(`\nParallel Run Summary (${summary.totalRuns} runs)`);
  console.log("═".repeat(70));
  console.log(`  Avg Score: ${summary.avgScore}  |  Variance: ${summary.scoreVariance}`);
  console.log(`  Consensus: ${summary.consensusVerdict} (${summary.verdictAgreement}% agreement)`);
  console.log("─".repeat(70));
  console.log(`${"Rule".padEnd(22)} ${"Agreement".padEnd(14)} Title`);
  console.log("─".repeat(70));

  for (const f of filtered.slice(0, 20)) {
    const rule = f.ruleId.length > 20 ? f.ruleId.slice(0, 20) + "…" : f.ruleId;
    const title = f.title.length > 30 ? f.title.slice(0, 30) + "…" : f.title;
    console.log(`${rule.padEnd(22)} ${f.agreedCount}/${f.totalRuns}${" ".repeat(10)} ${title}`);
  }
  console.log("═".repeat(70));
}
