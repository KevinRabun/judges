/**
 * Custom Rule Authoring — `judges rule` command
 *
 * Create, list, and manage custom evaluation rules from the CLI.
 * Custom rules are stored in .judgesrc or a dedicated rules directory.
 *
 * Usage:
 *   judges rule create              Interactive rule creation wizard
 *   judges rule list                List custom rules
 *   judges rule test <rule-id>      Test a custom rule against sample code
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import type { Finding, Severity } from "../types.js";
import type { CustomRule } from "../plugins.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CustomRuleFile {
  version: string;
  rules: SerializedRule[];
}

export interface SerializedRule {
  id: string;
  title: string;
  severity: Severity;
  judgeId: string;
  description: string;
  languages?: string[];
  pattern?: string;
  patternFlags?: string;
  suggestedFix?: string;
  tags?: string[];
}

// ─── Rule File I/O ───────────────────────────────────────────────────────────

const RULES_FILE = ".judges-rules.json";

export function loadCustomRuleFile(dir: string = "."): CustomRuleFile {
  const filePath = resolve(dir, RULES_FILE);
  if (!existsSync(filePath)) {
    return { version: "1.0.0", rules: [] };
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return { version: "1.0.0", rules: [] };
  }
}

export function saveCustomRuleFile(data: CustomRuleFile, dir: string = "."): void {
  const filePath = resolve(dir, RULES_FILE);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Convert a serialized rule to a CustomRule object.
 */
export function deserializeRule(sr: SerializedRule): CustomRule {
  return {
    id: sr.id,
    title: sr.title,
    severity: sr.severity,
    judgeId: sr.judgeId,
    description: sr.description,
    languages: sr.languages,
    pattern: sr.pattern ? new RegExp(sr.pattern, sr.patternFlags || "gi") : undefined,
    suggestedFix: sr.suggestedFix,
    tags: sr.tags,
  };
}

/**
 * Generate a rule template.
 */
export function generateRuleTemplate(id: string): SerializedRule {
  return {
    id,
    title: "Custom Rule",
    severity: "medium",
    judgeId: "cybersecurity",
    description: "Describe what this rule detects.",
    languages: ["typescript", "javascript"],
    pattern: "TODO_PATTERN",
    patternFlags: "gi",
    suggestedFix: "Describe how to fix this issue.",
    tags: ["custom"],
  };
}

/**
 * Test a custom rule against sample code.
 */
export function testRule(rule: CustomRule, code: string, language: string): Finding[] {
  if (!rule.pattern && !rule.analyze) return [];

  if (rule.languages && rule.languages.length > 0 && !rule.languages.includes(language)) {
    return [];
  }

  const findings: Finding[] = [];

  if (rule.analyze) {
    findings.push(...rule.analyze(code, language));
  } else if (rule.pattern) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      const beforeMatch = code.slice(0, match.index);
      const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        description: `${rule.description} (matched: ${match[0].slice(0, 80)})`,
        lineNumbers: [lineNum],
        recommendation: rule.suggestedFix || "",
        suggestedFix: rule.suggestedFix,
      });
    }
  }

  return findings;
}

// ─── CLI Handler ─────────────────────────────────────────────────────────────

export function parseRuleArgs(argv: string[]): { subcommand: string; ruleId?: string; file?: string } {
  const subcommand = argv[3] || "list";
  let ruleId: string | undefined;
  let file: string | undefined;

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file" || arg === "-f") {
      file = argv[++i];
    } else if (!arg.startsWith("-") && !ruleId) {
      ruleId = arg;
    }
  }

  return { subcommand, ruleId, file };
}

export function runRule(argv: string[]): void {
  const { subcommand, ruleId, file } = parseRuleArgs(argv);

  switch (subcommand) {
    case "create": {
      const id = ruleId || `CUSTOM-${String(Date.now()).slice(-4)}`;
      const ruleFile = loadCustomRuleFile();
      const template = generateRuleTemplate(id);
      ruleFile.rules.push(template);
      saveCustomRuleFile(ruleFile);
      console.log(`\n  ✅ Created custom rule template: ${id}`);
      console.log(`  Edit ${RULES_FILE} to configure the rule pattern and metadata.`);
      console.log("");
      console.log(`  Template:`);
      console.log(`  ${JSON.stringify(template, null, 2).split("\n").join("\n  ")}`);
      console.log("");
      process.exit(0);
      break;
    }

    case "list": {
      const ruleFile = loadCustomRuleFile();
      if (ruleFile.rules.length === 0) {
        console.log("\n  No custom rules defined.");
        console.log("  Run 'judges rule create <id>' to create one.\n");
        process.exit(0);
      }
      console.log(`\n  Custom Rules (${ruleFile.rules.length}):`);
      console.log("  " + "─".repeat(60));
      for (const r of ruleFile.rules) {
        console.log(`  ${r.id.padEnd(20)} ${r.title} [${r.severity}]`);
        if (r.description) console.log(`  ${"".padEnd(20)} ${r.description}`);
      }
      console.log("");
      process.exit(0);
      break;
    }

    case "test": {
      if (!ruleId) {
        console.error("Error: Specify a rule ID to test.");
        process.exit(1);
      }
      const ruleFile = loadCustomRuleFile();
      const serialized = ruleFile.rules.find((r) => r.id === ruleId);
      if (!serialized) {
        console.error(`Error: Rule "${ruleId}" not found.`);
        process.exit(1);
      }

      const rule = deserializeRule(serialized);
      let code = "";
      const language = "typescript";

      if (file) {
        const resolved = resolve(file);
        if (!existsSync(resolved)) {
          console.error(`Error: File not found: ${resolved}`);
          process.exit(1);
        }
        code = readFileSync(resolved, "utf-8");
      } else if (!process.stdin.isTTY) {
        code = readFileSync(0, "utf-8");
      } else {
        console.error("Error: Provide a file with --file or pipe code via stdin.");
        process.exit(1);
      }

      const findings = testRule(rule, code, language);
      console.log(`\n  Rule: ${rule.id} — ${rule.title}`);
      console.log(`  Findings: ${findings.length}`);
      for (const f of findings) {
        console.log(`    Line ${f.lineNumbers?.[0] ?? "?"}: ${f.description}`);
      }
      console.log("");
      process.exit(0);
      break;
    }

    default: {
      console.log(`
Judges Panel — Custom Rule Management

USAGE:
  judges rule create [id]          Create a custom rule template
  judges rule list                 List all custom rules
  judges rule test <rule-id>       Test a rule against code
    --file, -f <path>              File to test against (or pipe via stdin)
`);
      process.exit(0);
    }
  }
}
