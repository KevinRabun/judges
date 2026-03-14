/**
 * Finding grouping — group related findings by category, file, or rule
 * for better review UX and digest-style reporting.
 */

import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type GroupByKey = "category" | "severity" | "file" | "rule" | "judge";

export interface FindingGroup {
  key: string;
  label: string;
  findings: Finding[];
  count: number;
  criticalCount: number;
  highCount: number;
}

export interface GroupedReport {
  groupBy: GroupByKey;
  groups: FindingGroup[];
  totalFindings: number;
  totalGroups: number;
}

// ─── Category Classification ────────────────────────────────────────────────

const RULE_CATEGORIES: Record<string, string> = {
  // Security
  "SEC-": "Security",
  "AUTH-": "Authentication",
  "CRYPTO-": "Cryptography",
  "INJECT-": "Injection",
  "XSS-": "Cross-Site Scripting",
  "SSRF-": "Server-Side Request Forgery",
  "IDOR-": "Broken Access Control",

  // Quality
  "PERF-": "Performance",
  "ERR-": "Error Handling",
  "LOG-": "Logging",
  "TEST-": "Testing",
  "DOC-": "Documentation",
  "MAINT-": "Maintainability",
  "STRUCT-": "Code Structure",

  // Reliability
  "CONCUR-": "Concurrency",
  "RACE-": "Race Conditions",
  "SCALE-": "Scalability",
  "CACHE-": "Caching",
  "RATE-": "Rate Limiting",

  // Compliance
  "COMPLY-": "Compliance",
  "DATA-": "Data Protection",
  "PII-": "Privacy",

  // AI
  "AI-": "AI Safety",
  "HALLUC-": "Hallucination",
  "FW-": "Framework Safety",

  // Infrastructure
  "IAC-": "Infrastructure as Code",
  "CICD-": "CI/CD",
  "CLOUD-": "Cloud Readiness",
  "DB-": "Database",

  // Accessibility / UX
  "A11Y-": "Accessibility",
  "I18N-": "Internationalization",
  "UX-": "User Experience",
};

function classifyRule(ruleId: string): string {
  for (const [prefix, category] of Object.entries(RULE_CATEGORIES)) {
    if (ruleId.toUpperCase().startsWith(prefix)) return category;
  }
  return "Other";
}

// ─── Grouping Logic ─────────────────────────────────────────────────────────

function getGroupKey(finding: Finding, groupBy: GroupByKey): string {
  switch (groupBy) {
    case "category":
      return classifyRule(finding.ruleId);
    case "severity":
      return finding.severity;
    case "file":
      return "(grouped)";
    case "rule":
      return finding.ruleId;
    case "judge":
      return (finding as Finding & { judgeId?: string }).judgeId || "(unknown)";
  }
}

export function groupFindings(findings: Finding[], groupBy: GroupByKey): GroupedReport {
  const groups = new Map<string, Finding[]>();

  for (const f of findings) {
    const key = getGroupKey(f, groupBy);
    const arr = groups.get(key) || [];
    arr.push(f);
    groups.set(key, arr);
  }

  const sortedGroups: FindingGroup[] = [...groups.entries()]
    .map(([key, items]) => ({
      key,
      label: key,
      findings: items,
      count: items.length,
      criticalCount: items.filter((f) => f.severity === "critical").length,
      highCount: items.filter((f) => f.severity === "high").length,
    }))
    .sort((a, b) => b.criticalCount - a.criticalCount || b.highCount - a.highCount || b.count - a.count);

  return {
    groupBy,
    groups: sortedGroups,
    totalFindings: findings.length,
    totalGroups: sortedGroups.length,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runGroupFindings(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges group — Group findings by category, severity, file, rule, or judge

Usage:
  judges group --input results.json                 Group by category (default)
  judges group --input results.json --by severity   Group by severity
  judges group --input results.json --by file       Group by file

Options:
  --input <path>      Path to JSON results file (required)
  --by <key>          Group by: category, severity, file, rule, judge (default: category)
  --format json       JSON output
  --help, -h          Show this help
`);
    return;
  }

  const { readFileSync, existsSync } = require("fs");

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  if (!inputPath || !existsSync(inputPath)) {
    console.error("Error: --input <path> required (JSON results file)");
    process.exit(1);
  }

  const byArg = argv.find((_a: string, i: number) => argv[i - 1] === "--by") || "category";
  const validKeys = new Set<GroupByKey>(["category", "severity", "file", "rule", "judge"]);
  if (!validKeys.has(byArg as GroupByKey)) {
    console.error(`Error: --by must be one of: ${[...validKeys].join(", ")}`);
    process.exit(1);
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const data = JSON.parse(readFileSync(inputPath, "utf-8"));
  const findings: Finding[] = data.evaluations
    ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
    : data.findings || data;

  const report = groupFindings(findings, byArg as GroupByKey);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  Findings Grouped by ${report.groupBy}\n`);
  console.log(`  Total: ${report.totalFindings} findings in ${report.totalGroups} groups\n`);

  for (const g of report.groups) {
    const badges = [];
    if (g.criticalCount > 0) badges.push(`🔴 ${g.criticalCount} critical`);
    if (g.highCount > 0) badges.push(`🟠 ${g.highCount} high`);
    const badge = badges.length > 0 ? ` (${badges.join(", ")})` : "";

    console.log(`  📁 ${g.label} — ${g.count} findings${badge}`);
    for (const f of g.findings.slice(0, 5)) {
      const loc = f.lineNumbers?.length ? `:${f.lineNumbers[0]}` : "";
      console.log(`     ${f.severity.padEnd(8)} ${f.ruleId}: ${f.title.slice(0, 80)}${loc}`);
    }
    if (g.findings.length > 5) {
      console.log(`     ... and ${g.findings.length - 5} more`);
    }
    console.log("");
  }
}
