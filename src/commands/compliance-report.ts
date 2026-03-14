/**
 * `judges compliance-report` — Audit-ready compliance evidence generation.
 *
 * Maps findings to regulatory frameworks (SOC 2, OWASP Top 10, OWASP LLM Top 10,
 * CWE, PCI-DSS) and generates structured evidence packets suitable for auditors.
 *
 * Usage:
 *   judges compliance-report myFile.ts               # text report
 *   judges compliance-report myFile.ts --json         # JSON evidence packet
 *   judges compliance-report myFile.ts --framework soc2  # filter by framework
 */

import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComplianceMapping {
  framework: string;
  controlId: string;
  controlTitle: string;
  status: "pass" | "fail" | "not-assessed";
  findings: Finding[];
  evidence: string;
}

export interface ComplianceReport {
  target: string;
  generatedAt: string;
  frameworks: Record<string, ComplianceMapping[]>;
  summary: {
    total: number;
    pass: number;
    fail: number;
    notAssessed: number;
    passRate: number;
  };
}

// ─── Framework Control Definitions ──────────────────────────────────────────

const SOC2_CONTROLS: Array<{ id: string; title: string; rulePatterns: RegExp[] }> = [
  { id: "CC6.1", title: "Logical and Physical Access Controls", rulePatterns: [/^SEC-|^AUTH-|^CYBER-|^COMP-/] },
  { id: "CC6.6", title: "System Boundaries and Threat Mitigation", rulePatterns: [/^SEC-|^RATE-|^CYBER-/] },
  { id: "CC6.7", title: "Data Classification and Restricted Transmission", rulePatterns: [/^DSEC-|^COMP-|^SEC-/] },
  { id: "CC7.1", title: "Detection and Monitoring", rulePatterns: [/^OBS-|^LOG-|^COMP-/] },
  { id: "CC7.2", title: "Anomaly Detection and Incident Response", rulePatterns: [/^OBS-|^CYBER-|^REL-/] },
  { id: "CC8.1", title: "Change Management", rulePatterns: [/^CICD-|^SW-|^DEP-/] },
  { id: "CC9.1", title: "Risk Mitigation", rulePatterns: [/^SEC-|^PERF-|^REL-|^SCALE-/] },
];

const OWASP_TOP10: Array<{ id: string; title: string; cweRanges: string[] }> = [
  {
    id: "A01",
    title: "Broken Access Control",
    cweRanges: ["CWE-200", "CWE-284", "CWE-285", "CWE-639", "CWE-862", "CWE-863"],
  },
  {
    id: "A02",
    title: "Cryptographic Failures",
    cweRanges: ["CWE-259", "CWE-261", "CWE-327", "CWE-328", "CWE-330", "CWE-916"],
  },
  { id: "A03", title: "Injection", cweRanges: ["CWE-20", "CWE-77", "CWE-78", "CWE-79", "CWE-89", "CWE-94"] },
  { id: "A04", title: "Insecure Design", cweRanges: ["CWE-209", "CWE-256", "CWE-501", "CWE-522"] },
  { id: "A05", title: "Security Misconfiguration", cweRanges: ["CWE-16", "CWE-611", "CWE-614", "CWE-1004"] },
  { id: "A06", title: "Vulnerable and Outdated Components", cweRanges: ["CWE-1104"] },
  { id: "A07", title: "Identification and Authentication Failures", cweRanges: ["CWE-255", "CWE-287", "CWE-384"] },
  { id: "A08", title: "Software and Data Integrity Failures", cweRanges: ["CWE-345", "CWE-502", "CWE-829"] },
  {
    id: "A09",
    title: "Security Logging and Monitoring Failures",
    cweRanges: ["CWE-117", "CWE-223", "CWE-532", "CWE-778"],
  },
  { id: "A10", title: "Server-Side Request Forgery", cweRanges: ["CWE-918"] },
];

const PCI_DSS_CONTROLS: Array<{ id: string; title: string; rulePatterns: RegExp[] }> = [
  { id: "Req-3.4", title: "Render PAN unreadable", rulePatterns: [/^DSEC-|^SEC-.*(?:encrypt|hash)/i] },
  { id: "Req-6.5", title: "Address common coding vulnerabilities", rulePatterns: [/^SEC-|^CYBER-/] },
  { id: "Req-8.2", title: "Strong authentication methods", rulePatterns: [/^AUTH-|^SEC-/] },
  { id: "Req-10.2", title: "Audit trail captures events", rulePatterns: [/^OBS-|^LOG-|^COMP-/] },
];

// ─── Mapping Logic ──────────────────────────────────────────────────────────

function mapFindingsToSOC2(findings: Finding[]): ComplianceMapping[] {
  return SOC2_CONTROLS.map((ctrl) => {
    const matched = findings.filter((f) => ctrl.rulePatterns.some((p) => p.test(f.ruleId)));
    const status: ComplianceMapping["status"] = matched.length > 0 ? "fail" : "not-assessed";
    return {
      framework: "SOC 2",
      controlId: ctrl.id,
      controlTitle: ctrl.title,
      status,
      findings: matched,
      evidence:
        matched.length > 0
          ? `${matched.length} finding(s) impact this control: ${matched.map((f) => f.ruleId).join(", ")}`
          : "No findings detected for this control. Manual review recommended.",
    };
  });
}

function mapFindingsToOWASP(findings: Finding[]): ComplianceMapping[] {
  return OWASP_TOP10.map((cat) => {
    const matched = findings.filter((f) => {
      if (f.cweIds) return f.cweIds.some((cwe) => cat.cweRanges.includes(cwe));
      if (f.owaspIds) return f.owaspIds.some((id) => id.startsWith(cat.id));
      return false;
    });
    const status: ComplianceMapping["status"] = matched.length > 0 ? "fail" : "not-assessed";
    return {
      framework: "OWASP Top 10",
      controlId: cat.id,
      controlTitle: cat.title,
      status,
      findings: matched,
      evidence:
        matched.length > 0
          ? `${matched.length} finding(s): ${matched.map((f) => `${f.ruleId} (${f.cweIds?.join(", ") || "no CWE"})`).join("; ")}`
          : "No findings mapped to this category.",
    };
  });
}

function mapFindingsToPCI(findings: Finding[]): ComplianceMapping[] {
  return PCI_DSS_CONTROLS.map((ctrl) => {
    const matched = findings.filter((f) => ctrl.rulePatterns.some((p) => p.test(f.ruleId)));
    const status: ComplianceMapping["status"] = matched.length > 0 ? "fail" : "not-assessed";
    return {
      framework: "PCI-DSS",
      controlId: ctrl.id,
      controlTitle: ctrl.title,
      status,
      findings: matched,
      evidence:
        matched.length > 0
          ? `${matched.length} finding(s) impact this requirement: ${matched.map((f) => f.ruleId).join(", ")}`
          : "No findings detected for this requirement.",
    };
  });
}

// ─── Report Builder ─────────────────────────────────────────────────────────

export function buildComplianceReport(target: string, findings: Finding[], filterFramework?: string): ComplianceReport {
  const frameworks: Record<string, ComplianceMapping[]> = {};

  if (!filterFramework || filterFramework === "soc2") {
    frameworks["SOC 2"] = mapFindingsToSOC2(findings);
  }
  if (!filterFramework || filterFramework === "owasp") {
    frameworks["OWASP Top 10"] = mapFindingsToOWASP(findings);
  }
  if (!filterFramework || filterFramework === "pci") {
    frameworks["PCI-DSS"] = mapFindingsToPCI(findings);
  }

  const allMappings = Object.values(frameworks).flat();
  const total = allMappings.length;
  const pass = allMappings.filter((m) => m.status === "pass").length;
  const fail = allMappings.filter((m) => m.status === "fail").length;
  const notAssessed = allMappings.filter((m) => m.status === "not-assessed").length;

  return {
    target,
    generatedAt: new Date().toISOString(),
    frameworks,
    summary: {
      total,
      pass,
      fail,
      notAssessed,
      passRate: total > 0 ? Math.round((pass / total) * 100) : 0,
    },
  };
}

// ─── CLI Formatters ─────────────────────────────────────────────────────────

export function formatComplianceReportText(report: ComplianceReport): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║       Judges Panel — Compliance Evidence Report             ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Target    : ${report.target}`);
  lines.push(`  Generated : ${report.generatedAt.slice(0, 10)}`);
  lines.push(
    `  Controls  : ${report.summary.total} (${report.summary.fail} failing, ${report.summary.notAssessed} not assessed)`,
  );
  lines.push("");

  for (const [framework, mappings] of Object.entries(report.frameworks)) {
    lines.push(`  ┌── ${framework} ${"─".repeat(50 - framework.length)}`);
    for (const m of mappings) {
      const icon = m.status === "pass" ? "✅" : m.status === "fail" ? "❌" : "⬜";
      lines.push(`  │ ${icon} ${m.controlId.padEnd(10)} ${m.controlTitle}`);
      if (m.status === "fail") {
        lines.push(`  │   └─ ${m.evidence}`);
      }
    }
    lines.push(`  └${"─".repeat(60)}`);
    lines.push("");
  }

  return lines.join("\n");
}
