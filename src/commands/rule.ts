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

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
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

// ─── Rule Test Assertions ────────────────────────────────────────────────────

/**
 * A single test case for a custom rule.
 * Specifies code input and what the rule should or should not flag.
 */
export interface RuleTestCase {
  /** Short name for the test case */
  name: string;
  /** Code snippet to evaluate */
  code: string;
  /** Language of the code snippet */
  language?: string;
  /** Minimum expected finding count (default: 1 for shouldMatch) */
  expectedMinFindings?: number;
  /** Maximum expected finding count (default: 0 for shouldNotMatch) */
  expectedMaxFindings?: number;
  /** Whether the rule should produce findings (true) or not (false) */
  shouldMatch: boolean;
  /** If shouldMatch, optionally assert a specific rule ID in findings */
  expectedRuleId?: string;
  /** If shouldMatch, optionally assert findings reference specific lines */
  expectedLines?: number[];
}

/**
 * Result of running a single rule test case.
 */
export interface RuleTestResult {
  /** Test case name */
  name: string;
  /** Whether the test passed */
  passed: boolean;
  /** Number of findings produced */
  findingCount: number;
  /** Failure reason if not passed */
  reason?: string;
  /** The actual findings for inspection */
  findings: Finding[];
}

/**
 * Summary of running a test suite for a rule.
 */
export interface RuleTestSuiteResult {
  /** Rule ID that was tested */
  ruleId: string;
  /** Total test cases run */
  total: number;
  /** Test cases that passed */
  passed: number;
  /** Test cases that failed */
  failed: number;
  /** Individual test results */
  results: RuleTestResult[];
}

/**
 * Run a set of test cases against a custom rule and return pass/fail results.
 */
export function runRuleTests(rule: CustomRule, testCases: RuleTestCase[]): RuleTestSuiteResult {
  const results: RuleTestResult[] = [];

  for (const tc of testCases) {
    const lang = tc.language || "typescript";
    const findings = testRule(rule, tc.code, lang);
    let passed = true;
    let reason: string | undefined;

    if (tc.shouldMatch) {
      const minExpected = tc.expectedMinFindings ?? 1;
      if (findings.length < minExpected) {
        passed = false;
        reason = `Expected at least ${minExpected} finding(s) but got ${findings.length}`;
      }
      if (tc.expectedMaxFindings !== undefined && findings.length > tc.expectedMaxFindings) {
        passed = false;
        reason = `Expected at most ${tc.expectedMaxFindings} finding(s) but got ${findings.length}`;
      }
      if (passed && tc.expectedRuleId) {
        if (!findings.some((f) => f.ruleId === tc.expectedRuleId)) {
          passed = false;
          reason = `Expected finding with ruleId "${tc.expectedRuleId}" not found`;
        }
      }
      if (passed && tc.expectedLines && tc.expectedLines.length > 0) {
        const actualLines = new Set(findings.flatMap((f) => f.lineNumbers || []));
        const missing = tc.expectedLines.filter((l) => !actualLines.has(l));
        if (missing.length > 0) {
          passed = false;
          reason = `Expected findings on line(s) ${missing.join(", ")} but not found`;
        }
      }
    } else {
      const maxExpected = tc.expectedMaxFindings ?? 0;
      if (findings.length > maxExpected) {
        passed = false;
        reason = `Expected no findings but got ${findings.length}`;
      }
    }

    results.push({ name: tc.name, passed, findingCount: findings.length, reason, findings });
  }

  return {
    ruleId: rule.id,
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

/**
 * Validate a set of test cases for structural correctness.
 * Returns an array of error messages (empty if valid).
 */
export function validateRuleTestSuite(testCases: RuleTestCase[]): string[] {
  const errors: string[] = [];
  const names = new Set<string>();

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    if (!tc.name || tc.name.trim().length === 0) {
      errors.push(`Test case ${i}: missing name`);
    }
    if (names.has(tc.name)) {
      errors.push(`Test case ${i}: duplicate name "${tc.name}"`);
    }
    names.add(tc.name);
    if (!tc.code && tc.code !== "") {
      errors.push(`Test case ${i} (${tc.name}): missing code`);
    }
    if (typeof tc.shouldMatch !== "boolean") {
      errors.push(`Test case ${i} (${tc.name}): shouldMatch must be boolean`);
    }
  }

  return errors;
}

/**
 * Format test suite results as a human-readable report.
 */
export function formatRuleTestResults(result: RuleTestSuiteResult): string {
  const lines: string[] = [];
  const icon = result.failed === 0 ? "✅" : "❌";

  lines.push(`${icon} Rule: ${result.ruleId} — ${result.passed}/${result.total} tests passed`);
  lines.push("─".repeat(60));

  for (const tr of result.results) {
    const status = tr.passed ? "  ✓" : "  ✗";
    lines.push(`${status} ${tr.name} (${tr.findingCount} finding${tr.findingCount !== 1 ? "s" : ""})`);
    if (!tr.passed && tr.reason) {
      lines.push(`      → ${tr.reason}`);
    }
  }

  return lines.join("\n");
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
