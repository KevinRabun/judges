/**
 * Detailed finding explanation — provide rich context, references,
 * and remediation guidance for individual findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Knowledge base ─────────────────────────────────────────────────────────

const EXPLANATIONS: Record<
  string,
  { category: string; whyItMatters: string; commonCauses: string[]; remediationSteps: string[]; references: string[] }
> = {
  SEC: {
    category: "Security",
    whyItMatters: "Security vulnerabilities can lead to data breaches, unauthorized access, and compliance violations.",
    commonCauses: [
      "Insufficient input validation",
      "Missing authentication checks",
      "Hardcoded credentials",
      "Insecure deserialization",
    ],
    remediationSteps: [
      "Validate all user input",
      "Use parameterized queries",
      "Implement proper authentication",
      "Follow principle of least privilege",
    ],
    references: ["OWASP Top 10: https://owasp.org/www-project-top-ten/", "CWE: https://cwe.mitre.org/"],
  },
  AUTH: {
    category: "Authentication",
    whyItMatters: "Authentication flaws allow attackers to impersonate legitimate users or bypass access controls.",
    commonCauses: ["Weak password policies", "Missing MFA", "Session fixation", "Token leakage"],
    remediationSteps: [
      "Implement multi-factor authentication",
      "Use secure session management",
      "Hash passwords with bcrypt/argon2",
      "Set proper token expiry",
    ],
    references: [
      "OWASP Authentication: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
    ],
  },
  CRYPTO: {
    category: "Cryptography",
    whyItMatters: "Weak cryptography exposes sensitive data and undermines data protection guarantees.",
    commonCauses: [
      "Using deprecated algorithms (MD5, SHA1)",
      "Hardcoded keys",
      "Insufficient key length",
      "Missing encryption at rest",
    ],
    remediationSteps: [
      "Use AES-256 for symmetric encryption",
      "Use RSA-2048+ or ECDSA for asymmetric",
      "Rotate keys regularly",
      "Use proper random number generators",
    ],
    references: ["NIST Crypto Guidelines: https://csrc.nist.gov/"],
  },
  INJECT: {
    category: "Injection",
    whyItMatters: "Injection attacks can execute arbitrary code, access/modify data, or take control of systems.",
    commonCauses: [
      "String concatenation in queries",
      "Unsanitized template rendering",
      "eval() usage",
      "Command injection via user input",
    ],
    remediationSteps: [
      "Use parameterized queries/prepared statements",
      "Sanitize HTML output",
      "Avoid eval/exec",
      "Use allowlists for command arguments",
    ],
    references: ["CWE-89 SQL Injection: https://cwe.mitre.org/data/definitions/89.html"],
  },
  PERF: {
    category: "Performance",
    whyItMatters: "Performance issues degrade user experience, increase costs, and can lead to denial-of-service.",
    commonCauses: ["N+1 queries", "Missing indexes", "Unbounded loops", "Memory leaks", "Synchronous blocking"],
    remediationSteps: [
      "Profile and benchmark",
      "Add database indexes",
      "Use pagination",
      "Implement caching",
      "Use async patterns",
    ],
    references: [],
  },
  ERR: {
    category: "Error Handling",
    whyItMatters: "Poor error handling causes crashes, data loss, and can leak sensitive information.",
    commonCauses: [
      "Empty catch blocks",
      "Missing error boundaries",
      "Information leakage in error messages",
      "Unchecked return values",
    ],
    remediationSteps: [
      "Log errors with context",
      "Return safe error messages to users",
      "Implement error boundaries",
      "Handle all error cases",
    ],
    references: [],
  },
};

// ─── Core ───────────────────────────────────────────────────────────────────

function getRulePrefix(ruleId: string): string {
  const match = ruleId.match(/^([A-Z]+)/);
  return match ? match[1] : "";
}

export function explainFinding(finding: Finding): string {
  const prefix = getRulePrefix(finding.ruleId);
  const info = EXPLANATIONS[prefix];

  const lines: string[] = [];
  lines.push(`# Finding: ${finding.ruleId}`);
  lines.push(`**${finding.title}**\n`);
  lines.push(`## Description`);
  lines.push(finding.description);
  lines.push("");
  lines.push(`## Severity: ${finding.severity.toUpperCase()}`);
  if (finding.confidence !== undefined) {
    lines.push(`## Confidence: ${(finding.confidence * 100).toFixed(0)}%`);
  }
  lines.push("");

  lines.push(`## Recommendation`);
  lines.push(finding.recommendation);
  lines.push("");

  if (finding.patch) {
    lines.push(`## Suggested Patch`);
    lines.push("```");
    lines.push(String(finding.patch));
    lines.push("```");
    lines.push("");
  }

  if (finding.reference) {
    lines.push(`## Reference`);
    lines.push(finding.reference);
    lines.push("");
  }

  if (info) {
    lines.push(`## Category: ${info.category}`);
    lines.push("");
    lines.push(`### Why It Matters`);
    lines.push(info.whyItMatters);
    lines.push("");
    lines.push(`### Common Causes`);
    for (const cause of info.commonCauses) {
      lines.push(`- ${cause}`);
    }
    lines.push("");
    lines.push(`### Remediation Steps`);
    for (const step of info.remediationSteps) {
      lines.push(`1. ${step}`);
    }
    lines.push("");
    if (info.references.length > 0) {
      lines.push(`### Further Reading`);
      for (const ref of info.references) {
        lines.push(`- ${ref}`);
      }
      lines.push("");
    }
  }

  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    lines.push(`## Location`);
    lines.push(`Lines: ${finding.lineNumbers.join(", ")}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runExplainFinding(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges explain-finding — Detailed finding explanation with context

Usage:
  judges explain-finding --rule SEC001 --title "SQL Injection" --severity critical
  judges explain-finding --from-results --index 0
  judges explain-finding --category SEC

Options:
  --rule <id>            Rule ID
  --title <text>         Finding title
  --severity <level>     Finding severity
  --description <text>   Finding description
  --from-results         Load finding from .judges-results.json
  --index <n>            Finding index (0-based)
  --category <prefix>    Explain a category (SEC, AUTH, CRYPTO, etc.)
  --output <file>        Write explanation to file
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Explain category
  const category = argv.find((_a: string, i: number) => argv[i - 1] === "--category");
  if (category) {
    const info = EXPLANATIONS[category.toUpperCase()];
    if (!info) {
      console.error(`  ❌ Unknown category: ${category}. Known: ${Object.keys(EXPLANATIONS).join(", ")}`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(`\n  Category: ${info.category}`);
      console.log(`  ──────────────────────`);
      console.log(`  ${info.whyItMatters}\n`);
      console.log(`  Common causes:`);
      for (const c of info.commonCauses) console.log(`    • ${c}`);
      console.log(`\n  Remediation:`);
      for (const s of info.remediationSteps) console.log(`    1. ${s}`);
      if (info.references.length > 0) {
        console.log(`\n  References:`);
        for (const r of info.references) console.log(`    ${r}`);
      }
      console.log("");
    }
    return;
  }

  // From results file
  if (argv.includes("--from-results")) {
    const resultsFile = ".judges-results.json";
    if (!existsSync(resultsFile)) {
      console.error("  ❌ No .judges-results.json found.");
      return;
    }
    const data = JSON.parse(readFileSync(resultsFile, "utf-8"));
    const findings: Finding[] = Array.isArray(data) ? data : data.findings || [];

    const idxStr = argv.find((_a: string, i: number) => argv[i - 1] === "--index");
    const idx = idxStr ? parseInt(idxStr, 10) : 0;

    if (idx < 0 || idx >= findings.length) {
      console.error(`  ❌ Index ${idx} out of range (0–${findings.length - 1})`);
      return;
    }

    const explanation = explainFinding(findings[idx]);
    const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
    if (outputFile) {
      const { writeFileSync: wfs } = require("fs");
      wfs(outputFile, explanation);
      console.log(`  ✅ Explanation written to ${outputFile}`);
    } else {
      console.log(explanation);
    }
    return;
  }

  // Manual finding
  const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title");
  const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "medium";
  const description = argv.find((_a: string, i: number) => argv[i - 1] === "--description") || "";

  if (!ruleId) {
    console.error("  ❌ Provide --rule or --from-results. Use --help for usage.");
    return;
  }

  const finding: Finding = {
    ruleId,
    title: title || ruleId,
    severity: severity as Finding["severity"],
    description: description || `Finding for rule ${ruleId}`,
    recommendation: `Review and remediate ${ruleId} findings`,
  };

  const explanation = explainFinding(finding);
  const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
  if (outputFile) {
    const { writeFileSync: wfs } = require("fs");
    wfs(outputFile, explanation);
    console.log(`  ✅ Explanation written to ${outputFile}`);
  } else {
    console.log(explanation);
  }
}
