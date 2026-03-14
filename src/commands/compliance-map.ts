/**
 * Compliance map — map findings to multiple compliance frameworks
 * (HIPAA, SOC2, PCI-DSS, ISO 27001, NIST 800-53).
 *
 * Produces a unified cross-walk matrix with gap analysis.
 * All analysis local — no data leaves the machine.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplianceControl {
  id: string;
  title: string;
  description: string;
}

interface FrameworkDef {
  id: string;
  name: string;
  controls: ComplianceControl[];
}

interface RuleMapping {
  rulePattern: RegExp;
  frameworks: Record<string, string[]>; // frameworkId → controlIds
}

interface MappedFinding {
  ruleId: string;
  title: string;
  severity: string;
  frameworks: Record<string, string[]>;
}

// ─── Frameworks ─────────────────────────────────────────────────────────────

const FRAMEWORKS: FrameworkDef[] = [
  {
    id: "hipaa",
    name: "HIPAA",
    controls: [
      {
        id: "164.312(a)(1)",
        title: "Access Control",
        description: "Implement technical policies for electronic information systems access",
      },
      {
        id: "164.312(a)(2)(iv)",
        title: "Encryption and Decryption",
        description: "Implement encryption mechanism for ePHI",
      },
      {
        id: "164.312(c)(1)",
        title: "Integrity",
        description: "Implement policies to protect ePHI from improper alteration",
      },
      {
        id: "164.312(d)",
        title: "Authentication",
        description: "Implement procedures to verify person or entity seeking access",
      },
      {
        id: "164.312(e)(1)",
        title: "Transmission Security",
        description: "Implement technical security measures for electronic transmission",
      },
      {
        id: "164.308(a)(1)(ii)(D)",
        title: "Information System Activity Review",
        description: "Implement procedures for regular review of records",
      },
    ],
  },
  {
    id: "soc2",
    name: "SOC 2",
    controls: [
      { id: "CC6.1", title: "Logical Access Security", description: "Logical access security over information assets" },
      { id: "CC6.3", title: "Role-Based Access", description: "Role-based access and least privilege" },
      { id: "CC6.6", title: "System Boundaries", description: "Security measures at system boundaries" },
      { id: "CC6.7", title: "Data Transmission", description: "Restrict transmission of data to authorized parties" },
      { id: "CC7.2", title: "System Monitoring", description: "Monitor system components for anomalies" },
      { id: "CC8.1", title: "Change Management", description: "Changes to infrastructure and software are authorized" },
    ],
  },
  {
    id: "pci-dss",
    name: "PCI-DSS v4.0",
    controls: [
      { id: "Req-2.2.1", title: "System Hardening", description: "Primary function configuration standards" },
      { id: "Req-3.4", title: "PAN Protection", description: "Render PAN unreadable anywhere it's stored" },
      { id: "Req-4.2.1", title: "Strong Cryptography", description: "Strong cryptography for PAN transmission" },
      { id: "Req-6.2.4", title: "Secure Coding", description: "Software engineering techniques prevent attacks" },
      {
        id: "Req-6.3.1",
        title: "Vulnerability Management",
        description: "Security vulnerabilities identified and managed",
      },
      { id: "Req-8.3.1", title: "Authentication", description: "Strong authentication for user access" },
      { id: "Req-10.2.1", title: "Audit Logs", description: "Logging mechanisms enabled" },
    ],
  },
  {
    id: "iso27001",
    name: "ISO 27001:2022",
    controls: [
      { id: "A.5.15", title: "Access Control", description: "Rules for access control based on business requirements" },
      {
        id: "A.8.3",
        title: "Information Access Restriction",
        description: "Access to information restricted per access control policy",
      },
      {
        id: "A.8.9",
        title: "Configuration Management",
        description: "Configurations including security configurations managed",
      },
      { id: "A.8.12", title: "Data Leakage Prevention", description: "Measures applied to prevent data leakage" },
      { id: "A.8.24", title: "Cryptography", description: "Rules for effective use of cryptography" },
      { id: "A.8.25", title: "Secure Development", description: "Rules for secure development of software" },
      { id: "A.8.28", title: "Secure Coding", description: "Secure coding principles applied to development" },
    ],
  },
  {
    id: "nist800-53",
    name: "NIST 800-53 Rev 5",
    controls: [
      { id: "AC-3", title: "Access Enforcement", description: "Enforce approved authorizations for access" },
      { id: "AC-6", title: "Least Privilege", description: "Employ principle of least privilege" },
      { id: "AU-2", title: "Event Logging", description: "Identify events requiring logging" },
      { id: "IA-5", title: "Authenticator Management", description: "Manage information system authenticators" },
      { id: "SC-8", title: "Transmission Confidentiality", description: "Protect transmitted information" },
      { id: "SC-13", title: "Cryptographic Protection", description: "Implement cryptographic mechanisms" },
      { id: "SI-10", title: "Information Input Validation", description: "Check validity of information inputs" },
      { id: "SA-11", title: "Developer Testing", description: "Require system developer to create test plan" },
    ],
  },
];

// ─── Rule-to-control mappings ───────────────────────────────────────────────

const RULE_MAPPINGS: RuleMapping[] = [
  {
    rulePattern: /sql[-_]?inject|inject|xss|command[-_]?inject|input[-_]?valid/i,
    frameworks: {
      hipaa: ["164.312(c)(1)"],
      soc2: ["CC6.6"],
      "pci-dss": ["Req-6.2.4"],
      iso27001: ["A.8.28"],
      "nist800-53": ["SI-10"],
    },
  },
  {
    rulePattern: /crypt|encrypt|hash|tls|ssl|cert/i,
    frameworks: {
      hipaa: ["164.312(a)(2)(iv)", "164.312(e)(1)"],
      soc2: ["CC6.7"],
      "pci-dss": ["Req-4.2.1"],
      iso27001: ["A.8.24"],
      "nist800-53": ["SC-8", "SC-13"],
    },
  },
  {
    rulePattern: /auth|login|session|token|credential|password/i,
    frameworks: {
      hipaa: ["164.312(d)"],
      soc2: ["CC6.1"],
      "pci-dss": ["Req-8.3.1"],
      iso27001: ["A.5.15"],
      "nist800-53": ["IA-5", "AC-3"],
    },
  },
  {
    rulePattern: /access[-_]?control|privilege|rbac|permission|author/i,
    frameworks: {
      hipaa: ["164.312(a)(1)"],
      soc2: ["CC6.3"],
      "pci-dss": ["Req-8.3.1"],
      iso27001: ["A.8.3"],
      "nist800-53": ["AC-3", "AC-6"],
    },
  },
  {
    rulePattern: /log|audit|monitor|trace/i,
    frameworks: {
      hipaa: ["164.308(a)(1)(ii)(D)"],
      soc2: ["CC7.2"],
      "pci-dss": ["Req-10.2.1"],
      iso27001: ["A.8.9"],
      "nist800-53": ["AU-2"],
    },
  },
  {
    rulePattern: /secret|leak|expos|sensitive|pii|pan|credit[-_]?card/i,
    frameworks: {
      hipaa: ["164.312(a)(2)(iv)"],
      soc2: ["CC6.7"],
      "pci-dss": ["Req-3.4"],
      iso27001: ["A.8.12"],
      "nist800-53": ["SC-13"],
    },
  },
  {
    rulePattern: /config|harden|secure[-_]?default|misconfigur/i,
    frameworks: {
      soc2: ["CC8.1"],
      "pci-dss": ["Req-2.2.1"],
      iso27001: ["A.8.9"],
      "nist800-53": ["SA-11"],
    },
  },
  {
    rulePattern: /vuln|cve|dependency|outdated|package/i,
    frameworks: {
      "pci-dss": ["Req-6.3.1"],
      iso27001: ["A.8.25"],
      "nist800-53": ["SA-11"],
    },
  },
];

// ─── Engine ─────────────────────────────────────────────────────────────────

interface SarifFinding {
  ruleId?: string;
  level?: string;
  message?: { text?: string };
}

function loadFindings(inputPath: string): Array<{ ruleId: string; title: string; severity: string }> {
  const content = readFileSync(inputPath, "utf-8");
  const data = JSON.parse(content);

  // SARIF format
  if (data.$schema?.includes("sarif") || data.runs) {
    const findings: Array<{ ruleId: string; title: string; severity: string }> = [];
    for (const run of data.runs || []) {
      for (const result of run.results || []) {
        const r = result as SarifFinding;
        findings.push({
          ruleId: r.ruleId || "unknown",
          title: r.message?.text || r.ruleId || "Unknown",
          severity: r.level === "error" ? "high" : r.level === "warning" ? "medium" : "low",
        });
      }
    }
    return findings;
  }

  // Judges tribunal output
  if (data.findings) {
    return data.findings.map((f: { ruleId?: string; title?: string; severity?: string }) => ({
      ruleId: f.ruleId || "unknown",
      title: f.title || f.ruleId || "Unknown",
      severity: f.severity || "medium",
    }));
  }

  // Array of findings
  if (Array.isArray(data)) {
    return data.map((f: { ruleId?: string; title?: string; severity?: string }) => ({
      ruleId: f.ruleId || "unknown",
      title: f.title || "Unknown",
      severity: f.severity || "medium",
    }));
  }

  return [];
}

function mapToFrameworks(findings: Array<{ ruleId: string; title: string; severity: string }>): MappedFinding[] {
  return findings.map((f) => {
    const frameworks: Record<string, string[]> = {};
    const combined = `${f.ruleId} ${f.title}`;
    for (const mapping of RULE_MAPPINGS) {
      if (mapping.rulePattern.test(combined)) {
        for (const [fwId, controls] of Object.entries(mapping.frameworks)) {
          if (!frameworks[fwId]) frameworks[fwId] = [];
          for (const c of controls) {
            if (!frameworks[fwId].includes(c)) frameworks[fwId].push(c);
          }
        }
      }
    }
    return { ruleId: f.ruleId, title: f.title, severity: f.severity, frameworks };
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runComplianceMap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges compliance-map — Map findings to compliance frameworks

Usage:
  judges compliance-map <findings.json>
  judges compliance-map report.sarif.json --frameworks hipaa,pci-dss
  judges compliance-map findings.json --format json --output compliance.json

Options:
  --frameworks <list>   Filter frameworks (comma-separated: hipaa,soc2,pci-dss,iso27001,nist800-53)
  --list-frameworks     List all supported frameworks and controls
  --gap-analysis        Show which controls have no matching findings
  --format json         JSON output
  --output <file>       Write report to file
  --help, -h            Show this help

Supported Frameworks: ${FRAMEWORKS.map((f) => f.id).join(", ")}
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");

  if (argv.includes("--list-frameworks")) {
    if (format === "json") {
      console.log(JSON.stringify(FRAMEWORKS, null, 2));
    } else {
      for (const fw of FRAMEWORKS) {
        console.log(`\n  ${fw.name} (${fw.id})`);
        console.log("  ──────────────────────────");
        for (const c of fw.controls) {
          console.log(`    ${c.id.padEnd(20)} ${c.title}`);
        }
      }
      console.log("");
    }
    return;
  }

  const inputFile = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--"));
  if (!inputFile || !existsSync(inputFile)) {
    console.error("  Please provide a valid findings file (JSON or SARIF)");
    return;
  }

  const fwFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--frameworks");
  const showGaps = argv.includes("--gap-analysis");

  let findings: Array<{ ruleId: string; title: string; severity: string }>;
  try {
    findings = loadFindings(inputFile);
  } catch (err) {
    console.error(`  Failed to parse findings: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const mapped = mapToFrameworks(findings);

  let activeFrameworks = FRAMEWORKS;
  if (fwFilter) {
    const allowed = fwFilter.split(",");
    activeFrameworks = FRAMEWORKS.filter((f) => allowed.includes(f.id));
  }

  // Build coverage matrix
  const coverage: Record<string, Set<string>> = {};
  for (const fw of activeFrameworks) coverage[fw.id] = new Set();
  for (const m of mapped) {
    for (const [fwId, controls] of Object.entries(m.frameworks)) {
      if (!coverage[fwId]) continue;
      for (const c of controls) coverage[fwId].add(c);
    }
  }

  const report = {
    findings: mapped,
    coverage: Object.fromEntries(
      activeFrameworks.map((fw) => [
        fw.id,
        {
          name: fw.name,
          totalControls: fw.controls.length,
          coveredControls: coverage[fw.id].size,
          coveragePercent: fw.controls.length > 0 ? Math.round((coverage[fw.id].size / fw.controls.length) * 100) : 0,
          covered: [...coverage[fw.id]],
          gaps: fw.controls.filter((c) => !coverage[fw.id].has(c.id)).map((c) => c.id),
        },
      ]),
    ),
    totalFindings: findings.length,
    mappedFindings: mapped.filter((m) => Object.keys(m.frameworks).length > 0).length,
    timestamp: new Date().toISOString(),
  };

  if (outputFile) {
    const dir = join(".", ".judges-compliance");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, outputFile), JSON.stringify(report, null, 2));
    console.log(`  Report saved to .judges-compliance/${outputFile}`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Compliance Mapping — ${findings.length} findings`);
    console.log(
      `  Mapped: ${report.mappedFindings} | Unmapped: ${findings.length - report.mappedFindings}\n  ──────────────────────────`,
    );

    for (const fw of activeFrameworks) {
      const cov = report.coverage[fw.id];
      const bar =
        "█".repeat(Math.round(cov.coveragePercent / 5)) + "░".repeat(20 - Math.round(cov.coveragePercent / 5));
      console.log(
        `\n    ${fw.name.padEnd(20)} ${bar} ${cov.coveragePercent}% (${cov.coveredControls}/${cov.totalControls})`,
      );

      if (showGaps && cov.gaps.length > 0) {
        console.log(`      Gaps: ${cov.gaps.join(", ")}`);
      }
    }

    // Cross-walk table
    console.log("\n    Cross-Walk Matrix:");
    console.log("    " + "Finding".padEnd(40) + activeFrameworks.map((f) => f.id.padEnd(12)).join(""));
    console.log("    " + "─".repeat(40 + activeFrameworks.length * 12));
    for (const m of mapped.slice(0, 20)) {
      const cols = activeFrameworks
        .map((f) => (m.frameworks[f.id]?.length ? `✓ (${m.frameworks[f.id].length})`.padEnd(12) : "—".padEnd(12)))
        .join("");
      console.log("    " + m.ruleId.substring(0, 38).padEnd(40) + cols);
    }
    if (mapped.length > 20) console.log(`    ... and ${mapped.length - 20} more findings`);
    console.log("");
  }
}
