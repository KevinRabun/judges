/**
 * Diff-explain — Explain why specific diff changes were flagged.
 */

import { readFileSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiffExplanation {
  finding: { ruleId: string; severity: string; title: string };
  context: string;
  explanation: string;
  risk: string;
  suggestedAction: string;
}

// ─── Knowledge base for common rules ────────────────────────────────────────

const RULE_EXPLANATIONS: Record<string, { risk: string; whyFlagged: string; action: string }> = {
  "sql-injection": {
    risk: "Attacker can manipulate database queries to extract, modify, or delete data",
    whyFlagged: "User input is concatenated into SQL queries without parameterization",
    action: "Use parameterized queries or prepared statements instead of string concatenation",
  },
  "xss-vulnerability": {
    risk: "Attacker can inject malicious scripts that execute in other users' browsers",
    whyFlagged: "User-supplied data is rendered in HTML without proper escaping",
    action: "Sanitize and escape all user input before rendering in HTML context",
  },
  "hardcoded-secret": {
    risk: "Credentials exposed in source code can be harvested from version control",
    whyFlagged: "String patterns matching API keys, passwords, or tokens detected in code",
    action: "Move secrets to environment variables or a secrets manager",
  },
  "path-traversal": {
    risk: "Attacker can access files outside intended directories",
    whyFlagged: "File paths constructed from user input without validation",
    action: "Validate and normalize file paths, restrict to allowed directories",
  },
  "insecure-random": {
    risk: "Predictable random values weaken security mechanisms",
    whyFlagged: "Math.random() or similar used for security-sensitive operations",
    action: "Use crypto.getRandomValues() or crypto.randomBytes() for security",
  },
  "error-info-leak": {
    risk: "Internal error details can reveal system architecture to attackers",
    whyFlagged: "Error messages expose stack traces, file paths, or internal details",
    action: "Return generic error messages to users, log details server-side",
  },
  "missing-auth": {
    risk: "Unauthorized access to protected resources or operations",
    whyFlagged: "Endpoint or function lacks authentication/authorization checks",
    action: "Add authentication middleware and verify user permissions",
  },
  "unsafe-deserialization": {
    risk: "Attacker can execute arbitrary code via crafted serialized data",
    whyFlagged: "Deserialization of untrusted data detected",
    action: "Validate and whitelist types before deserialization, use safe formats like JSON",
  },
};

// ─── Explanation engine ─────────────────────────────────────────────────────

function explainFinding(finding: Finding): DiffExplanation {
  const ruleId = finding.ruleId || "unknown";
  const known = RULE_EXPLANATIONS[ruleId];

  const explanation = known
    ? known.whyFlagged
    : `This code was flagged by the '${ruleId}' rule. ${finding.description || "Review the identified pattern for potential issues."}`;

  const risk = known
    ? known.risk
    : `Potential ${finding.severity || "medium"}-severity issue that may affect code quality or security.`;

  const action = known
    ? known.action
    : finding.recommendation || "Review and address the finding according to best practices.";

  return {
    finding: { ruleId, severity: finding.severity || "medium", title: finding.title },
    context: finding.description || "",
    explanation,
    risk,
    suggestedAction: action,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDiffExplain(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges diff-explain — Explain why changes were flagged

Usage:
  judges diff-explain --input verdict.json
  judges diff-explain --input verdict.json --rule sql-injection
  judges diff-explain --input verdict.json --severity critical
  judges diff-explain --format json

Options:
  --input <file>       TribunalVerdict JSON file (required)
  --rule <id>          Explain only findings for a specific rule
  --severity <level>   Filter by severity: critical, high, medium, low
  --limit <n>          Maximum findings to explain (default: 20)
  --format json        JSON output
  --help, -h           Show this help

Provides plain-language explanations of why code was flagged,
what the risk is, and what action to take. Useful for developers
unfamiliar with specific security or quality patterns.
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

  if (ruleFilter) {
    findings = findings.filter((f) => f.ruleId === ruleFilter);
  }
  if (sevFilter) {
    findings = findings.filter((f) => f.severity === sevFilter);
  }

  findings = findings.slice(0, limit);

  if (findings.length === 0) {
    console.log("No findings to explain.");
    return;
  }

  const explanations = findings.map(explainFinding);

  if (format === "json") {
    console.log(JSON.stringify({ count: explanations.length, explanations }, null, 2));
    return;
  }

  console.log(`\n  Diff Explanations (${explanations.length} finding(s))\n  ─────────────────────────────`);

  for (const exp of explanations) {
    const sevIcon: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" };
    const icon = sevIcon[exp.finding.severity] || "⬜";

    console.log(`\n    ${icon} [${exp.finding.severity}] ${exp.finding.ruleId}: ${exp.finding.title}`);
    console.log(`    Why flagged: ${exp.explanation}`);
    console.log(`    Risk: ${exp.risk}`);
    console.log(`    Action: ${exp.suggestedAction}`);
  }

  console.log();
}
