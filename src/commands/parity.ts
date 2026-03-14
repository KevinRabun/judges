/**
 * `judges parity` — Language pattern parity audit.
 *
 * Audits the language-pattern library to identify gaps where a pattern
 * concept exists for some languages but not others, helping maintainers
 * prioritise pattern-writing effort.
 *
 * Usage:
 *   judges parity                          # text table
 *   judges parity --json                   # JSON output
 *   judges parity --lang python            # filter to one language
 */

import type { LangFamily } from "../types.js";
import * as LP from "../language-patterns.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PatternEntry {
  name: string;
  languages: LangFamily[];
  missingLanguages: LangFamily[];
  coverage: number; // 0-1
}

export interface ParityReport {
  patterns: PatternEntry[];
  languageCoverage: Record<string, { covered: number; total: number; pct: number }>;
  overallCoverage: number;
}

// ─── Core Languages (excluding IaC-only and "unknown") ─────────────────────

const CORE_LANGUAGES: LangFamily[] = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "csharp",
  "java",
  "go",
  "cpp",
  "php",
  "ruby",
  "kotlin",
  "swift",
  "dart",
  "bash",
];

const IAC_LANGUAGES: LangFamily[] = ["terraform", "bicep", "arm"];

// ─── Pattern Catalogue ─────────────────────────────────────────────────────

function getPatternCatalogue(): Array<{ name: string; obj: Record<string, unknown>; isIaC: boolean }> {
  const catalogue: Array<{ name: string; obj: Record<string, unknown>; isIaC: boolean }> = [];

  // Core language patterns
  const corePatterns: Array<[string, Record<string, unknown>]> = [
    ["ENV_ACCESS", LP.ENV_ACCESS],
    ["HARDCODED_ENV", LP.HARDCODED_ENV],
    ["FUNCTION_DEF", LP.FUNCTION_DEF],
    ["TRY_CATCH", LP.TRY_CATCH],
    ["EMPTY_CATCH", LP.EMPTY_CATCH],
    ["GENERIC_CATCH", LP.GENERIC_CATCH],
    ["PANIC_UNWRAP", LP.PANIC_UNWRAP],
    ["WEAK_TYPE", LP.WEAK_TYPE],
    ["ASYNC_FUNCTION", LP.ASYNC_FUNCTION],
    ["MISSING_AWAIT", LP.MISSING_AWAIT],
    ["SHARED_MUTABLE", LP.SHARED_MUTABLE],
    ["WILDCARD_IMPORT", LP.WILDCARD_IMPORT],
    ["DEPRECATED_IMPORT", LP.DEPRECATED_IMPORT],
    ["SQL_INJECTION", LP.SQL_INJECTION],
    ["COMMAND_INJECTION", LP.COMMAND_INJECTION],
    ["HARDCODED_PASSWORD", LP.HARDCODED_PASSWORD],
    ["HARDCODED_API_KEY", LP.HARDCODED_API_KEY],
    ["HARDCODED_SECRET", LP.HARDCODED_SECRET],
    ["WEAK_HASH", LP.WEAK_HASH],
    ["EVAL_USAGE", LP.EVAL_USAGE],
    ["TLS_DISABLED", LP.TLS_DISABLED],
    ["CORS_WILDCARD", LP.CORS_WILDCARD],
    ["HTTP_ROUTE", LP.HTTP_ROUTE],
    ["CONSOLE_LOG", LP.CONSOLE_LOG],
    ["STRUCTURED_LOG", LP.STRUCTURED_LOG],
    ["TEST_FUNCTION", LP.TEST_FUNCTION],
    ["ASSERTION", LP.ASSERTION],
    ["DOC_COMMENT", LP.DOC_COMMENT],
    ["FOR_LOOP", LP.FOR_LOOP],
    ["CLASS_DEF", LP.CLASS_DEF],
    ["INPUT_VALIDATION", LP.INPUT_VALIDATION],
    ["MUTEX", LP.MUTEX],
    ["DB_QUERY", LP.DB_QUERY],
    ["HTTP_CLIENT", LP.HTTP_CLIENT],
    ["MAGIC_NUMBER", LP.MAGIC_NUMBER],
    ["TODO_FIXME", LP.TODO_FIXME],
    ["LINTER_DISABLE", LP.LINTER_DISABLE],
    ["UNSAFE_DESERIALIZATION", LP.UNSAFE_DESERIALIZATION],
    ["RESOURCE_LEAK", LP.RESOURCE_LEAK],
    ["DEPRECATED_API", LP.DEPRECATED_API],
  ];
  for (const [name, obj] of corePatterns) {
    catalogue.push({ name, obj, isIaC: false });
  }

  // IaC patterns
  const iacPatterns: Array<[string, Record<string, unknown>]> = [
    ["IAC_RESOURCE_DEF", LP.IAC_RESOURCE_DEF],
    ["IAC_HARDCODED_SECRET", LP.IAC_HARDCODED_SECRET],
    ["IAC_MISSING_ENCRYPTION", LP.IAC_MISSING_ENCRYPTION],
    ["IAC_PUBLIC_ACCESS", LP.IAC_PUBLIC_ACCESS],
    ["IAC_OPEN_NETWORK", LP.IAC_OPEN_NETWORK],
    ["IAC_OVERPERMISSIVE_IAM", LP.IAC_OVERPERMISSIVE_IAM],
    ["IAC_MISSING_HTTPS", LP.IAC_MISSING_HTTPS],
    ["IAC_MISSING_LOGGING", LP.IAC_MISSING_LOGGING],
    ["IAC_MISSING_TAGS_CHECK", LP.IAC_MISSING_TAGS_CHECK],
    ["IAC_HARDCODED_LOCATION", LP.IAC_HARDCODED_LOCATION],
    ["IAC_INSECURE_DEFAULT", LP.IAC_INSECURE_DEFAULT],
    ["IAC_MISSING_BACKUP", LP.IAC_MISSING_BACKUP],
  ];
  for (const [name, obj] of iacPatterns) {
    catalogue.push({ name, obj, isIaC: true });
  }

  return catalogue;
}

// ─── Parity Analysis ───────────────────────────────────────────────────────

export function analyzePatternParity(filterLang?: LangFamily): ParityReport {
  const catalogue = getPatternCatalogue();
  const patterns: PatternEntry[] = [];
  const langCounters: Record<string, { covered: number; total: number }> = {};

  for (const { name, obj, isIaC } of catalogue) {
    const targetLangs = isIaC ? IAC_LANGUAGES : CORE_LANGUAGES;
    const keys = Object.keys(obj);

    // Resolve "jsts" shorthand to javascript + typescript
    const covered = new Set<LangFamily>();
    for (const key of keys) {
      if (key === "jsts") {
        covered.add("javascript");
        covered.add("typescript");
      } else {
        covered.add(key as LangFamily);
      }
    }

    const presentLangs = targetLangs.filter((l) => covered.has(l));
    const missingLangs = targetLangs.filter((l) => !covered.has(l));
    const coverage = presentLangs.length / targetLangs.length;

    patterns.push({
      name,
      languages: presentLangs,
      missingLanguages: missingLangs,
      coverage,
    });

    for (const lang of targetLangs) {
      if (!langCounters[lang]) langCounters[lang] = { covered: 0, total: 0 };
      langCounters[lang].total++;
      if (covered.has(lang)) langCounters[lang].covered++;
    }
  }

  // Build per-language summaries
  const languageCoverage: ParityReport["languageCoverage"] = {};
  for (const [lang, c] of Object.entries(langCounters)) {
    if (filterLang && lang !== filterLang) continue;
    languageCoverage[lang] = {
      covered: c.covered,
      total: c.total,
      pct: Math.round((c.covered / c.total) * 100),
    };
  }

  const totalPairs = patterns.reduce((s, p) => s + p.languages.length, 0);
  const maxPairs = patterns.reduce((s, p) => s + p.languages.length + p.missingLanguages.length, 0);
  const overallCoverage = maxPairs > 0 ? Math.round((totalPairs / maxPairs) * 100) : 100;

  // Sort: least coverage first
  patterns.sort((a, b) => a.coverage - b.coverage);

  return { patterns, languageCoverage, overallCoverage };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatParityText(report: ParityReport): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║        Judges Panel — Language Parity Audit                 ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Overall coverage: ${report.overallCoverage}%`);
  lines.push("");

  // Per-language coverage
  lines.push("  Language Coverage:");
  lines.push("  " + "─".repeat(50));
  const langEntries = Object.entries(report.languageCoverage).sort((a, b) => a[1].pct - b[1].pct);
  for (const [lang, c] of langEntries) {
    const bar = "█".repeat(Math.round(c.pct / 5)) + "░".repeat(20 - Math.round(c.pct / 5));
    lines.push(`  ${lang.padEnd(14)} ${bar} ${String(c.pct).padStart(3)}% (${c.covered}/${c.total})`);
  }

  // Gaps list (patterns with < 100% coverage)
  const gaps = report.patterns.filter((p) => p.coverage < 1);
  if (gaps.length > 0) {
    lines.push("");
    lines.push("  Patterns with missing language support:");
    lines.push("  " + "─".repeat(50));
    for (const g of gaps) {
      const pct = Math.round(g.coverage * 100);
      lines.push(`  ${g.name.padEnd(28)} ${String(pct).padStart(3)}%  missing: ${g.missingLanguages.join(", ")}`);
    }
  } else {
    lines.push("");
    lines.push("  ✅ All patterns have full language coverage!");
  }

  lines.push("");
  return lines.join("\n");
}

// ─── CLI Command ────────────────────────────────────────────────────────────

export function runParity(argv: string[]): void {
  let format = "text";
  let filterLang: LangFamily | undefined;

  for (let i = 3; i < argv.length; i++) {
    switch (argv[i]) {
      case "--json":
        format = "json";
        break;
      case "--lang":
      case "-l":
        filterLang = (argv[++i] || "unknown") as LangFamily;
        break;
    }
  }

  const report = analyzePatternParity(filterLang);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatParityText(report));
  }
}
