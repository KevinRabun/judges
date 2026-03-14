/**
 * Review-changelog-entry — Generate changelog entries from review findings.
 *
 * Creates structured changelog content from verdict findings,
 * suitable for inclusion in project CHANGELOG files.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateChangelog(verdict: TribunalVerdict, version: string): string {
  const lines: string[] = [];
  const date = new Date().toISOString().split("T")[0];

  lines.push(`## [${version}] — ${date}`);
  lines.push("");

  // Group findings by category
  const securityFindings = verdict.findings.filter((f) =>
    ["critical", "high"].includes((f.severity || "medium").toLowerCase()),
  );
  const qualityFindings = verdict.findings.filter((f) =>
    ["medium", "low"].includes((f.severity || "medium").toLowerCase()),
  );

  if (securityFindings.length > 0) {
    lines.push("### Security Fixes");
    lines.push("");
    for (const f of securityFindings) {
      lines.push(`- Fixed: ${f.title} (${f.ruleId})`);
      if (f.recommendation) {
        const rec = f.recommendation.length > 80 ? f.recommendation.slice(0, 80) + "…" : f.recommendation;
        lines.push(`  - ${rec}`);
      }
    }
    lines.push("");
  }

  if (qualityFindings.length > 0) {
    lines.push("### Quality Improvements");
    lines.push("");
    for (const f of qualityFindings) {
      lines.push(`- Improved: ${f.title} (${f.ruleId})`);
    }
    lines.push("");
  }

  // Summary stats
  lines.push("### Review Summary");
  lines.push("");
  lines.push(`- Score: ${verdict.overallScore}`);
  lines.push(`- Verdict: ${verdict.overallVerdict}`);
  lines.push(`- Findings addressed: ${verdict.findings.length}`);
  if (verdict.criticalCount > 0) lines.push(`- Critical issues fixed: ${verdict.criticalCount}`);
  if (verdict.highCount > 0) lines.push(`- High issues fixed: ${verdict.highCount}`);

  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewChangelogEntry(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const versionIdx = argv.indexOf("--version");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const version = versionIdx >= 0 ? argv[versionIdx + 1] : "unreleased";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "markdown";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-changelog-entry — Generate changelog from findings

Usage:
  judges review-changelog-entry --file <verdict.json> [--version <ver>]
                                 [--format markdown|json]

Options:
  --file <path>       Path to verdict JSON file (required)
  --version <ver>     Version string (default: "unreleased")
  --format <fmt>      Output format: markdown (default), json
  --help, -h          Show this help
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

  if (format === "json") {
    const entry = {
      version,
      date: new Date().toISOString().split("T")[0],
      securityFixes: verdict.findings
        .filter((f) => ["critical", "high"].includes((f.severity || "medium").toLowerCase()))
        .map((f) => ({ title: f.title, ruleId: f.ruleId, severity: f.severity })),
      qualityImprovements: verdict.findings
        .filter((f) => ["medium", "low"].includes((f.severity || "medium").toLowerCase()))
        .map((f) => ({ title: f.title, ruleId: f.ruleId })),
      score: verdict.overallScore,
      verdict: verdict.overallVerdict,
    };
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  console.log(generateChangelog(verdict, version));
}
