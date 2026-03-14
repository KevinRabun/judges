/**
 * Review-explain — Generate plain-language explanation of review findings
 * for non-technical stakeholders.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimpleFinding {
  pattern: string;
  severity: string;
  file: string;
  line: number;
}

interface ExplainedFinding {
  pattern: string;
  severity: string;
  plainExplanation: string;
  businessImpact: string;
  recommendation: string;
}

interface ExplainResult {
  totalFindings: number;
  explanations: ExplainedFinding[];
  executiveSummary: string;
  riskLevel: string;
}

// ─── Plain-language explanations ───────────────────────────────────────────

const EXPLANATIONS: Record<string, { plain: string; impact: string; recommendation: string }> = {
  "hardcoded-secret": {
    plain: "A password or secret key is written directly in the code, visible to anyone who can see the source.",
    impact:
      "If code is shared or leaked, attackers can immediately access protected systems. This is a leading cause of data breaches.",
    recommendation:
      "Move secrets to environment variables or a secrets manager. Never commit credentials to version control.",
  },
  "eval-usage": {
    plain: "The code can execute arbitrary commands, potentially from untrusted input.",
    impact:
      "An attacker could inject malicious code that runs with full application permissions, leading to data theft or system compromise.",
    recommendation: "Replace with safer alternatives that don't allow arbitrary code execution.",
  },
  "sql-injection": {
    plain: "User input is being inserted directly into database queries without protection.",
    impact:
      "Attackers can manipulate queries to steal, modify, or delete data. SQL injection is consistently in the OWASP Top 10.",
    recommendation: "Use parameterized queries or an ORM that handles input sanitization automatically.",
  },
  "sql-concat": {
    plain: "Database queries are built by concatenating strings, which can allow injection attacks.",
    impact: "Similar to SQL injection — attackers can manipulate queries through crafted input.",
    recommendation: "Use parameterized queries instead of string concatenation.",
  },
  "xss-risk": {
    plain: "The code inserts content directly into web pages without sanitization.",
    impact: "Attackers can inject scripts that steal user credentials, redirect users, or deface the application.",
    recommendation: "Always sanitize user content before displaying it. Use framework-provided escaping functions.",
  },
  "command-injection": {
    plain: "The code runs system commands that include user-controllable data.",
    impact: "An attacker could execute arbitrary commands on the server, potentially taking full control.",
    recommendation: "Avoid passing user input to system commands. Use libraries with safe APIs instead.",
  },
  "empty-catch": {
    plain: "Errors are being silently ignored — the code catches errors but does nothing with them.",
    impact:
      "Issues go undetected in production, making debugging extremely difficult and potentially hiding security problems.",
    recommendation: "Log errors appropriately and handle them based on their severity.",
  },
  "any-type": {
    plain: "Code uses unsafe typing that bypasses compile-time safety checks.",
    impact: "Bugs that would normally be caught before deployment can slip through to production.",
    recommendation: "Use proper type definitions to catch errors during development rather than in production.",
  },
  "console-log": {
    plain: "Debug logging statements are present in production code.",
    impact: "Can leak sensitive information and create unnecessary noise in production logs.",
    recommendation: "Use a proper logging framework with configurable levels.",
  },
  "deprecated-api": {
    plain: "The code uses outdated functions that may be removed in future releases.",
    impact: "Future updates could break the application. Deprecated APIs may also have known security vulnerabilities.",
    recommendation: "Migrate to the recommended replacement APIs.",
  },
  "unsafe-regex": {
    plain: "A pattern matching expression is built from user input, which could be exploited.",
    impact: "Attackers can craft input that causes the application to hang or consume excessive resources.",
    recommendation: "Validate and escape user input before using it in pattern matching.",
  },
  "todo-fixme": {
    plain: "The code contains unfinished work markers that haven't been addressed.",
    impact: "Incomplete implementations may have missing validation, error handling, or security checks.",
    recommendation: "Track these in your project management tool and resolve before release.",
  },
};

// ─── Analysis ──────────────────────────────────────────────────────────────

function explainFindings(findings: SimpleFinding[]): ExplainResult {
  // Deduplicate by pattern
  const patternSet = new Map<string, { severity: string; count: number }>();
  for (const f of findings) {
    const existing = patternSet.get(f.pattern);
    if (existing) {
      existing.count++;
    } else {
      patternSet.set(f.pattern, { severity: f.severity, count: 1 });
    }
  }

  const explanations: ExplainedFinding[] = [];
  for (const [pattern, data] of patternSet) {
    const expl = EXPLANATIONS[pattern] || {
      plain: `Found ${data.count} instance(s) of '${pattern}' pattern.`,
      impact: "This finding may affect code quality or security depending on context.",
      recommendation: "Review each instance and address based on your team's standards.",
    };

    explanations.push({
      pattern,
      severity: data.severity,
      plainExplanation: expl.plain,
      businessImpact: expl.impact,
      recommendation: expl.recommendation,
    });
  }

  // Sort by severity
  const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  explanations.sort((a, b) => (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0));

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  let riskLevel = "Low";
  if (criticalCount > 0) riskLevel = "Critical";
  else if (highCount > 0) riskLevel = "High";
  else if (findings.length > 10) riskLevel = "Medium";

  let executiveSummary: string;
  if (findings.length === 0) {
    executiveSummary = "No issues were found in this review. The code appears to meet quality and security standards.";
  } else if (criticalCount > 0) {
    executiveSummary = `This review found ${criticalCount} critical security issue(s) that must be resolved before deployment. These issues could lead to data breaches or system compromise if exploited.`;
  } else if (highCount > 0) {
    executiveSummary = `This review found ${highCount} high-severity issue(s) that should be addressed promptly. While not immediately exploitable, they represent significant risk.`;
  } else {
    executiveSummary = `This review found ${findings.length} issue(s), none critical. These represent code quality improvements that will reduce technical debt.`;
  }

  return { totalFindings: findings.length, explanations, executiveSummary, riskLevel };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewExplain(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-explain — Plain-language explanation of review findings

Usage:
  judges review-explain --file findings.json    Explain findings from JSON
  judges review-explain --format json           JSON output

Options:
  --file <path>        Path to findings JSON (array or {findings: [...]})
  --format json        JSON output
  --help, -h           Show this help

Translates technical security and quality findings into plain language
that non-technical stakeholders can understand. Includes business impact
and actionable recommendations.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const findingsFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file");

  if (!findingsFile) {
    console.error("Error: --file <path> is required. Provide a JSON file with findings.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(findingsFile)) {
    console.error(`Error: File '${findingsFile}' not found.`);
    process.exitCode = 1;
    return;
  }

  let findings: SimpleFinding[];
  try {
    const raw = JSON.parse(readFileSync(findingsFile, "utf-8"));
    findings = Array.isArray(raw) ? raw : Array.isArray(raw.findings) ? raw.findings : [];
  } catch {
    console.error("Error: Cannot parse findings file.");
    process.exitCode = 1;
    return;
  }

  const result = explainFindings(findings);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Review Explanation\n  ─────────────────────────────`);
  console.log(`    Risk Level: ${result.riskLevel}`);
  console.log(`    Total Findings: ${result.totalFindings}\n`);
  console.log(`    Executive Summary:`);
  console.log(`    ${result.executiveSummary}`);

  if (result.explanations.length > 0) {
    console.log("\n    Detailed Findings:");
    for (const expl of result.explanations) {
      const icon =
        expl.severity === "critical"
          ? "🔴"
          : expl.severity === "high"
            ? "🟠"
            : expl.severity === "medium"
              ? "🟡"
              : "🔵";
      console.log(`\n      ${icon} ${expl.pattern} (${expl.severity})`);
      console.log(`         What: ${expl.plainExplanation}`);
      console.log(`         Impact: ${expl.businessImpact}`);
      console.log(`         Action: ${expl.recommendation}`);
    }
  }

  console.log();
}
