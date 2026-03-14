/**
 * Fix-suggest — Generate concrete code fix suggestions for findings.
 */

import { readFileSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FixSuggestion {
  ruleId: string;
  severity: string;
  title: string;
  problem: string;
  fixDescription: string;
  beforePattern: string;
  afterPattern: string;
  confidence: string;
  references: string[];
}

// ─── Fix patterns database ──────────────────────────────────────────────────

const FIX_PATTERNS: Record<
  string,
  { problem: string; fixDesc: string; before: string; after: string; refs: string[] }
> = {
  "sql-injection": {
    problem: "User input concatenated directly into SQL query string",
    fixDesc: "Use parameterized queries with placeholders",
    before: "db.query(`SELECT * FROM users WHERE id = ${userId}`)",
    after: 'db.query("SELECT * FROM users WHERE id = ?", [userId])',
    refs: ["https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html"],
  },
  "xss-vulnerability": {
    problem: "User-supplied data rendered without escaping",
    fixDesc: "Sanitize output using context-appropriate encoding",
    before: "element.innerHTML = userInput;",
    after: "element.textContent = userInput;",
    refs: ["https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html"],
  },
  "hardcoded-secret": {
    problem: "Secret value hardcoded in source file",
    fixDesc: "Move secret to environment variable or secrets manager",
    before: 'const API_KEY = "sk-abc123...";',
    after: "const API_KEY = process.env.API_KEY;",
    refs: ["https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html"],
  },
  "path-traversal": {
    problem: "File path constructed from user input without validation",
    fixDesc: "Normalize path and validate it stays within allowed directory",
    before: "const file = path.join(uploadDir, req.params.filename);",
    after: "const file = path.join(uploadDir, path.basename(req.params.filename));",
    refs: ["https://owasp.org/www-community/attacks/Path_Traversal"],
  },
  "insecure-random": {
    problem: "Math.random() used for security-sensitive value",
    fixDesc: "Use cryptographically secure random number generator",
    before: "const token = Math.random().toString(36);",
    after: 'const token = crypto.randomBytes(32).toString("hex");',
    refs: ["CWE-338: Use of Cryptographically Weak PRNG"],
  },
  "missing-auth": {
    problem: "Endpoint lacks authentication check",
    fixDesc: "Add authentication middleware before handler",
    before: "app.get('/api/data', handler);",
    after: "app.get('/api/data', authMiddleware, handler);",
    refs: ["https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html"],
  },
  "error-info-leak": {
    problem: "Detailed error information sent to client",
    fixDesc: "Return generic error response, log details server-side",
    before: "res.status(500).json({ error: err.stack });",
    after: 'res.status(500).json({ error: "Internal server error" });',
    refs: ["https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html"],
  },
  "unsafe-deserialization": {
    problem: "Deserialization of untrusted data",
    fixDesc: "Validate input format and use safe deserialization",
    before: "const obj = eval('(' + input + ')');",
    after: "const obj = JSON.parse(input);",
    refs: ["https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html"],
  },
};

// ─── Suggestion engine ─────────────────────────────────────────────────────

function suggestFix(finding: Finding): FixSuggestion {
  const ruleId = finding.ruleId || "unknown";
  const known = FIX_PATTERNS[ruleId];

  if (known) {
    return {
      ruleId,
      severity: finding.severity || "medium",
      title: finding.title,
      problem: known.problem,
      fixDescription: known.fixDesc,
      beforePattern: known.before,
      afterPattern: known.after,
      confidence: "high",
      references: known.refs,
    };
  }

  // Generate generic suggestion from finding data
  return {
    ruleId,
    severity: finding.severity || "medium",
    title: finding.title,
    problem: finding.description || "Code pattern flagged for review",
    fixDescription: finding.recommendation || "Apply the recommended fix pattern",
    beforePattern: "",
    afterPattern: "",
    confidence: "medium",
    references: [],
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFixSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges fix-suggest — Generate concrete fix suggestions

Usage:
  judges fix-suggest --input verdict.json
  judges fix-suggest --input verdict.json --rule sql-injection
  judges fix-suggest --input verdict.json --severity critical
  judges fix-suggest --format json

Options:
  --input <file>       TribunalVerdict JSON file (required)
  --rule <id>          Suggest fixes only for a specific rule
  --severity <level>   Filter by severity
  --limit <n>          Maximum suggestions (default: 20)
  --format json        JSON output
  --help, -h           Show this help

Generates concrete before/after code patterns for each finding,
with links to OWASP/CWE references where applicable.
`);
    return;
  }

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const ruleFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  const sevFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");
  const limitStr = argv.find((_a: string, i: number) => argv[i - 1] === "--limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 20;
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!inputPath) {
    console.error("Error: --input is required. Provide a verdict JSON file.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(inputPath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Cannot read or parse ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  let findings = verdict.findings || [];
  if (ruleFilter) findings = findings.filter((f) => f.ruleId === ruleFilter);
  if (sevFilter) findings = findings.filter((f) => f.severity === sevFilter);
  findings = findings.slice(0, limit);

  if (findings.length === 0) {
    console.log("No findings to suggest fixes for.");
    return;
  }

  const suggestions = findings.map(suggestFix);

  if (format === "json") {
    console.log(JSON.stringify({ count: suggestions.length, suggestions }, null, 2));
    return;
  }

  console.log(`\n  Fix Suggestions (${suggestions.length})\n  ─────────────────────────────`);

  for (const s of suggestions) {
    const sevIcon: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" };
    const icon = sevIcon[s.severity] || "⬜";

    console.log(`\n    ${icon} [${s.severity}] ${s.ruleId}: ${s.title}`);
    console.log(`    Problem: ${s.problem}`);
    console.log(`    Fix: ${s.fixDescription}`);
    if (s.beforePattern) {
      console.log(`    Before: ${s.beforePattern}`);
      console.log(`    After:  ${s.afterPattern}`);
    }
    console.log(`    Confidence: ${s.confidence}`);
    if (s.references.length > 0) {
      console.log(`    References: ${s.references.join(", ")}`);
    }
  }

  console.log();
}
