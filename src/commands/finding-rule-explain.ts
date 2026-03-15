/**
 * Finding-rule-explain — Explain rules in detail with examples and remediation.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RuleExplanation {
  ruleId: string;
  title: string;
  severity: string;
  judge: string;
  domain: string;
  description: string;
  recommendation: string;
  occurrences: number;
  affectedLines: number[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function explainRules(verdict: TribunalVerdict, targetRule?: string): RuleExplanation[] {
  const judges = defaultRegistry.getJudges();
  const explanations: RuleExplanation[] = [];
  const ruleMap = new Map<string, RuleExplanation>();

  for (const f of verdict.findings) {
    if (targetRule !== undefined && f.ruleId !== targetRule) continue;

    const existing = ruleMap.get(f.ruleId);
    if (existing) {
      existing.occurrences++;
      const lines = f.lineNumbers || [];
      for (const ln of lines) {
        if (!existing.affectedLines.includes(ln)) {
          existing.affectedLines.push(ln);
        }
      }
      continue;
    }

    // find the judge for this rule
    let judgeName = "unknown";
    let domain = "unknown";
    for (const j of judges) {
      if (f.ruleId.startsWith(j.rulePrefix)) {
        judgeName = j.name;
        domain = j.domain;
        break;
      }
    }

    const explanation: RuleExplanation = {
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      judge: judgeName,
      domain,
      description: f.description,
      recommendation: f.recommendation,
      occurrences: 1,
      affectedLines: [...(f.lineNumbers || [])],
    };

    ruleMap.set(f.ruleId, explanation);
    explanations.push(explanation);
  }

  explanations.sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
  });

  return explanations;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRuleExplain(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const ruleIdx = argv.indexOf("--rule");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const targetRule = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "detail";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-rule-explain — Explain rules in detail

Usage:
  judges finding-rule-explain --file <verdict.json> [--rule <RULE-ID>]
                              [--format detail|table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --rule <id>        Explain a specific rule ID
  --format <fmt>     Output format: detail (default), table, json
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

  const explanations = explainRules(verdict, targetRule);

  if (explanations.length === 0) {
    console.log(targetRule ? `No findings for rule: ${targetRule}` : "No findings to explain");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(explanations, null, 2));
    return;
  }

  if (format === "table") {
    console.log(`\nRule Explanations (${explanations.length} rules)`);
    console.log("═".repeat(80));
    console.log(`${"Rule".padEnd(18)} ${"Severity".padEnd(10)} ${"Judge".padEnd(22)} ${"Occurs".padEnd(8)} Title`);
    console.log("─".repeat(80));

    for (const e of explanations) {
      const rule = e.ruleId.length > 16 ? e.ruleId.slice(0, 16) + "…" : e.ruleId;
      const judge = e.judge.length > 20 ? e.judge.slice(0, 20) + "…" : e.judge;
      const title = e.title.length > 25 ? e.title.slice(0, 25) + "…" : e.title;
      console.log(
        `${rule.padEnd(18)} ${e.severity.padEnd(10)} ${judge.padEnd(22)} ${String(e.occurrences).padEnd(8)} ${title}`,
      );
    }
    console.log("═".repeat(80));
    return;
  }

  // detail format
  for (const e of explanations) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  Rule: ${e.ruleId}`);
    console.log(`  Title: ${e.title}`);
    console.log(`  Severity: ${e.severity.toUpperCase()}`);
    console.log(`  Judge: ${e.judge}`);
    console.log(`  Domain: ${e.domain}`);
    console.log(`  Occurrences: ${e.occurrences}`);
    if (e.affectedLines.length > 0) {
      console.log(`  Lines: ${e.affectedLines.join(", ")}`);
    }
    console.log(`${"─".repeat(70)}`);
    console.log(`  Description:`);
    console.log(`    ${e.description}`);
    console.log(`  Recommendation:`);
    console.log(`    ${e.recommendation}`);
  }
  console.log(`\n${"═".repeat(70)}`);
}
