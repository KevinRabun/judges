import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-cross-file-link ────────────────────────────────────────
   Link related findings across different files to identify
   cross-cutting concerns like inconsistent error handling,
   duplicated security patterns, or shared anti-patterns.
   ─────────────────────────────────────────────────────────────────── */

interface CrossFileLink {
  ruleId: string;
  severity: string;
  instances: number;
  relatedRules: string[];
  pattern: string;
  recommendation: string;
}

function linkCrossFile(findings: Finding[]): CrossFileLink[] {
  const links: CrossFileLink[] = [];
  const ruleGroups = new Map<string, Finding[]>();

  for (const f of findings) {
    const prefix = f.ruleId.split("-").slice(0, 2).join("-");
    const group = ruleGroups.get(prefix);
    if (group !== undefined) {
      group.push(f);
    } else {
      ruleGroups.set(prefix, [f]);
    }
  }

  for (const [prefix, group] of ruleGroups) {
    if (group.length < 2) continue;

    const uniqueRules = [...new Set(group.map((f) => f.ruleId))];
    const severities = group.map((f) => f.severity);
    const highestSeverity = severities.includes("critical")
      ? "critical"
      : severities.includes("high")
        ? "high"
        : severities.includes("medium")
          ? "medium"
          : "low";

    let pattern: string;
    if (uniqueRules.length === 1) {
      pattern = "Same rule appearing in multiple locations";
    } else {
      pattern = "Related rules from same family";
    }

    let recommendation: string;
    if (group.length >= 5) {
      recommendation = "Systemic issue — consider a shared utility or design pattern";
    } else if (uniqueRules.length > 1) {
      recommendation = "Cross-cutting concern — review holistically";
    } else {
      recommendation = "Repeated pattern — consider abstracting";
    }

    links.push({
      ruleId: prefix,
      severity: highestSeverity,
      instances: group.length,
      relatedRules: uniqueRules,
      pattern,
      recommendation,
    });
  }

  links.sort((a, b) => b.instances - a.instances);
  return links;
}

export function runFindingCrossFileLink(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-cross-file-link [options]

Link related findings across files.

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
    console.log("No findings to link.");
    return;
  }

  const links = linkCrossFile(findings);

  if (format === "json") {
    console.log(JSON.stringify(links, null, 2));
    return;
  }

  console.log("\n=== Cross-File Finding Links ===\n");
  console.log(`Findings analyzed: ${findings.length}`);
  console.log(`Cross-file groups: ${links.length}\n`);

  for (const link of links) {
    console.log(`[${link.severity.toUpperCase()}] ${link.ruleId} — ${link.instances} instances`);
    console.log(`  Pattern: ${link.pattern}`);
    console.log(`  Rules: ${link.relatedRules.join(", ")}`);
    console.log(`  → ${link.recommendation}`);
    console.log();
  }
}
