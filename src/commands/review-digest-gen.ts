import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-digest-gen ──────────────────────────────────────────────
   Generate a concise review digest suitable for emails, Slack
   messages, or team standups. Summarizes key metrics and
   action items.
   ─────────────────────────────────────────────────────────────────── */

interface Digest {
  headline: string;
  score: number;
  verdict: string;
  criticalCount: number;
  highCount: number;
  totalFindings: number;
  topIssues: string[];
  recommendation: string;
}

function generateDigest(data: TribunalVerdict): Digest {
  const findings = data.findings ?? [];

  const topIssues: string[] = [];
  const critical = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");

  for (const f of critical.slice(0, 3)) {
    topIssues.push(`[CRITICAL] ${f.ruleId}: ${f.title}`);
  }
  for (const f of high.slice(0, 2)) {
    topIssues.push(`[HIGH] ${f.ruleId}: ${f.title}`);
  }

  let headline: string;
  if (data.overallVerdict === "pass") {
    headline = "Review passed — code is ready";
  } else if (data.criticalCount > 0) {
    headline = `Review failed — ${data.criticalCount} critical issues found`;
  } else {
    headline = `Review ${data.overallVerdict} — ${findings.length} findings to address`;
  }

  let recommendation: string;
  if (data.overallVerdict === "pass" && findings.length === 0) {
    recommendation = "No action needed.";
  } else if (data.criticalCount > 0) {
    recommendation = "Address critical findings before proceeding.";
  } else if (data.highCount > 0) {
    recommendation = "Review high-priority findings before merge.";
  } else {
    recommendation = "Review findings at your convenience.";
  }

  return {
    headline,
    score: data.overallScore,
    verdict: data.overallVerdict,
    criticalCount: data.criticalCount,
    highCount: data.highCount,
    totalFindings: findings.length,
    topIssues,
    recommendation,
  };
}

export function runReviewDigestGen(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-digest-gen [options]

Generate a concise review digest.

Options:
  --report <path>      Path to verdict JSON file
  --format <fmt>       Output format: table (default), json, or markdown
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
  const digest = generateDigest(data);

  if (format === "json") {
    console.log(JSON.stringify(digest, null, 2));
    return;
  }

  if (format === "markdown") {
    console.log(`## ${digest.headline}\n`);
    console.log(`**Score:** ${digest.score} | **Verdict:** ${digest.verdict}`);
    console.log(`**Findings:** ${digest.totalFindings} (${digest.criticalCount} critical, ${digest.highCount} high)\n`);
    if (digest.topIssues.length > 0) {
      console.log("### Top Issues");
      for (const issue of digest.topIssues) {
        console.log(`- ${issue}`);
      }
    }
    console.log(`\n> ${digest.recommendation}`);
    return;
  }

  console.log(`\n${digest.headline}`);
  console.log(`Score: ${digest.score} | Verdict: ${digest.verdict}`);
  console.log(`Findings: ${digest.totalFindings} (${digest.criticalCount} critical, ${digest.highCount} high)\n`);

  if (digest.topIssues.length > 0) {
    console.log("Top issues:");
    for (const issue of digest.topIssues) {
      console.log(`  ${issue}`);
    }
    console.log();
  }

  console.log(`Recommendation: ${digest.recommendation}\n`);
}
