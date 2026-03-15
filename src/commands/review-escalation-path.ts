import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-escalation-path ─────────────────────────────────────────
   Define and display escalation paths for findings based on
   severity and domain. Helps teams know who to contact for
   critical issues.
   ─────────────────────────────────────────────────────────────────── */

interface EscalationRule {
  severity: string;
  domain?: string;
  escalateTo: string;
  timeframe: string;
}

interface EscalationItem {
  ruleId: string;
  title: string;
  severity: string;
  escalateTo: string;
  timeframe: string;
}

function resolveEscalations(findings: Finding[], rules: EscalationRule[]): EscalationItem[] {
  const items: EscalationItem[] = [];

  for (const f of findings) {
    const domain = f.ruleId.split("-")[0].toUpperCase();

    // Find best matching rule (domain-specific > severity-only)
    let bestRule: EscalationRule | undefined;
    for (const rule of rules) {
      if (rule.domain && rule.domain.toUpperCase() === domain && rule.severity === f.severity) {
        bestRule = rule;
        break;
      }
      if (!rule.domain && rule.severity === f.severity && !bestRule) {
        bestRule = rule;
      }
    }

    if (bestRule) {
      items.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        escalateTo: bestRule.escalateTo,
        timeframe: bestRule.timeframe,
      });
    }
  }

  return items;
}

export function runReviewEscalationPath(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-escalation-path [options]

Display escalation paths for findings.

Options:
  --report <path>      Path to verdict JSON file
  --rules <path>       Path to escalation rules JSON
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
  const rulesPath =
    rulesIdx !== -1 && argv[rulesIdx + 1]
      ? join(process.cwd(), argv[rulesIdx + 1])
      : join(process.cwd(), ".judges", "escalation-rules.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  let rules: EscalationRule[];
  if (existsSync(rulesPath)) {
    const rulesData = JSON.parse(readFileSync(rulesPath, "utf-8"));
    rules = rulesData.rules ?? [];
  } else {
    rules = [
      { severity: "critical", escalateTo: "security-lead", timeframe: "Immediate" },
      { severity: "high", escalateTo: "team-lead", timeframe: "24 hours" },
      { severity: "medium", escalateTo: "developer", timeframe: "Sprint" },
    ];
  }

  const items = resolveEscalations(findings, rules);

  if (format === "json") {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (items.length === 0) {
    console.log("\nNo escalation-worthy findings.");
    return;
  }

  console.log(`\n=== Escalation Paths (${items.length}) ===\n`);
  for (const item of items) {
    console.log(`[${item.severity.toUpperCase()}] ${item.ruleId}: ${item.title}`);
    console.log(`  Escalate to: ${item.escalateTo} | Timeframe: ${item.timeframe}`);
    console.log();
  }
}
