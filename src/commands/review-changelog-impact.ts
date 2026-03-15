import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-changelog-impact ────────────────────────────────────────
   Assess whether review findings have changelog-worthy impact —
   identifying breaking changes, security fixes, and significant
   behavioral modifications that should be documented.
   ─────────────────────────────────────────────────────────────────── */

interface ChangelogEntry {
  category: string;
  description: string;
  severity: string;
  ruleIds: string[];
}

function assessChangelogImpact(findings: Finding[]): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const securityFindings = findings.filter(
    (f) =>
      f.ruleId.startsWith("SEC") ||
      f.ruleId.startsWith("INJ") ||
      f.ruleId.startsWith("XSS") ||
      f.ruleId.startsWith("AUTH") ||
      f.severity === "critical",
  );
  if (securityFindings.length > 0) {
    entries.push({
      category: "Security",
      description: `Fixed ${securityFindings.length} security finding(s)`,
      severity: "high",
      ruleIds: securityFindings.map((f) => f.ruleId),
    });
  }

  const breakingFindings = findings.filter(
    (f) =>
      f.title.toLowerCase().includes("breaking") ||
      f.title.toLowerCase().includes("deprecated") ||
      f.title.toLowerCase().includes("removed"),
  );
  if (breakingFindings.length > 0) {
    entries.push({
      category: "Breaking Changes",
      description: `${breakingFindings.length} potentially breaking change(s) detected`,
      severity: "critical",
      ruleIds: breakingFindings.map((f) => f.ruleId),
    });
  }

  const perfFindings = findings.filter(
    (f) => f.ruleId.startsWith("PERF") || f.title.toLowerCase().includes("performance"),
  );
  if (perfFindings.length > 0) {
    entries.push({
      category: "Performance",
      description: `${perfFindings.length} performance-related finding(s)`,
      severity: "medium",
      ruleIds: perfFindings.map((f) => f.ruleId),
    });
  }

  const highSevFindings = findings.filter(
    (f) => f.severity === "high" && !securityFindings.includes(f) && !breakingFindings.includes(f),
  );
  if (highSevFindings.length > 0) {
    entries.push({
      category: "Bug Fixes",
      description: `Addressed ${highSevFindings.length} high-severity issue(s)`,
      severity: "high",
      ruleIds: highSevFindings.map((f) => f.ruleId),
    });
  }

  return entries;
}

export function runReviewChangelogImpact(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-changelog-impact [options]

Assess changelog-worthy impact from review findings.

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
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  const entries = assessChangelogImpact(findings);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log("\n=== Changelog Impact Assessment ===\n");
  if (entries.length === 0) {
    console.log("No changelog-worthy changes detected.");
    return;
  }

  for (const entry of entries) {
    console.log(`[${entry.category}] ${entry.description}`);
    console.log(`  Severity: ${entry.severity}`);
    console.log(`  Rules: ${entry.ruleIds.join(", ")}`);
    console.log();
  }
}
