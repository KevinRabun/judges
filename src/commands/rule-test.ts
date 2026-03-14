/**
 * Rule-test — Test custom rules against sample code before deployment.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomRule {
  id: string;
  pattern: string;
  severity: string;
  message: string;
  languages?: string[];
  filePattern?: string;
}

interface RuleTestResult {
  ruleId: string;
  file: string;
  matches: { line: number; content: string }[];
  matched: boolean;
}

// ─── Rule loading ───────────────────────────────────────────────────────────

function loadRules(rulesPath: string): CustomRule[] {
  const raw = readFileSync(rulesPath, "utf-8");
  const parsed = JSON.parse(raw);
  const rules = Array.isArray(parsed) ? parsed : parsed.rules || [];
  return rules as CustomRule[];
}

// ─── File collection ────────────────────────────────────────────────────────

function collectFiles(dirPath: string): string[] {
  const results: string[] = [];
  if (!existsSync(dirPath)) return results;

  const entries = readdirSync(dirPath) as unknown as string[];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    try {
      const st = statSync(fullPath);
      if (st.isDirectory()) {
        results.push(...collectFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    } catch {
      // skip inaccessible entries
    }
  }
  return results;
}

// ─── Language matching ──────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".rb": "ruby",
  ".php": "php",
};

function matchesLanguage(filePath: string, languages?: string[]): boolean {
  if (!languages || languages.length === 0) return true;
  const ext = extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext] || ext.slice(1);
  return languages.includes(lang);
}

// ─── Rule testing ───────────────────────────────────────────────────────────

function testRule(rule: CustomRule, files: string[]): RuleTestResult[] {
  const results: RuleTestResult[] = [];
  let regex: RegExp;
  try {
    regex = new RegExp(rule.pattern, "gi");
  } catch {
    console.error(`  ❌ Rule '${rule.id}' has invalid regex: ${rule.pattern}`);
    return results;
  }

  for (const file of files) {
    if (!matchesLanguage(file, rule.languages)) continue;

    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const matches: { line: number; content: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        matches.push({ line: i + 1, content: lines[i].trim().slice(0, 120) });
      }
    }

    results.push({
      ruleId: rule.id,
      file,
      matches,
      matched: matches.length > 0,
    });
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRuleTest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges rule-test — Test custom rules against sample code

Usage:
  judges rule-test --rules custom-rules.json --fixtures tests/fixtures
  judges rule-test --rules custom-rules.json --file sample.ts
  judges rule-test --rules custom-rules.json --fixtures src --format json

Options:
  --rules <file>       JSON file with custom rules (required)
  --fixtures <dir>     Directory with test fixture files
  --file <path>        Test against a single file
  --rule <id>          Test only a specific rule by ID
  --format json        JSON output
  --help, -h           Show this help

Validates custom rules against real code before deployment. Ensures
patterns match expected findings and catch the intended issues.
`);
    return;
  }

  const rulesPath = argv.find((_a: string, i: number) => argv[i - 1] === "--rules");
  const fixturesDir = argv.find((_a: string, i: number) => argv[i - 1] === "--fixtures");
  const singleFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const ruleFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!rulesPath) {
    console.error("Error: --rules is required. Provide a custom rules JSON file.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(rulesPath)) {
    console.error(`Error: Rules file not found: ${rulesPath}`);
    process.exitCode = 1;
    return;
  }

  let rules: CustomRule[];
  try {
    rules = loadRules(rulesPath);
  } catch {
    console.error(`Error: Cannot parse rules file: ${rulesPath}`);
    process.exitCode = 1;
    return;
  }

  if (ruleFilter) {
    rules = rules.filter((r) => r.id === ruleFilter);
    if (rules.length === 0) {
      console.error(`Error: Rule '${ruleFilter}' not found in ${rulesPath}`);
      process.exitCode = 1;
      return;
    }
  }

  // Gather target files
  let files: string[];
  if (singleFile) {
    if (!existsSync(singleFile)) {
      console.error(`Error: File not found: ${singleFile}`);
      process.exitCode = 1;
      return;
    }
    files = [singleFile];
  } else if (fixturesDir) {
    files = collectFiles(fixturesDir);
  } else {
    console.error("Error: Either --fixtures or --file is required.");
    process.exitCode = 1;
    return;
  }

  if (files.length === 0) {
    console.log("No files found to test against.");
    return;
  }

  // Run tests
  const allResults: RuleTestResult[] = [];
  for (const rule of rules) {
    allResults.push(...testRule(rule, files));
  }

  const matchedResults = allResults.filter((r) => r.matched);
  const rulesWithMatches = new Set(matchedResults.map((r) => r.ruleId));

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          rulesCount: rules.length,
          filesCount: files.length,
          matchedRules: rulesWithMatches.size,
          totalMatches: matchedResults.reduce((s, r) => s + r.matches.length, 0),
          results: matchedResults.map((r) => ({
            ruleId: r.ruleId,
            file: r.file,
            matchCount: r.matches.length,
            matches: r.matches,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n  Rule Test Results\n  ─────────────────────────────`);
  console.log(`    Rules tested: ${rules.length}`);
  console.log(`    Files scanned: ${files.length}`);
  console.log(`    Rules with matches: ${rulesWithMatches.size}\n`);

  for (const rule of rules) {
    const ruleResults = matchedResults.filter((r) => r.ruleId === rule.id);
    const totalMatches = ruleResults.reduce((s, r) => s + r.matches.length, 0);
    const icon = totalMatches > 0 ? "✅" : "⬜";

    console.log(`    ${icon} ${rule.id} — ${totalMatches} match(es) across ${ruleResults.length} file(s)`);
    console.log(`       Pattern: ${rule.pattern}`);
    console.log(`       Severity: ${rule.severity}`);

    for (const rr of ruleResults.slice(0, 3)) {
      for (const m of rr.matches.slice(0, 3)) {
        console.log(`         L${m.line}: ${m.content}`);
      }
    }
    console.log();
  }
}
