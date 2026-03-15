import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-focus-area ──────────────────────────────────────────────
   Identify focus areas for reviewers by analyzing finding
   distribution, severity patterns, and judge coverage to
   direct attention to the most impactful review areas.
   ─────────────────────────────────────────────────────────────────── */

interface FocusArea {
  area: string;
  priority: string;
  findingCount: number;
  topSeverity: string;
  description: string;
}

function identifyFocusAreas(findings: Finding[]): FocusArea[] {
  const areas: FocusArea[] = [];
  const rulesByDomain = new Map<string, Finding[]>();

  for (const f of findings) {
    const domain = f.ruleId.split("-")[0];
    const group = rulesByDomain.get(domain);
    if (group !== undefined) {
      group.push(f);
    } else {
      rulesByDomain.set(domain, [f]);
    }
  }

  for (const [domain, domainFindings] of rulesByDomain) {
    const severities = domainFindings.map((f) => f.severity);
    const hasCritical = severities.includes("critical");
    const hasHigh = severities.includes("high");

    let priority: string;
    let description: string;

    if (hasCritical) {
      priority = "critical";
      description = `Critical findings in ${domain} — immediate attention required`;
    } else if (hasHigh) {
      priority = "high";
      description = `High-severity issues in ${domain} — review carefully`;
    } else if (domainFindings.length >= 5) {
      priority = "medium";
      description = `Multiple ${domain} findings — pattern may indicate deeper issue`;
    } else {
      priority = "low";
      description = `Minor ${domain} findings — review when time permits`;
    }

    const topSeverity = hasCritical ? "critical" : hasHigh ? "high" : severities.includes("medium") ? "medium" : "low";

    areas.push({
      area: domain,
      priority,
      findingCount: domainFindings.length,
      topSeverity,
      description,
    });
  }

  areas.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
  });

  return areas;
}

export function runReviewFocusArea(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-focus-area [options]

Identify focus areas for reviewers.

Options:
  --report <path>    Path to verdict JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
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
    console.log("Run a review first or provide --report.");
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings — no focus areas needed.");
    return;
  }

  const areas = identifyFocusAreas(findings);

  if (format === "json") {
    console.log(JSON.stringify(areas, null, 2));
    return;
  }

  console.log("\n=== Review Focus Areas ===\n");
  console.log(`Total findings: ${findings.length}`);
  console.log(`Focus areas: ${areas.length}\n`);

  for (const area of areas) {
    console.log(`[${area.priority.toUpperCase()}] ${area.area} — ${area.findingCount} finding(s)`);
    console.log(`  Top severity: ${area.topSeverity}`);
    console.log(`  ${area.description}`);
    console.log();
  }
}
