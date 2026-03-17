/**
 * Custom judge authoring toolkit — scaffolds, validates,
 * and tests new judge definitions.
 *
 * All data stored locally.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface JudgeScaffold {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  rules: Array<{
    id: string;
    pattern: string;
    message: string;
    severity: string;
  }>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Scaffold ───────────────────────────────────────────────────────────────

function scaffoldJudge(id: string, opts: { name?: string; category?: string; severity?: string }): JudgeScaffold {
  return {
    id,
    name: opts.name || id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `Custom judge: ${id}`,
    category: opts.category || "custom",
    severity: opts.severity || "medium",
    rules: [
      {
        id: `${id}-001`,
        pattern: "TODO: define pattern",
        message: "TODO: describe what this rule detects",
        severity: opts.severity || "medium",
      },
    ],
  };
}

function generateJudgeFile(scaffold: JudgeScaffold): string {
  return `/**
 * ${scaffold.name}
 *
 * ${scaffold.description}
 * Category: ${scaffold.category}
 */

import type { Finding } from "../types.js";

export const judgeId = "${scaffold.id}";
export const judgeName = "${scaffold.name}";
export const judgeDescription = "${scaffold.description}";
export const judgeCategory = "${scaffold.category}";

interface Rule {
  id: string;
  pattern: RegExp;
  message: string;
  severity: string;
}

const rules: Rule[] = [
${scaffold.rules
  .map(
    (r) => `  {
    id: "${r.id}",
    pattern: /${r.pattern.replace(/\\/g, "\\\\").replace(/\//g, "\\/")}/g,
    message: "${r.message}",
    severity: "${r.severity}",
  },`,
  )
  .join("\n")}
];

export function evaluate(code: string, _filename: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\\n");

  for (const rule of rules) {
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity as Finding["severity"],
          title: rule.message,
          description: \`Detected by custom judge \${judgeId} at line \${i + 1}\`,
          lineNumbers: [i + 1],
          recommendation: "Review and fix the detected pattern",
        });
        rule.pattern.lastIndex = 0; // reset global regex
      }
    }
  }

  return findings;
}
`;
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateJudge(path: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(path)) {
    return { valid: false, errors: [`File not found: ${path}`], warnings: [] };
  }

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return { valid: false, errors: [`Cannot read file: ${path}`], warnings: [] };
  }

  // Check for required exports
  if (!content.includes("export const judgeId")) errors.push("Missing 'export const judgeId'");
  if (!content.includes("export const judgeName")) errors.push("Missing 'export const judgeName'");
  if (!content.includes("export function evaluate")) errors.push("Missing 'export function evaluate'");

  // Check for Finding type
  if (!content.includes("Finding"))
    warnings.push("No reference to Finding type — ensure findings match expected shape");

  // Check for severity values
  const validSeverities = ["critical", "high", "medium", "low", "info"];
  const sevMatches = content.match(/severity:\s*["'](\w+)["']/g) || [];
  for (const m of sevMatches) {
    const val = m.match(/["'](\w+)["']/)?.[1];
    if (val && !validSeverities.includes(val)) {
      errors.push(`Invalid severity '${val}' — must be: ${validSeverities.join(", ")}`);
    }
  }

  // Check for rule IDs
  const ruleIds = content.match(/id:\s*["']([^"']+)["']/g) || [];
  if (ruleIds.length === 0) warnings.push("No rule IDs found — each rule should have a unique id");

  return { valid: errors.length === 0, errors, warnings };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-custom";

export function runJudgeAuthor(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges judge-author — Custom judge authoring toolkit

Usage:
  judges judge-author --scaffold <id>
  judges judge-author --validate <file>
  judges judge-author --list
  judges judge-author --test <file> --code <sample>

Options:
  --scaffold <id>       Generate a new judge scaffold
  --name <name>         Judge display name
  --category <cat>      Category (default: custom)
  --severity <sev>      Default severity (default: medium)
  --validate <file>     Validate judge file structure
  --list                List existing custom judges
  --test <file>         Test a judge against sample code
  --code <sample>       Sample code file to test against
  --output <dir>        Output directory (default: .judges-custom)
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List existing judges
  if (argv.includes("--list")) {
    const builtin = defaultRegistry.getJudges();
    const customDir = STORE;
    let customCount = 0;

    if (existsSync(customDir)) {
      try {
        const { readdirSync } = require("fs");
        customCount = readdirSync(customDir).filter((f: string) => f.endsWith(".ts") || f.endsWith(".json")).length;
      } catch {
        /* skip */
      }
    }

    if (format === "json") {
      console.log(
        JSON.stringify({ builtin: builtin.length, custom: customCount, judges: builtin.map((j) => j.id) }, null, 2),
      );
    } else {
      console.log(`\n  Judges Registry\n  ──────────────────────────`);
      console.log(`    Built-in: ${builtin.length}`);
      console.log(`    Custom:   ${customCount}`);
      console.log(`\n  Built-in judges:`);
      for (const j of builtin) {
        console.log(`    ${j.id}`);
      }
      console.log("");
    }
    return;
  }

  // Scaffold
  const scaffoldId = argv.find((_a: string, i: number) => argv[i - 1] === "--scaffold");
  if (scaffoldId) {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");
    const category = argv.find((_a: string, i: number) => argv[i - 1] === "--category");
    const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");
    const outputDir = argv.find((_a: string, i: number) => argv[i - 1] === "--output") || STORE;

    const scaffold = scaffoldJudge(scaffoldId, {
      name: name || undefined,
      category: category || undefined,
      severity: severity || undefined,
    });
    const code = generateJudgeFile(scaffold);

    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const outPath = join(outputDir, `${scaffoldId}.ts`);
    writeFileSync(outPath, code);

    // Also write the JSON definition
    const jsonPath = join(outputDir, `${scaffoldId}.json`);
    writeFileSync(jsonPath, JSON.stringify(scaffold, null, 2));

    if (format === "json") {
      console.log(JSON.stringify({ scaffold, files: [outPath, jsonPath] }, null, 2));
    } else {
      console.log(`\n  Judge Scaffolded: ${scaffoldId}\n  ──────────────────────────`);
      console.log(`    TypeScript: ${outPath}`);
      console.log(`    Definition: ${jsonPath}`);
      console.log(`\n  Next steps:`);
      console.log(`    1. Edit ${outPath} to add detection patterns`);
      console.log(`    2. Validate with: judges judge-author --validate ${outPath}`);
      console.log(`    3. Test with: judges judge-author --test ${outPath} --code sample.ts\n`);
    }
    return;
  }

  // Validate
  const validatePath = argv.find((_a: string, i: number) => argv[i - 1] === "--validate");
  if (validatePath) {
    const result = validateJudge(validatePath);

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n  Validation: ${validatePath}`);
      console.log(`  Status: ${result.valid ? "✅ Valid" : "❌ Invalid"}\n  ──────────────────────────`);
      for (const e of result.errors) console.log(`    ❌ ${e}`);
      for (const w of result.warnings) console.log(`    ⚠️  ${w}`);
      if (result.valid && result.warnings.length === 0) console.log(`    All checks passed`);
      console.log("");
    }
    return;
  }

  // Test
  const testPath = argv.find((_a: string, i: number) => argv[i - 1] === "--test");
  const codePath = argv.find((_a: string, i: number) => argv[i - 1] === "--code");
  if (testPath) {
    if (!codePath || !existsSync(codePath)) {
      console.error("  Provide --code <file> with a sample code file to test against.");
      return;
    }
    // Validate first
    const validation = validateJudge(testPath);
    if (!validation.valid) {
      console.error("  Judge file has validation errors. Fix errors before testing.");
      for (const e of validation.errors) console.error(`    ❌ ${e}`);
      return;
    }

    console.log(`\n  Testing ${testPath} against ${codePath}`);
    console.log(`  (Note: full testing requires loading the judge module at runtime)\n`);
    console.log(`  Validation: ✅ Passed`);
    console.log(`  Structure:  ✅ Valid`);
    console.log(`\n  To run a full test, import and call the evaluate() function directly.\n`);
    return;
  }

  console.log("  Use --scaffold, --validate, --list, or --test. Run --help for details.");
}
