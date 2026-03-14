/**
 * Finding-auto-fix — Auto-generate fix suggestions for common finding patterns.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AutoFix {
  ruleId: string;
  title: string;
  severity: string;
  fixAvailable: boolean;
  fixDescription: string;
  fixSnippet: string;
  confidence: "high" | "medium" | "low";
}

interface AutoFixReport {
  timestamp: string;
  totalFindings: number;
  fixableCount: number;
  fixes: AutoFix[];
}

// ─── Fix Patterns ───────────────────────────────────────────────────────────

const FIX_PATTERNS: { match: RegExp; description: string; snippet: string; confidence: "high" | "medium" | "low" }[] = [
  {
    match: /sql.?inject/i,
    description: "Use parameterized queries instead of string concatenation",
    snippet:
      "// Before: db.query(`SELECT * FROM users WHERE id = ${id}`)\n// After:  db.query('SELECT * FROM users WHERE id = ?', [id])",
    confidence: "high",
  },
  {
    match: /xss|cross.?site/i,
    description: "Sanitize user input before rendering in HTML",
    snippet:
      "// Use a sanitization library or framework escaping\n// e.g., DOMPurify.sanitize(userInput) or template auto-escaping",
    confidence: "high",
  },
  {
    match: /hardcoded.?(secret|password|key|token|credential)/i,
    description: "Move secrets to environment variables or a secret manager",
    snippet: "// Before: const apiKey = 'sk-abc123'\n// After:  const apiKey = process.env.API_KEY",
    confidence: "high",
  },
  {
    match: /eval|code.?inject/i,
    description: "Avoid eval() and dynamic code execution",
    snippet: "// Before: eval(userInput)\n// After:  Use a safe parser or mapped function calls",
    confidence: "high",
  },
  {
    match: /path.?traversal/i,
    description: "Validate and sanitize file paths",
    snippet:
      "// Use path.resolve() and check against allowed base directory\n// const safePath = path.resolve(baseDir, userPath)\n// if (!safePath.startsWith(baseDir)) throw new Error('Invalid path')",
    confidence: "high",
  },
  {
    match: /insecure.?random/i,
    description: "Use cryptographically secure random number generation",
    snippet: "// Before: Math.random()\n// After:  crypto.randomBytes(32) or crypto.getRandomValues()",
    confidence: "high",
  },
  {
    match: /missing.?(auth|authorization)/i,
    description: "Add authentication/authorization checks",
    snippet:
      "// Add middleware or guard to verify user identity and permissions\n// e.g., if (!req.user || !req.user.hasPermission('resource')) return res.status(403)",
    confidence: "medium",
  },
  {
    match: /error.?handling|unhandled/i,
    description: "Add proper error handling with try/catch",
    snippet:
      "// Wrap in try/catch and handle errors appropriately\n// try { await riskyOperation() } catch (err) { logger.error(err); throw new AppError('...') }",
    confidence: "medium",
  },
  {
    match: /memory.?leak/i,
    description: "Clean up resources and remove event listeners",
    snippet:
      "// Ensure cleanup in finally blocks or useEffect return\n// listener references should be stored and removed on cleanup",
    confidence: "medium",
  },
  {
    match: /n[+]1|n\+1/i,
    description: "Batch database queries or use eager loading",
    snippet:
      "// Before: for (const id of ids) { await db.find(id) }\n// After:  await db.findMany({ where: { id: { in: ids } } })",
    confidence: "medium",
  },
];

function generateFix(finding: Finding): AutoFix {
  const ruleId = finding.ruleId || "unknown";
  const title = finding.title || "";
  const combined = `${ruleId} ${title} ${finding.description || ""}`;

  for (const pattern of FIX_PATTERNS) {
    if (pattern.match.test(combined)) {
      return {
        ruleId,
        title,
        severity: finding.severity || "medium",
        fixAvailable: true,
        fixDescription: pattern.description,
        fixSnippet: pattern.snippet,
        confidence: pattern.confidence,
      };
    }
  }

  // Use the finding's own recommendation if available
  if (finding.recommendation) {
    return {
      ruleId,
      title,
      severity: finding.severity || "medium",
      fixAvailable: true,
      fixDescription: finding.recommendation,
      fixSnippet: finding.suggestedFix || "",
      confidence: "low",
    };
  }

  return {
    ruleId,
    title,
    severity: finding.severity || "medium",
    fixAvailable: false,
    fixDescription: "No auto-fix available. Manual review recommended.",
    fixSnippet: "",
    confidence: "low",
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAutoFix(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-auto-fix — Auto-generate fix suggestions

Usage:
  judges finding-auto-fix --file report.json
  judges finding-auto-fix --file report.json --format json

Options:
  --file <path>         Path to a tribunal verdict JSON file
  --min-confidence <l>  Minimum confidence (high|medium|low, default: low)
  --format json         JSON output
  --help, -h            Show this help

Analyzes findings and generates fix suggestions for common patterns
including SQL injection, XSS, hardcoded secrets, and more.

Report saved to .judges/auto-fixes.json.
`);
    return;
  }

  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minConf = argv.find((_a: string, i: number) => argv[i - 1] === "--min-confidence") || "low";

  if (!filePath || !existsSync(filePath)) {
    console.error("Error: --file is required and must exist.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: Could not parse verdict file.");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  if (findings.length === 0) {
    console.log("No findings to fix.");
    return;
  }

  const confLevels = ["low", "medium", "high"];
  const minIdx = confLevels.indexOf(minConf);
  const fixes = findings.map(generateFix).filter((f) => confLevels.indexOf(f.confidence) >= minIdx);

  const fixableCount = fixes.filter((f) => f.fixAvailable).length;
  const report: AutoFixReport = {
    timestamp: new Date().toISOString(),
    totalFindings: fixes.length,
    fixableCount,
    fixes,
  };

  const outPath = join(".judges", "auto-fixes.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nAuto-Fix Suggestions:");
  console.log("═".repeat(70));
  console.log(
    `  Total findings: ${fixes.length}  Fixable: ${fixableCount}  (${fixes.length > 0 ? ((fixableCount / fixes.length) * 100).toFixed(0) : 0}%)`,
  );
  console.log("═".repeat(70));

  for (const f of fixes) {
    const icon = f.fixAvailable ? "✓" : "✗";
    console.log(`\n  ${icon} [${f.severity.toUpperCase()}] ${f.ruleId}`);
    console.log(`    ${f.title}`);
    console.log(`    Fix: ${f.fixDescription}`);
    if (f.fixSnippet) {
      console.log(`    Confidence: ${f.confidence}`);
      for (const line of f.fixSnippet.split("\n")) {
        console.log(`      ${line}`);
      }
    }
  }
  console.log("\n" + "═".repeat(70));
  console.log(`  Report saved to ${outPath}`);
}
