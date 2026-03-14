/**
 * Review-pr-template — Generate pull request templates from review findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateTemplate(verdict: TribunalVerdict, title: string): string {
  const lines: string[] = [];

  lines.push(`## ${title || "Pull Request Review Summary"}`);
  lines.push("");
  lines.push("### Overview");
  lines.push(`- **Verdict:** ${verdict.overallVerdict}`);
  lines.push(`- **Score:** ${verdict.overallScore}`);
  lines.push(`- **Total Findings:** ${verdict.findings.length}`);
  lines.push(`- **Critical:** ${verdict.criticalCount} | **High:** ${verdict.highCount}`);
  lines.push(`- **Date:** ${verdict.timestamp || new Date().toISOString()}`);
  lines.push("");

  if (verdict.findings.length > 0) {
    lines.push("### Findings");
    lines.push("");

    const critical = verdict.findings.filter((f) => (f.severity || "").toLowerCase() === "critical");
    const high = verdict.findings.filter((f) => (f.severity || "").toLowerCase() === "high");
    const medium = verdict.findings.filter((f) => (f.severity || "").toLowerCase() === "medium");
    const low = verdict.findings.filter(
      (f) => !["critical", "high", "medium"].includes((f.severity || "").toLowerCase()),
    );

    const sections = [
      { label: "Critical", items: critical },
      { label: "High", items: high },
      { label: "Medium", items: medium },
      { label: "Low / Info", items: low },
    ];

    for (const sec of sections) {
      if (sec.items.length === 0) continue;
      lines.push(`#### ${sec.label} (${sec.items.length})`);
      for (const f of sec.items) {
        lines.push(`- **${f.ruleId}**: ${f.title}`);
        if (f.recommendation) lines.push(`  - Fix: ${f.recommendation}`);
      }
      lines.push("");
    }
  }

  lines.push("### Checklist");
  lines.push("- [ ] All critical findings addressed");
  lines.push("- [ ] All high findings addressed or accepted");
  lines.push("- [ ] Tests updated if needed");
  lines.push("- [ ] Documentation updated if needed");
  lines.push("");

  if (verdict.summary) {
    lines.push("### Summary");
    lines.push(verdict.summary);
    lines.push("");
  }

  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPrTemplate(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const titleIdx = argv.indexOf("--title");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const title = titleIdx >= 0 ? argv[titleIdx + 1] : "Pull Request Review Summary";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "markdown";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-pr-template — Generate PR template from findings

Usage:
  judges review-pr-template --file <verdict.json> [--title <text>]
                            [--format markdown|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --title <text>     PR title (default: "Pull Request Review Summary")
  --format <fmt>     Output format: markdown (default), json
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

  const template = generateTemplate(verdict, title);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { title, template, findingCount: verdict.findings.length, verdict: verdict.overallVerdict },
        null,
        2,
      ),
    );
    return;
  }

  console.log(template);
}
