/**
 * Finding-auto-label — Automatically label findings based on content analysis.
 */

import type { Finding, TribunalVerdict } from "../types.js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Label Rules ────────────────────────────────────────────────────────────

interface LabelRule {
  label: string;
  keywords: string[];
  rulePatterns: string[];
  severities: string[];
}

const BUILTIN_RULES: LabelRule[] = [
  {
    label: "security",
    keywords: ["injection", "xss", "csrf", "auth", "vuln", "password", "secret", "token", "credential", "ssrf"],
    rulePatterns: ["SEC-", "VULN-", "AUTH-", "CRYPTO-"],
    severities: [],
  },
  {
    label: "performance",
    keywords: ["performance", "n+1", "slow", "bottleneck", "memory leak", "cache", "latency", "optimization"],
    rulePatterns: ["PERF-"],
    severities: [],
  },
  {
    label: "quality",
    keywords: ["code smell", "duplication", "complexity", "maintainability", "readability", "dead code"],
    rulePatterns: ["QUAL-", "SMELL-"],
    severities: [],
  },
  {
    label: "bug",
    keywords: ["null pointer", "undefined", "type error", "race condition", "deadlock", "off-by-one", "boundary"],
    rulePatterns: ["BUG-", "ERR-"],
    severities: ["critical", "high"],
  },
  {
    label: "style",
    keywords: ["naming", "formatting", "convention", "whitespace", "indentation", "lint"],
    rulePatterns: ["STYLE-", "FMT-"],
    severities: [],
  },
  {
    label: "documentation",
    keywords: ["missing doc", "jsdoc", "comment", "readme", "documentation"],
    rulePatterns: ["DOC-"],
    severities: [],
  },
  {
    label: "dependency",
    keywords: ["dependency", "outdated", "vulnerable package", "npm", "import", "require"],
    rulePatterns: ["DEP-"],
    severities: [],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function customRulesFile(): string {
  return join(process.cwd(), ".judges", "auto-label-rules.json");
}

function loadCustomRules(): LabelRule[] {
  const f = customRulesFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveCustomRules(rules: LabelRule[]): void {
  const f = customRulesFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(rules, null, 2));
}

function applyLabels(finding: Finding, rules: LabelRule[]): string[] {
  const labels: string[] = [];
  const text = `${finding.ruleId || ""} ${finding.title || ""} ${finding.description || ""}`.toLowerCase();

  for (const rule of rules) {
    let matched = false;
    // Keyword match
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) matched = true;
    // RuleId pattern match
    if (!matched && finding.ruleId && rule.rulePatterns.some((p) => finding.ruleId.startsWith(p))) matched = true;
    // Severity match
    if (!matched && rule.severities.length > 0 && finding.severity && rule.severities.includes(finding.severity))
      matched = true;
    if (matched) labels.push(rule.label);
  }
  return [...new Set(labels)];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAutoLabel(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges finding-auto-label — Auto-label findings based on content

Usage:
  judges finding-auto-label apply  --file <results.json> [--format json]
  judges finding-auto-label rules  [list | add | remove]
  judges finding-auto-label test   --text <text>

Subcommands:
  apply                Apply labels to findings in a result file
  rules list           List all label rules (builtin + custom)
  rules add            Add a custom rule: --label <l> --keywords <k1,k2>
  rules remove         Remove custom rule: --label <l>
  test                 Test which labels match a text string

Options:
  --file <path>        Result file (apply subcommand)
  --label <name>       Label name
  --keywords <list>    Comma-separated keywords for matching
  --text <text>        Text to test labeling on
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const allRules = [...BUILTIN_RULES, ...loadCustomRules()];

  if (sub === "apply") {
    const file = args.find((_a: string, i: number) => args[i - 1] === "--file");
    const format = args.find((_a: string, i: number) => args[i - 1] === "--format") || "text";
    if (!file) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      console.error("Error: could not parse file");
      process.exitCode = 1;
      return;
    }

    const findings = verdict.findings || [];
    const labeled = findings.map((f) => ({ ...f, autoLabels: applyLabels(f, allRules) }));
    const withLabels = labeled.filter((f) => f.autoLabels.length > 0);

    if (format === "json") {
      console.log(JSON.stringify({ total: findings.length, labeled: withLabels.length, findings: labeled }, null, 2));
      return;
    }

    console.log(`\nAuto-Label Results:`);
    console.log("═".repeat(70));
    console.log(`  Total findings: ${findings.length}`);
    console.log(`  Labeled: ${withLabels.length}`);
    console.log("─".repeat(70));

    for (const f of labeled.slice(0, 25)) {
      const tags = f.autoLabels.length > 0 ? f.autoLabels.map((l) => `[${l}]`).join(" ") : "[unclassified]";
      console.log(`  ${(f.ruleId || "unknown").padEnd(25)} ${tags}`);
    }
    if (labeled.length > 25) console.log(`  ... and ${labeled.length - 25} more`);
    console.log("═".repeat(70));
  } else if (sub === "rules") {
    const action = args[0] || "list";
    if (action === "list") {
      console.log("\nLabel Rules:");
      console.log("═".repeat(60));
      for (const r of allRules) {
        const src = BUILTIN_RULES.includes(r) ? "builtin" : "custom";
        console.log(
          `  ${r.label.padEnd(18)} [${src}]  keywords: ${r.keywords.slice(0, 4).join(", ")}${r.keywords.length > 4 ? "..." : ""}`,
        );
      }
      console.log("═".repeat(60));
    } else if (action === "add") {
      const label = args.find((_a: string, i: number) => args[i - 1] === "--label");
      const kwStr = args.find((_a: string, i: number) => args[i - 1] === "--keywords");
      if (!label || !kwStr) {
        console.error("Error: --label and --keywords required");
        process.exitCode = 1;
        return;
      }
      const customs = loadCustomRules();
      customs.push({ label, keywords: kwStr.split(",").map((k) => k.trim()), rulePatterns: [], severities: [] });
      saveCustomRules(customs);
      console.log(`Added custom rule: ${label}`);
    } else if (action === "remove") {
      const label = args.find((_a: string, i: number) => args[i - 1] === "--label");
      if (!label) {
        console.error("Error: --label required");
        process.exitCode = 1;
        return;
      }
      const customs = loadCustomRules().filter((r) => r.label !== label);
      saveCustomRules(customs);
      console.log(`Removed custom rule: ${label}`);
    }
  } else if (sub === "test") {
    const text = args.find((_a: string, i: number) => args[i - 1] === "--text");
    if (!text) {
      console.error("Error: --text required");
      process.exitCode = 1;
      return;
    }
    const fake: Finding = { ruleId: "", severity: "medium", title: text, description: text, recommendation: "" };
    const labels = applyLabels(fake, allRules);
    if (labels.length > 0) {
      console.log(`Labels matched: ${labels.join(", ")}`);
    } else {
      console.log("No labels matched.");
    }
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
