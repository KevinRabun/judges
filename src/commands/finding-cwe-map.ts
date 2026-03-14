/**
 * Finding-cwe-map — Map findings to CWE (Common Weakness Enumeration) identifiers.
 */

import type { Finding, TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";

// ─── CWE Mapping ───────────────────────────────────────────────────────────

const KEYWORD_CWE_MAP: Record<string, { cwe: string; name: string }[]> = {
  injection: [
    { cwe: "CWE-89", name: "SQL Injection" },
    { cwe: "CWE-78", name: "OS Command Injection" },
  ],
  "sql injection": [{ cwe: "CWE-89", name: "SQL Injection" }],
  xss: [{ cwe: "CWE-79", name: "Cross-site Scripting" }],
  "cross-site scripting": [{ cwe: "CWE-79", name: "Cross-site Scripting" }],
  csrf: [{ cwe: "CWE-352", name: "Cross-Site Request Forgery" }],
  "path traversal": [{ cwe: "CWE-22", name: "Path Traversal" }],
  "buffer overflow": [{ cwe: "CWE-120", name: "Buffer Copy without Checking Size" }],
  authentication: [{ cwe: "CWE-287", name: "Improper Authentication" }],
  authorization: [{ cwe: "CWE-862", name: "Missing Authorization" }],
  hardcoded: [{ cwe: "CWE-798", name: "Use of Hard-coded Credentials" }],
  credential: [{ cwe: "CWE-798", name: "Use of Hard-coded Credentials" }],
  password: [{ cwe: "CWE-521", name: "Weak Password Requirements" }],
  deserialization: [{ cwe: "CWE-502", name: "Deserialization of Untrusted Data" }],
  ssrf: [{ cwe: "CWE-918", name: "Server-Side Request Forgery" }],
  "race condition": [{ cwe: "CWE-362", name: "Race Condition" }],
  "null pointer": [{ cwe: "CWE-476", name: "NULL Pointer Dereference" }],
  "memory leak": [{ cwe: "CWE-401", name: "Missing Release of Memory" }],
  "information disclosure": [{ cwe: "CWE-200", name: "Exposure of Sensitive Information" }],
  cryptographic: [{ cwe: "CWE-327", name: "Use of a Broken Crypto Algorithm" }],
  encryption: [{ cwe: "CWE-326", name: "Inadequate Encryption Strength" }],
  "open redirect": [{ cwe: "CWE-601", name: "URL Redirection to Untrusted Site" }],
  xml: [{ cwe: "CWE-611", name: "Improper Restriction of XML External Entity" }],
  privilege: [{ cwe: "CWE-269", name: "Improper Privilege Management" }],
};

function mapFindingToCwe(finding: Finding): { cwe: string; name: string }[] {
  const text = `${finding.ruleId || ""} ${finding.title || ""} ${finding.description || ""}`.toLowerCase();
  const matches: { cwe: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const [keyword, cwes] of Object.entries(KEYWORD_CWE_MAP)) {
    if (text.includes(keyword)) {
      for (const c of cwes) {
        if (!seen.has(c.cwe)) {
          seen.add(c.cwe);
          matches.push(c);
        }
      }
    }
  }
  return matches;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCweMap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-cwe-map — Map findings to CWE identifiers

Usage:
  judges finding-cwe-map --file <results.json> [options]

Options:
  --file <path>      Result file (required)
  --cwe <id>         Filter to specific CWE (e.g., CWE-89)
  --format json      JSON output
  --help, -h         Show this help

Maps security findings to their corresponding CWE identifiers.
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

  const cweFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--cwe");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  let mapped = findings.map((f) => ({ ...f, cwes: mapFindingToCwe(f) }));

  if (cweFilter) {
    mapped = mapped.filter((f) => f.cwes.some((c) => c.cwe === cweFilter));
  }

  const withCwe = mapped.filter((f) => f.cwes.length > 0);

  // CWE frequency
  const cweFreq = new Map<string, { name: string; count: number }>();
  for (const f of withCwe) {
    for (const c of f.cwes) {
      const existing = cweFreq.get(c.cwe);
      if (existing) existing.count++;
      else cweFreq.set(c.cwe, { name: c.name, count: 1 });
    }
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          total: findings.length,
          mapped: withCwe.length,
          cweSummary: [...cweFreq.entries()].map(([cwe, info]) => ({ cwe, name: info.name, count: info.count })),
          findings: mapped,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nCWE Mapping:`);
  console.log("═".repeat(70));
  console.log(`  ${withCwe.length} of ${findings.length} findings mapped to CWE identifiers`);
  console.log("─".repeat(70));

  console.log("\n  CWE Summary:");
  for (const [cwe, info] of [...cweFreq.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`    ${cwe.padEnd(12)} ${info.name.padEnd(40)} x${info.count}`);
  }

  console.log("\n  Mapped Findings:");
  for (const f of withCwe.slice(0, 15)) {
    const cweStr = f.cwes.map((c) => c.cwe).join(", ");
    console.log(`    ${(f.ruleId || "unknown").padEnd(22)} → ${cweStr}`);
  }
  if (withCwe.length > 15) console.log(`    ... and ${withCwe.length - 15} more`);
  console.log("═".repeat(70));
}
