/**
 * Finding-auto-triage — Automatically triage findings by severity, confidence, and context.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TriageRule {
  field: "severity" | "ruleId" | "confidence";
  operator: "eq" | "gte" | "lte" | "contains";
  value: string | number;
  action: "accept" | "defer" | "ignore";
  priority: number;
}

interface TriageResult {
  ruleId: string;
  title: string;
  severity: string;
  action: string;
  matchedRule: string;
}

interface TriageConfig {
  rules: TriageRule[];
  defaultAction: "accept" | "defer" | "ignore";
  lastUpdated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function matchesRule(finding: Finding, rule: TriageRule): boolean {
  if (rule.field === "severity") {
    if (rule.operator === "eq") return finding.severity === rule.value;
  }
  if (rule.field === "ruleId") {
    if (rule.operator === "eq") return finding.ruleId === rule.value;
    if (rule.operator === "contains") return finding.ruleId.includes(String(rule.value));
  }
  if (rule.field === "confidence") {
    const conf = finding.confidence ?? 0;
    if (rule.operator === "gte") return conf >= Number(rule.value);
    if (rule.operator === "lte") return conf <= Number(rule.value);
  }
  return false;
}

function triageFindings(findings: Finding[], config: TriageConfig): TriageResult[] {
  const sorted = [...config.rules].sort((a, b) => b.priority - a.priority);
  return findings.map((f) => {
    const matched = sorted.find((r) => matchesRule(f, r));
    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      action: matched ? matched.action : config.defaultAction,
      matchedRule: matched ? `${matched.field} ${matched.operator} ${matched.value}` : "default",
    };
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAutoTriage(argv: string[]): void {
  const configIdx = argv.indexOf("--config");
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-triage.json";
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const initMode = argv.includes("--init");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-auto-triage — Automatically triage findings

Usage:
  judges finding-auto-triage --findings <path> [--config <path>] [--format table|json]
  judges finding-auto-triage --init [--config <path>]

Options:
  --findings <path>  Path to findings JSON file
  --config <path>    Triage rules config (default: .judges-triage.json)
  --init             Create default triage config
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (initMode) {
    const defaultConfig: TriageConfig = {
      rules: [
        { field: "severity", operator: "eq", value: "critical", action: "accept", priority: 100 },
        { field: "severity", operator: "eq", value: "high", action: "accept", priority: 90 },
        { field: "confidence", operator: "lte", value: 0.3, action: "ignore", priority: 80 },
      ],
      defaultAction: "defer",
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created default triage config: ${configPath}`);
    return;
  }

  if (!findingsPath || !existsSync(findingsPath)) {
    console.error("Provide --findings <path> to a valid findings JSON file.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(configPath)) {
    console.error(`Triage config not found: ${configPath}. Run with --init to create one.`);
    process.exitCode = 1;
    return;
  }

  const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as TriageConfig;
  const results = triageFindings(findings, config);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nAuto-Triage Results (${results.length} findings)`);
  console.log("═".repeat(80));
  console.log(`  ${"Rule ID".padEnd(25)} ${"Severity".padEnd(12)} ${"Action".padEnd(10)} Matched Rule`);
  console.log("  " + "─".repeat(75));

  for (const r of results) {
    console.log(`  ${r.ruleId.padEnd(25)} ${r.severity.padEnd(12)} ${r.action.padEnd(10)} ${r.matchedRule}`);
  }

  const accepted = results.filter((r) => r.action === "accept").length;
  const deferred = results.filter((r) => r.action === "defer").length;
  const ignored = results.filter((r) => r.action === "ignore").length;
  console.log(`\n  Accept: ${accepted} | Defer: ${deferred} | Ignore: ${ignored}`);
  console.log("═".repeat(80));
}
