/**
 * Rule coverage map — show which rules apply to which languages,
 * helping teams understand their coverage and identify gaps.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RuleCoverage {
  ruleId: string;
  languages: string[];
  severity: string;
  judge: string;
}

export interface CoverageMap {
  languages: string[];
  rules: RuleCoverage[];
  matrix: Record<string, Record<string, boolean>>;
  stats: {
    totalRules: number;
    byLanguage: Record<string, number>;
    byJudge: Record<string, number>;
  };
}

// ─── Rules-to-Language Mapping ──────────────────────────────────────────────

/**
 * Universal rules applicable to all programming languages.
 */
const UNIVERSAL_RULES: Array<{ pattern: string; judge: string; severity: string }> = [
  { pattern: "SEC-", judge: "cybersecurity", severity: "high" },
  { pattern: "ERR-", judge: "error-handling", severity: "medium" },
  { pattern: "MAINT-", judge: "maintainability", severity: "low" },
  { pattern: "DOC-", judge: "documentation", severity: "low" },
  { pattern: "STRUCT-", judge: "code-structure", severity: "medium" },
  { pattern: "TEST-", judge: "testing", severity: "medium" },
  { pattern: "LOG-", judge: "logging-privacy", severity: "medium" },
  { pattern: "AI-", judge: "ai-code-safety", severity: "high" },
];

/**
 * Language-specific rules with limited applicability.
 */
const LANGUAGE_RULES: Array<{ pattern: string; judge: string; severity: string; languages: string[] }> = [
  {
    pattern: "INJECT-SQL",
    judge: "cybersecurity",
    severity: "critical",
    languages: ["typescript", "javascript", "python", "java", "csharp", "php", "ruby", "go"],
  },
  {
    pattern: "INJECT-CMD",
    judge: "cybersecurity",
    severity: "critical",
    languages: ["typescript", "javascript", "python", "java", "csharp", "php", "ruby", "go", "rust"],
  },
  {
    pattern: "XSS-",
    judge: "cybersecurity",
    severity: "high",
    languages: ["typescript", "javascript", "python", "java", "csharp", "php", "ruby"],
  },
  {
    pattern: "SSRF-",
    judge: "cybersecurity",
    severity: "high",
    languages: ["typescript", "javascript", "python", "java", "csharp", "go", "ruby"],
  },
  {
    pattern: "CRYPTO-",
    judge: "cybersecurity",
    severity: "high",
    languages: ["typescript", "javascript", "python", "java", "csharp", "go", "rust", "c", "cpp"],
  },
  {
    pattern: "AUTH-",
    judge: "authentication",
    severity: "high",
    languages: ["typescript", "javascript", "python", "java", "csharp", "go", "ruby", "php"],
  },
  {
    pattern: "PERF-",
    judge: "performance",
    severity: "medium",
    languages: ["typescript", "javascript", "python", "java", "csharp", "go", "rust", "c", "cpp"],
  },
  {
    pattern: "DB-",
    judge: "database",
    severity: "medium",
    languages: ["typescript", "javascript", "python", "java", "csharp", "go", "ruby", "sql"],
  },
  { pattern: "IAC-", judge: "iac-security", severity: "high", languages: ["terraform", "bicep", "yaml", "dockerfile"] },
  { pattern: "CICD-", judge: "ci-cd", severity: "high", languages: ["yaml", "dockerfile", "bash", "powershell"] },
  {
    pattern: "CONCUR-",
    judge: "concurrency",
    severity: "high",
    languages: ["go", "rust", "java", "csharp", "python", "c", "cpp"],
  },
  { pattern: "A11Y-", judge: "accessibility", severity: "medium", languages: ["typescript", "javascript", "html"] },
  {
    pattern: "I18N-",
    judge: "internationalization",
    severity: "low",
    languages: ["typescript", "javascript", "python", "java", "csharp"],
  },
  { pattern: "FW-REACT", judge: "framework-safety", severity: "high", languages: ["typescript", "javascript"] },
  { pattern: "FW-EXPRESS", judge: "framework-safety", severity: "high", languages: ["typescript", "javascript"] },
  { pattern: "FW-DJANGO", judge: "framework-safety", severity: "high", languages: ["python"] },
  { pattern: "FW-FLASK", judge: "framework-safety", severity: "high", languages: ["python"] },
  { pattern: "FW-SPRING", judge: "framework-safety", severity: "high", languages: ["java", "kotlin"] },
  { pattern: "FW-RAILS", judge: "framework-safety", severity: "high", languages: ["ruby"] },
  { pattern: "FW-NEXT", judge: "framework-safety", severity: "high", languages: ["typescript", "javascript"] },
  { pattern: "FW-FASTAPI", judge: "framework-safety", severity: "high", languages: ["python"] },
];

const ALL_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "java",
  "csharp",
  "go",
  "rust",
  "ruby",
  "php",
  "c",
  "cpp",
  "kotlin",
  "scala",
  "swift",
  "dart",
  "bash",
  "powershell",
  "sql",
  "terraform",
  "bicep",
  "yaml",
  "dockerfile",
  "html",
];

// ─── Coverage Computation ───────────────────────────────────────────────────

export function buildCoverageMap(languages?: string[]): CoverageMap {
  const langs = languages || ALL_LANGUAGES;
  const rules: RuleCoverage[] = [];
  const matrix: Record<string, Record<string, boolean>> = {};

  // Universal rules
  for (const r of UNIVERSAL_RULES) {
    const coverage: RuleCoverage = {
      ruleId: r.pattern.replace(/-$/, ""),
      languages: [...langs],
      severity: r.severity,
      judge: r.judge,
    };
    rules.push(coverage);
    matrix[coverage.ruleId] = {};
    for (const l of langs) matrix[coverage.ruleId][l] = true;
  }

  // Language-specific rules
  for (const r of LANGUAGE_RULES) {
    const applicableLangs = r.languages.filter((l) => langs.includes(l));
    const coverage: RuleCoverage = {
      ruleId: r.pattern.replace(/-$/, ""),
      languages: applicableLangs,
      severity: r.severity,
      judge: r.judge,
    };
    rules.push(coverage);
    matrix[coverage.ruleId] = {};
    for (const l of langs) matrix[coverage.ruleId][l] = applicableLangs.includes(l);
  }

  // Statistics
  const byLanguage: Record<string, number> = {};
  const byJudge: Record<string, number> = {};

  for (const r of rules) {
    byJudge[r.judge] = (byJudge[r.judge] || 0) + 1;
    for (const l of r.languages) {
      byLanguage[l] = (byLanguage[l] || 0) + 1;
    }
  }

  return {
    languages: langs,
    rules,
    matrix,
    stats: { totalRules: rules.length, byLanguage, byJudge },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCoverageMap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges coverage-map — Show which rules apply to which languages

Usage:
  judges coverage-map                              Full coverage matrix
  judges coverage-map --languages typescript,python Focus on specific languages
  judges coverage-map --judge cybersecurity         Filter by judge

Options:
  --languages <list>    Comma-separated languages to show
  --judge <id>          Filter rules by judge
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const langsArg = argv.find((_a: string, i: number) => argv[i - 1] === "--languages");
  const judgeFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--judge");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const languages = langsArg ? langsArg.split(",").map((s: string) => s.trim()) : undefined;
  const map = buildCoverageMap(languages);

  let rules = map.rules;
  if (judgeFilter) {
    rules = rules.filter((r) => r.judge === judgeFilter);
  }

  if (format === "json") {
    console.log(JSON.stringify({ ...map, rules }, null, 2));
    return;
  }

  console.log(`\n  Rule Coverage Map\n`);
  console.log(`  Total rules: ${rules.length} | Languages: ${map.languages.length}\n`);

  // Show compact matrix
  const displayLangs = map.languages.slice(0, 12); // limit width
  const header = "  " + "Rule".padEnd(20) + displayLangs.map((l) => l.slice(0, 4).padEnd(5)).join("");
  console.log(header);
  console.log("  " + "─".repeat(header.length - 2));

  for (const r of rules) {
    const row = displayLangs.map((l) => (r.languages.includes(l) ? "  ✓  " : "  ·  ")).join("");
    console.log(`  ${r.ruleId.padEnd(20)}${row}`);
  }

  console.log(`\n  Coverage by language:`);
  const sorted = Object.entries(map.stats.byLanguage).sort((a, b) => b[1] - a[1]);
  for (const [lang, count] of sorted) {
    const pct = ((count / rules.length) * 100).toFixed(0);
    console.log(`    ${lang.padEnd(15)} ${String(count).padStart(3)} rules (${pct}%)`);
  }

  console.log(`\n  Coverage by judge:`);
  for (const [judge, count] of Object.entries(map.stats.byJudge).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${judge.padEnd(25)} ${count} rules`);
  }
  console.log("");
}
