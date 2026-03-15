import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict, Severity } from "../types.js";

/* ── finding-severity-rebalance ─────────────────────────────────────
   Rebalance finding severities based on project context: production
   vs development, file importance, and custom rules. Helps teams
   tune severity levels locally without sharing data.
   ─────────────────────────────────────────────────────────────────── */

interface RebalanceRule {
  match: string;
  adjustDirection: "up" | "down";
  reason: string;
}

interface RebalancedFinding {
  ruleId: string;
  title: string;
  originalSeverity: string;
  newSeverity: string;
  changed: boolean;
  reason: string;
}

const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];

const DEFAULT_RULES: RebalanceRule[] = [
  { match: "test", adjustDirection: "down", reason: "Test file — reduced severity" },
  { match: "vendor", adjustDirection: "down", reason: "Vendor code — reduced severity" },
  { match: "auth", adjustDirection: "up", reason: "Authentication — elevated severity" },
  { match: "crypto", adjustDirection: "up", reason: "Cryptography — elevated severity" },
  { match: "injection", adjustDirection: "up", reason: "Injection risk — elevated severity" },
];

function adjustSeverity(sev: string, direction: "up" | "down"): Severity {
  const idx = SEVERITY_ORDER.indexOf(sev as Severity);
  if (idx === -1) return sev as Severity;
  if (direction === "up") return SEVERITY_ORDER[Math.min(idx + 1, SEVERITY_ORDER.length - 1)];
  return SEVERITY_ORDER[Math.max(idx - 1, 0)];
}

function loadRules(rulesPath: string | undefined): RebalanceRule[] {
  if (rulesPath && existsSync(rulesPath)) {
    try {
      return JSON.parse(readFileSync(rulesPath, "utf-8")) as RebalanceRule[];
    } catch {
      console.log("Warning: could not parse rules file, using defaults");
    }
  }
  return DEFAULT_RULES;
}

function rebalance(verdict: TribunalVerdict, rules: RebalanceRule[]): RebalancedFinding[] {
  const results: RebalancedFinding[] = [];

  for (const f of verdict.findings ?? []) {
    const ruleIdLower = f.ruleId.toLowerCase();
    const titleLower = f.title.toLowerCase();
    let newSev = f.severity as Severity;
    let reason = "No rule matched";
    let changed = false;

    for (const rule of rules) {
      if (ruleIdLower.includes(rule.match) || titleLower.includes(rule.match)) {
        newSev = adjustSeverity(newSev, rule.adjustDirection);
        reason = rule.reason;
        changed = newSev !== f.severity;
        break;
      }
    }

    results.push({
      ruleId: f.ruleId,
      title: f.title,
      originalSeverity: f.severity,
      newSeverity: newSev,
      changed,
      reason,
    });
  }

  results.sort((a, b) => {
    if (a.changed && !b.changed) return -1;
    if (!a.changed && b.changed) return 1;
    return 0;
  });
  return results;
}

export function runFindingSeverityRebalance(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-severity-rebalance [options]

Rebalance finding severities based on project context.

Options:
  --report <path>      Path to verdict JSON
  --rules <path>       Path to custom rebalance rules JSON
  --format <fmt>       Output format: table (default) or json
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

  const rulesIdx = argv.indexOf("--rules");
  const rulesPath = rulesIdx !== -1 && argv[rulesIdx + 1] ? join(process.cwd(), argv[rulesIdx + 1]) : undefined;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const rules = loadRules(rulesPath);
  const results = rebalance(data, rules);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const changed = results.filter((r) => r.changed);
  console.log(`\n=== Severity Rebalance (${changed.length} adjusted of ${results.length} findings) ===\n`);

  if (changed.length === 0) {
    console.log("No severity adjustments needed.");
    return;
  }

  for (const entry of changed) {
    console.log(
      `  ${entry.originalSeverity.toUpperCase().padEnd(9)} → ${entry.newSeverity.toUpperCase().padEnd(9)} ${entry.ruleId}`,
    );
    console.log(`           ${entry.title}`);
    console.log(`           Reason: ${entry.reason}`);
    console.log();
  }
}
