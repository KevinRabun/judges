/**
 * Finding-cwe-lookup — Look up CWE details for finding rule IDs.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── CWE database (embedded subset) ────────────────────────────────────────

const CWE_DB: Record<string, { id: string; name: string; description: string; mitigation: string }> = {
  "sql-injection": {
    id: "CWE-89",
    name: "SQL Injection",
    description: "Improper neutralization of special elements used in an SQL command",
    mitigation: "Use parameterized queries or prepared statements",
  },
  xss: {
    id: "CWE-79",
    name: "Cross-site Scripting",
    description: "Improper neutralization of input during web page generation",
    mitigation: "Sanitize output and use Content Security Policy",
  },
  "path-traversal": {
    id: "CWE-22",
    name: "Path Traversal",
    description: "Improper limitation of a pathname to a restricted directory",
    mitigation: "Validate and canonicalize file paths",
  },
  "command-injection": {
    id: "CWE-78",
    name: "OS Command Injection",
    description: "Improper neutralization of special elements used in an OS command",
    mitigation: "Avoid shell commands; use safe APIs",
  },
  "hardcoded-secret": {
    id: "CWE-798",
    name: "Hardcoded Credentials",
    description: "Use of hard-coded credentials in source code",
    mitigation: "Use environment variables or secret managers",
  },
  "insecure-deserialization": {
    id: "CWE-502",
    name: "Insecure Deserialization",
    description: "Deserialization of untrusted data",
    mitigation: "Validate serialized data or use safe alternatives",
  },
  "broken-auth": {
    id: "CWE-287",
    name: "Improper Authentication",
    description: "Missing or improper authentication mechanism",
    mitigation: "Implement robust authentication with MFA",
  },
  ssrf: {
    id: "CWE-918",
    name: "Server-Side Request Forgery",
    description: "Server-side request to unintended location",
    mitigation: "Validate and restrict outbound requests",
  },
  "open-redirect": {
    id: "CWE-601",
    name: "Open Redirect",
    description: "URL redirection to untrusted site",
    mitigation: "Validate redirect URLs against allowlist",
  },
  xxe: {
    id: "CWE-611",
    name: "XML External Entities",
    description: "Improper restriction of XML external entity reference",
    mitigation: "Disable external entity processing",
  },
};

interface CweLookupResult {
  ruleId: string;
  title: string;
  cwe: { id: string; name: string; description: string; mitigation: string } | null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCweLookup(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const ruleIdx = argv.indexOf("--rule");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-cwe-lookup — Look up CWE details for findings

Usage:
  judges finding-cwe-lookup [--report <path>] [--rule <ruleId>]
                            [--format table|json]

Options:
  --report <path>  Report file to look up CWEs for all findings
  --rule <ruleId>  Look up a single rule ID
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  // Single rule lookup
  if (ruleIdx >= 0) {
    const ruleId = argv[ruleIdx + 1];
    const key = ruleId.split("/").pop() ?? ruleId;
    const cwe = CWE_DB[key] ?? null;

    if (format === "json") {
      console.log(JSON.stringify({ ruleId, cwe }, null, 2));
    } else if (cwe !== null) {
      console.log(`\n  ${cwe.id}: ${cwe.name}`);
      console.log(`  ${cwe.description}`);
      console.log(`  Mitigation: ${cwe.mitigation}`);
    } else {
      console.log(`  No CWE mapping found for: ${ruleId}`);
    }
    return;
  }

  // Report lookup
  if (reportIdx < 0) {
    console.error("Supply --report <path> or --rule <ruleId>");
    process.exitCode = 1;
    return;
  }

  const reportPath = argv[reportIdx + 1];
  if (!existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
  const findings = report.findings ?? [];

  const results: CweLookupResult[] = findings.map((f) => {
    const key = f.ruleId.split("/").pop() ?? f.ruleId;
    return { ruleId: f.ruleId, title: f.title, cwe: CWE_DB[key] ?? null };
  });

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nCWE Lookup`);
  console.log("═".repeat(70));

  const mapped = results.filter((r) => r.cwe !== null);
  const unmapped = results.filter((r) => r.cwe === null);

  if (mapped.length > 0) {
    console.log("  Mapped:");
    for (const r of mapped) {
      console.log(`    ${r.ruleId.padEnd(25)} → ${r.cwe!.id} (${r.cwe!.name})`);
    }
  }

  if (unmapped.length > 0) {
    console.log("  No CWE mapping:");
    for (const r of unmapped) {
      console.log(`    ${r.ruleId.padEnd(25)} ${r.title}`);
    }
  }

  console.log(`\n  Coverage: ${mapped.length}/${results.length} findings mapped to CWEs`);
  console.log("═".repeat(70));
}
