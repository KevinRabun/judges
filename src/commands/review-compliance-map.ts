/**
 * Review-compliance-map — Map findings to compliance frameworks.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Framework mappings ─────────────────────────────────────────────────────

const COMPLIANCE_MAP: Record<string, { framework: string; control: string }[]> = {
  "sql-injection": [
    { framework: "OWASP", control: "A03:2021-Injection" },
    { framework: "CWE", control: "CWE-89" },
    { framework: "PCI-DSS", control: "6.5.1" },
  ],
  xss: [
    { framework: "OWASP", control: "A07:2021-XSS" },
    { framework: "CWE", control: "CWE-79" },
  ],
  "hardcoded-secret": [
    { framework: "OWASP", control: "A02:2021-Crypto" },
    { framework: "CWE", control: "CWE-798" },
    { framework: "SOC2", control: "CC6.1" },
  ],
  "insecure-auth": [
    { framework: "OWASP", control: "A07:2021-Auth" },
    { framework: "CWE", control: "CWE-287" },
  ],
  "path-traversal": [
    { framework: "OWASP", control: "A01:2021-BAC" },
    { framework: "CWE", control: "CWE-22" },
  ],
};

interface ComplianceHit {
  ruleId: string;
  title: string;
  frameworks: { framework: string; control: string }[];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewComplianceMap(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const frameworkIdx = argv.indexOf("--framework");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const frameworkFilter = frameworkIdx >= 0 ? argv[frameworkIdx + 1] : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-compliance-map — Map findings to compliance frameworks

Usage:
  judges review-compliance-map --report <path> [--framework <name>]
                               [--format table|json]

Options:
  --report <path>      Report file with findings
  --framework <name>   Filter by framework (OWASP, CWE, PCI-DSS, SOC2)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (reportIdx < 0) {
    console.error("Missing --report <path>");
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

  const hits: ComplianceHit[] = [];

  for (const f of findings) {
    const ruleKey = f.ruleId.split("/").pop() ?? f.ruleId;
    let mappings = COMPLIANCE_MAP[ruleKey] ?? [];

    if (frameworkFilter.length > 0) {
      mappings = mappings.filter((m) => m.framework.toLowerCase() === frameworkFilter.toLowerCase());
    }

    if (mappings.length > 0) {
      hits.push({ ruleId: f.ruleId, title: f.title, frameworks: mappings });
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(hits, null, 2));
    return;
  }

  console.log(`\nCompliance Mapping`);
  console.log("═".repeat(70));

  if (hits.length === 0) {
    console.log("  No compliance mappings found for the given findings.");
  } else {
    for (const h of hits) {
      console.log(`  ${h.ruleId}`);
      console.log(`    ${h.title}`);
      for (const m of h.frameworks) {
        console.log(`    → ${m.framework}: ${m.control}`);
      }
      console.log("");
    }
  }

  // Summary by framework
  const frameworkCounts: Record<string, number> = {};
  for (const h of hits) {
    for (const m of h.frameworks) {
      frameworkCounts[m.framework] = (frameworkCounts[m.framework] ?? 0) + 1;
    }
  }

  if (Object.keys(frameworkCounts).length > 0) {
    console.log("  Summary by Framework:");
    for (const [fw, count] of Object.entries(frameworkCounts)) {
      console.log(`    ${fw.padEnd(12)} ${count} finding(s)`);
    }
  }

  console.log("═".repeat(70));
}
