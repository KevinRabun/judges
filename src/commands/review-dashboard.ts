/**
 * Review-dashboard — Terminal-based dashboard summary of review health.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDashboard(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-dashboard — Terminal dashboard of review health

Usage:
  judges review-dashboard                        Show dashboard
  judges review-dashboard --dir ./results        From verdict directory
  judges review-dashboard --file verdict.json    From single file
  judges review-dashboard --format json          JSON output

Options:
  --file <path>         Single verdict file
  --dir <directory>     Directory with verdict JSON files
  --format json         JSON output
  --help, -h            Show this help

Displays a summary dashboard with key metrics: score,
findings by severity, trends, and actionable insights.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir");

  const verdicts: TribunalVerdict[] = [];

  if (file && existsSync(file)) {
    try {
      verdicts.push(JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict);
    } catch {
      /* skip */
    }
  }

  if (dir && existsSync(dir)) {
    try {
      const entries = readdirSync(dir) as unknown as string[];
      for (const entry of entries) {
        if (typeof entry === "string" && entry.endsWith(".json")) {
          try {
            verdicts.push(JSON.parse(readFileSync(join(dir, entry), "utf-8")) as TribunalVerdict);
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  if (verdicts.length === 0) {
    console.log("\n  No verdict data found. Use --file or --dir to provide verdict JSON files.\n");
    return;
  }

  // Compute metrics
  const scores = verdicts.map((v) => v.overallScore || 0);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const totalFindings = verdicts.reduce((sum, v) => sum + (v.findings || []).length, 0);

  const severityCounts: Record<string, number> = {};
  for (const v of verdicts) {
    for (const f of v.findings || []) {
      const sev = f.severity || "unknown";
      severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    }
  }

  const criticalCount = severityCounts["critical"] || 0;
  const highCount = severityCounts["high"] || 0;
  const mediumCount = severityCounts["medium"] || 0;
  const lowCount = severityCounts["low"] || 0;

  const passCount = verdicts.filter((v) => v.overallVerdict === "pass").length;
  const failCount = verdicts.filter((v) => v.overallVerdict === "fail").length;

  const grade = avgScore >= 90 ? "A" : avgScore >= 80 ? "B" : avgScore >= 70 ? "C" : avgScore >= 60 ? "D" : "F";

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          reviewCount: verdicts.length,
          avgScore,
          grade,
          totalFindings,
          severityCounts,
          passCount,
          failCount,
        },
        null,
        2,
      ),
    );
    return;
  }

  const barLen = Math.round((avgScore / 100) * 20);
  const scoreBar = "█".repeat(barLen) + "░".repeat(20 - barLen);

  console.log(`
  ╔═══════════════════════════════════════════╗
  ║          JUDGES REVIEW DASHBOARD          ║
  ╚═══════════════════════════════════════════╝

  Score: ${scoreBar} ${avgScore}/100 (Grade ${grade})

  ┌─────────────────────────────────────────┐
  │  Reviews: ${String(verdicts.length).padEnd(6)} Pass: ${String(passCount).padEnd(6)} Fail: ${String(failCount).padEnd(4)}│
  │  Findings: ${String(totalFindings).padEnd(30)}│
  └─────────────────────────────────────────┘

  Severity Distribution:
    🔴 Critical: ${"█".repeat(Math.min(criticalCount, 30))} ${criticalCount}
    🟠 High:     ${"█".repeat(Math.min(highCount, 30))} ${highCount}
    🟡 Medium:   ${"█".repeat(Math.min(mediumCount, 30))} ${mediumCount}
    🟢 Low:      ${"█".repeat(Math.min(lowCount, 30))} ${lowCount}
`);

  // Top rules
  const ruleCounts = new Map<string, number>();
  for (const v of verdicts) {
    for (const f of v.findings || []) {
      const rule = f.ruleId || "unknown";
      ruleCounts.set(rule, (ruleCounts.get(rule) || 0) + 1);
    }
  }

  const topRules = [...ruleCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);

  if (topRules.length > 0) {
    console.log("  Top Rules:");
    for (const [rule, count] of topRules) {
      console.log(`    ${rule.padEnd(30)} ${count} occurrence(s)`);
    }
    console.log();
  }

  // Insights
  console.log("  Insights:");
  if (criticalCount > 0) console.log(`    ⚠️  ${criticalCount} critical finding(s) require immediate attention`);
  if (failCount > passCount) console.log("    ⚠️  More reviews failing than passing — consider reviewing thresholds");
  if (avgScore >= 80) console.log("    ✅ Code quality is above target");
  if (totalFindings === 0) console.log("    ✅ Clean — no findings detected");
  console.log();
}
