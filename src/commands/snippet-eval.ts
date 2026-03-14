/**
 * Snippet eval — evaluate a code snippet from stdin or a string
 * argument without needing a file, with instant formatted output.
 *
 * Zero-friction entry point for evaluating AI-generated code snippets.
 */

import { readFileSync } from "fs";

// ─── Lightweight Snippet Scanner ────────────────────────────────────────────

interface SnippetFinding {
  ruleId: string;
  title: string;
  severity: string;
  line: number;
  recommendation: string;
}

const SNIPPET_RULES: Array<{
  id: string;
  title: string;
  pattern: RegExp;
  severity: string;
  recommendation: string;
}> = [
  {
    id: "SNIP-001",
    title: "SQL injection risk",
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\+\s*\w|`\$\{.*(?:SELECT|INSERT|UPDATE|DELETE)/i,
    severity: "high",
    recommendation: "Use parameterized queries",
  },
  {
    id: "SNIP-002",
    title: "XSS vulnerability",
    pattern: /innerHTML|dangerouslySetInnerHTML|document\.write/i,
    severity: "high",
    recommendation: "Sanitize user input before DOM insertion",
  },
  {
    id: "SNIP-003",
    title: "Hardcoded secret",
    pattern: /(?:password|secret|api.?key|token)\s*[:=]\s*['"][^'"]{8,}/i,
    severity: "critical",
    recommendation: "Use environment variables or secrets manager",
  },
  {
    id: "SNIP-004",
    title: "eval() usage",
    pattern: /\beval\s*\(|new\s+Function\s*\(/i,
    severity: "high",
    recommendation: "Use safe expression parsers instead of eval",
  },
  {
    id: "SNIP-005",
    title: "Empty catch block",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    severity: "medium",
    recommendation: "Log the error or re-throw it",
  },
  {
    id: "SNIP-006",
    title: "Console.log in production code",
    pattern: /console\.(log|debug)\s*\(/,
    severity: "low",
    recommendation: "Use a proper logging framework",
  },
  {
    id: "SNIP-007",
    title: "Insecure HTTP",
    pattern: /['"]http:\/\/(?!localhost|127\.0\.0\.1)/i,
    severity: "medium",
    recommendation: "Use HTTPS for all external connections",
  },
  {
    id: "SNIP-008",
    title: "Weak crypto",
    pattern: /Math\.random\s*\(\)|createHash\s*\(\s*['"]md5['"]\)/i,
    severity: "high",
    recommendation: "Use crypto.randomUUID() or SHA-256+",
  },
  {
    id: "SNIP-009",
    title: "Command injection risk",
    pattern: /execSync\s*\(.*\+|spawn\s*\(.*\$\{/i,
    severity: "critical",
    recommendation: "Validate/sanitize inputs, use array args with spawn",
  },
  {
    id: "SNIP-010",
    title: "Permissive CORS",
    pattern: /cors\(\s*\)|Allow-Origin.*\*/i,
    severity: "medium",
    recommendation: "Specify allowed origins explicitly",
  },
  {
    id: "SNIP-011",
    title: "Missing error handling",
    pattern: /\.then\s*\([^)]*\)\s*(?!\.catch)/i,
    severity: "medium",
    recommendation: "Add .catch() or use async/await with try/catch",
  },
  {
    id: "SNIP-012",
    title: "SELECT * usage",
    pattern: /SELECT\s+\*\s+FROM/i,
    severity: "low",
    recommendation: "Select only needed columns",
  },
];

function scanSnippet(code: string, _lang: string): SnippetFinding[] {
  const findings: SnippetFinding[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const rule of SNIPPET_RULES) {
      if (rule.pattern.test(lines[i])) {
        if (!findings.some((f) => f.ruleId === rule.id && Math.abs(f.line - (i + 1)) < 3)) {
          findings.push({
            ruleId: rule.id,
            title: rule.title,
            severity: rule.severity,
            line: i + 1,
            recommendation: rule.recommendation,
          });
        }
      }
    }
  }

  return findings;
}

// ─── Language Detection ────────────────────────────────────────────────────

function detectLanguage(code: string): string {
  if (/\bimport\s+\{.*\}\s+from\s+['"]|:\s*(string|number|boolean|void)\b|interface\s+\w+/.test(code))
    return "typescript";
  if (/\bdef\s+\w+\s*\(|import\s+\w+\s*$|from\s+\w+\s+import/m.test(code)) return "python";
  if (/\bfunc\s+\w+\s*\(|package\s+\w+|:=\s*/.test(code)) return "go";
  if (/\bfn\s+\w+\s*\(|let\s+mut\s|impl\s+\w+/.test(code)) return "rust";
  if (/\bpublic\s+class\s|System\.out\.|@Override/.test(code)) return "java";
  if (/\bnamespace\s+\w+|using\s+System|public\s+async\s+Task/.test(code)) return "csharp";
  if (/\bfunction\s+\w+|const\s+\w+\s*=|require\s*\(/.test(code)) return "javascript";
  return "unknown";
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSnippetEval(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges snippet-eval — Evaluate code snippets instantly

Usage:
  echo "const key = '12345'" | judges snippet-eval
  judges snippet-eval --code "eval(userInput)"
  judges snippet-eval --code "SELECT * FROM users WHERE id=" --lang sql
  judges snippet-eval --demo

Options:
  --code <snippet>      Code snippet to evaluate (or pipe via stdin)
  --lang <language>     Language hint (auto-detected if omitted)
  --demo                Run with demo vulnerable code
  --format json         JSON output
  --help, -h            Show this help

Zero-friction evaluation — no project setup needed.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const codeArg = argv.find((_a: string, i: number) => argv[i - 1] === "--code") || "";
  const langArg = argv.find((_a: string, i: number) => argv[i - 1] === "--lang") || "";
  const isDemo = argv.includes("--demo");

  let code: string;

  if (isDemo) {
    code = `// AI-generated API handler
const query = "SELECT * FROM users WHERE id=" + req.params.id;
const apiKey = "sk-proj-1234567890abcdef1234567890";
document.innerHTML = userInput;
try { await riskyOperation(); } catch (e) {}
console.log("Debug: user token = " + token);
fetch("http://api.example.com/data");
const sessionId = Math.random().toString(36);`;
  } else if (codeArg) {
    code = codeArg;
  } else {
    // Try reading from stdin
    try {
      code = readFileSync(0, "utf-8");
    } catch {
      console.error("  Provide code via --code, --demo, or pipe to stdin");
      return;
    }
  }

  if (!code.trim()) {
    console.error("  No code provided");
    return;
  }

  const lang = langArg || detectLanguage(code);
  const findings = scanSnippet(code, lang);

  // Determine verdict
  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh = findings.some((f) => f.severity === "high");
  const verdict =
    hasCritical || findings.length > 5
      ? "FAIL"
      : hasHigh || findings.length > 2
        ? "WARN"
        : findings.length === 0
          ? "SAFE"
          : "WARN";

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          verdict,
          language: lang,
          findings,
          lines: code.split("\n").length,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = verdict === "SAFE" ? "✅ SAFE" : verdict === "WARN" ? "⚠️  WARN" : "❌ FAIL";
    console.log(
      `\n  Snippet Eval: ${badge}  (${lang}, ${code.split("\n").length} lines)\n  ──────────────────────────`,
    );

    if (findings.length === 0) {
      console.log("  No issues detected in snippet.");
    } else {
      for (const f of findings) {
        const icon =
          f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "⚪";
        console.log(`    ${icon} L${f.line} [${f.severity}] ${f.ruleId}: ${f.title}`);
        console.log(`        💡 ${f.recommendation}`);
      }
    }

    console.log(`\n    ${findings.length} finding(s) | Verdict: ${verdict}\n`);
  }
}
