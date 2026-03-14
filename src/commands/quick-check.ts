/**
 * Quick-check — sub-100ms pattern-only review for real-time save-on-type feedback.
 */

import { readFileSync, statSync } from "fs";
import { extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuickFinding {
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  rule: string;
  message: string;
}

interface QuickResult {
  file: string;
  findings: QuickFinding[];
  score: number;
  elapsedMs: number;
}

// ─── Pattern definitions ────────────────────────────────────────────────────

interface PatternDef {
  regex: RegExp;
  rule: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
}

const PATTERNS: PatternDef[] = [
  // Critical
  { regex: /\beval\s*\(/, rule: "QC-INJECT-01", severity: "critical", message: "eval() usage — code injection risk" },
  {
    regex: /(?:password|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{4,}['"]/,
    rule: "QC-SECRET-01",
    severity: "critical",
    message: "Hardcoded credential detected",
  },
  { regex: /\.innerHTML\s*=/, rule: "QC-XSS-01", severity: "critical", message: "innerHTML assignment — XSS risk" },
  {
    regex: /new\s+Function\s*\(/,
    rule: "QC-INJECT-02",
    severity: "critical",
    message: "new Function() — code injection risk",
  },

  // High
  {
    regex: /new\s+Buffer\s*\(/,
    rule: "QC-DEPR-01",
    severity: "high",
    message: "Deprecated new Buffer() — use Buffer.from()",
  },
  {
    regex: /(?:setTimeout|setInterval)\s*\(\s*['"]/,
    rule: "QC-INJECT-03",
    severity: "high",
    message: "String passed to timer — implicit eval",
  },
  {
    regex: /process\.exit\s*\(\s*\)/,
    rule: "QC-RELIAB-01",
    severity: "high",
    message: "Unconditional process.exit() — may crash graceful shutdown",
  },
  {
    regex: /document\.write\s*\(/,
    rule: "QC-XSS-02",
    severity: "high",
    message: "document.write() — XSS and DOM clobbering risk",
  },

  // Medium
  {
    regex: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
    rule: "QC-ERR-01",
    severity: "medium",
    message: "Empty catch block — errors silently swallowed",
  },
  { regex: /debugger\b/, rule: "QC-DEV-01", severity: "medium", message: "Debugger statement left in code" },
  { regex: /console\.log\s*\(/, rule: "QC-DEV-02", severity: "medium", message: "console.log() in production code" },
  {
    regex: /\/\/\s*TODO\b|\/\/\s*FIXME\b|\/\/\s*HACK\b|\/\/\s*XXX\b/,
    rule: "QC-DEBT-01",
    severity: "medium",
    message: "Open TODO/FIXME comment",
  },
  {
    regex: /\.then\s*\([^)]*\)\s*;?\s*$/,
    rule: "QC-ASYNC-01",
    severity: "medium",
    message: "Unhandled promise — missing .catch()",
  },

  // Low
  { regex: /\bvar\s+\w+\s*=/, rule: "QC-MODERN-01", severity: "low", message: "var declaration — use const or let" },
  {
    regex: /\.substr\s*\(/,
    rule: "QC-DEPR-02",
    severity: "low",
    message: "Deprecated .substr() — use .substring() or .slice()",
  },
  {
    regex: /==\s*null\b|!=\s*null\b/,
    rule: "QC-TYPE-01",
    severity: "low",
    message: "Loose null comparison — use === null",
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function quickScan(filepath: string, content?: string): QuickResult {
  const start = performance.now();
  const code = content || readFileSync(filepath, "utf-8");
  const lines = code.split("\n");
  const findings: QuickFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          line: i + 1,
          severity: pattern.severity,
          rule: pattern.rule,
          message: pattern.message,
        });
      }
    }
  }

  const critCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;
  const score = Math.max(
    0,
    100 - critCount * 20 - highCount * 10 - medCount * 4 - findings.filter((f) => f.severity === "low").length,
  );

  return {
    file: filepath,
    findings,
    score,
    elapsedMs: Math.round((performance.now() - start) * 100) / 100,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runQuickCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges quick-check — Sub-100ms pattern-only review for real-time feedback

Usage:
  judges quick-check <file>
  judges quick-check src/app.ts --format json

Options:
  <file>                File to check (required)
  --format json         JSON output (for IDE integration)
  --help, -h            Show this help

Designed for save-on-type IDE integration. Runs only cheap regex/pattern
checks with no LLM calls. Use 'judges review' for deep analysis.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const file = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0 && argv[argv.indexOf(a) - 1] !== "--format");

  if (!file) {
    console.error("Error: File path required. Usage: judges quick-check <file>");
    process.exitCode = 1;
    return;
  }

  try {
    statSync(file);
  } catch {
    console.error(`Error: File not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const ext = extname(file);
  if (![".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".cs", ".rs", ".rb"].includes(ext)) {
    console.error(`Warning: Language '${ext}' may have limited coverage.`);
  }

  const result = quickScan(file);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const icon = result.score >= 80 ? "✅" : result.score >= 50 ? "⚠️ " : "❌";
    console.log(
      `\n  Quick Check: ${icon} ${result.score}/100 (${result.elapsedMs}ms)\n  ─────────────────────────────`,
    );
    if (result.findings.length === 0) {
      console.log("    No issues found.\n");
      return;
    }
    for (const f of result.findings) {
      const sev =
        f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${sev} L${f.line} [${f.rule}] ${f.message}`);
    }
    console.log(`\n    ${result.findings.length} finding(s) in ${result.elapsedMs}ms\n`);
  }
}
