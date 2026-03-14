/**
 * Review-compliance-check — Check reviews against compliance frameworks.
 */

import { readFileSync, existsSync } from "fs";

// ─── Frameworks ─────────────────────────────────────────────────────────────

interface ComplianceRule {
  id: string;
  framework: string;
  description: string;
  rulePatterns: string[];
  severityFloor: string;
}

const FRAMEWORKS: Record<string, ComplianceRule[]> = {
  owasp: [
    {
      id: "OWASP-A01",
      framework: "OWASP",
      description: "Broken Access Control",
      rulePatterns: ["access", "auth", "permission", "ACL"],
      severityFloor: "high",
    },
    {
      id: "OWASP-A02",
      framework: "OWASP",
      description: "Cryptographic Failures",
      rulePatterns: ["crypto", "encrypt", "hash", "secret", "key"],
      severityFloor: "high",
    },
    {
      id: "OWASP-A03",
      framework: "OWASP",
      description: "Injection",
      rulePatterns: ["inject", "sql", "xss", "command", "ldap"],
      severityFloor: "critical",
    },
    {
      id: "OWASP-A04",
      framework: "OWASP",
      description: "Insecure Design",
      rulePatterns: ["design", "architecture", "pattern"],
      severityFloor: "medium",
    },
    {
      id: "OWASP-A05",
      framework: "OWASP",
      description: "Security Misconfiguration",
      rulePatterns: ["config", "default", "header", "cors"],
      severityFloor: "medium",
    },
    {
      id: "OWASP-A06",
      framework: "OWASP",
      description: "Vulnerable Components",
      rulePatterns: ["dependency", "package", "version", "cve"],
      severityFloor: "high",
    },
    {
      id: "OWASP-A07",
      framework: "OWASP",
      description: "Auth Failures",
      rulePatterns: ["login", "session", "token", "credential"],
      severityFloor: "high",
    },
    {
      id: "OWASP-A08",
      framework: "OWASP",
      description: "Integrity Failures",
      rulePatterns: ["integrity", "pipeline", "supply-chain"],
      severityFloor: "high",
    },
    {
      id: "OWASP-A09",
      framework: "OWASP",
      description: "Logging Failures",
      rulePatterns: ["log", "monitor", "audit"],
      severityFloor: "medium",
    },
    {
      id: "OWASP-A10",
      framework: "OWASP",
      description: "SSRF",
      rulePatterns: ["ssrf", "request", "fetch", "url"],
      severityFloor: "high",
    },
  ],
  cwe: [
    {
      id: "CWE-79",
      framework: "CWE",
      description: "Cross-site Scripting",
      rulePatterns: ["xss", "script", "html"],
      severityFloor: "high",
    },
    {
      id: "CWE-89",
      framework: "CWE",
      description: "SQL Injection",
      rulePatterns: ["sql", "query", "inject"],
      severityFloor: "critical",
    },
    {
      id: "CWE-200",
      framework: "CWE",
      description: "Information Exposure",
      rulePatterns: ["expose", "leak", "sensitive", "info"],
      severityFloor: "medium",
    },
    {
      id: "CWE-287",
      framework: "CWE",
      description: "Improper Authentication",
      rulePatterns: ["auth", "login", "credential"],
      severityFloor: "high",
    },
    {
      id: "CWE-502",
      framework: "CWE",
      description: "Deserialization",
      rulePatterns: ["deserializ", "pickle", "yaml.load"],
      severityFloor: "critical",
    },
  ],
};

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewComplianceCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-compliance-check — Check findings against compliance frameworks

Usage:
  judges review-compliance-check --file <results> [options]

Options:
  --file <path>         Results file with findings (required)
  --framework <name>    Framework: owasp, cwe, all (default: all)
  --strict              Fail if any compliance gaps found
  --format json         JSON output
  --help, -h            Show this help

Maps findings to OWASP Top 10 and CWE categories.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const frameworkName = (argv.find((_a: string, i: number) => argv[i - 1] === "--framework") || "all").toLowerCase();
  const strict = argv.includes("--strict");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let findings: Array<{ ruleId?: string; title?: string; severity?: string; description?: string }>;
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    findings = Array.isArray(data) ? data : data.findings || [];
  } catch {
    console.error("Error: could not parse results file");
    process.exitCode = 1;
    return;
  }

  // Get applicable rules
  let rules: ComplianceRule[];
  if (frameworkName === "all") {
    rules = [...(FRAMEWORKS.owasp || []), ...(FRAMEWORKS.cwe || [])];
  } else {
    rules = FRAMEWORKS[frameworkName] || [];
    if (rules.length === 0) {
      console.error(`Error: unknown framework '${frameworkName}'. Available: owasp, cwe`);
      process.exitCode = 1;
      return;
    }
  }

  // Match findings to compliance rules
  const results: Array<{ rule: ComplianceRule; matchedFindings: number; covered: boolean }> = [];
  for (const rule of rules) {
    const matched = findings.filter((f) => {
      const text = `${f.ruleId || ""} ${f.title || ""} ${f.description || ""}`.toLowerCase();
      return rule.rulePatterns.some((p) => text.includes(p.toLowerCase()));
    });
    results.push({ rule, matchedFindings: matched.length, covered: matched.length > 0 });
  }

  const covered = results.filter((r) => r.covered).length;
  const gaps = results.filter((r) => !r.covered);

  if (format === "json") {
    console.log(JSON.stringify({ totalRules: rules.length, covered, gaps: gaps.length, results }, null, 2));
    if (strict && gaps.length > 0) process.exitCode = 1;
    return;
  }

  console.log(`\nCompliance Check (${frameworkName.toUpperCase()}):`);
  console.log("═".repeat(65));
  for (const r of results) {
    const status = r.covered ? "COVERED" : "  GAP  ";
    console.log(`  [${status}] ${r.rule.id.padEnd(12)} ${r.rule.description.padEnd(30)} ${r.matchedFindings} findings`);
  }
  console.log("═".repeat(65));
  console.log(`  Coverage: ${covered}/${rules.length} (${gaps.length} gaps)`);

  if (strict && gaps.length > 0) {
    console.log("  STRICT MODE: Compliance gaps detected.");
    process.exitCode = 1;
  }
}
