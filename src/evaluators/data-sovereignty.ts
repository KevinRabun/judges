import { Finding } from "../types.js";

export function analyzeDataSovereignty(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "SOV";
  let ruleNum = 1;

  const regionMentionLines: number[] = [];
  const hardcodedGlobalOrForeignLines: number[] = [];
  lines.forEach((line, index) => {
    if (/region|location|geo|jurisdiction|data.?residen/i.test(line)) {
      regionMentionLines.push(index + 1);
    }

    if (
      /(global|multi-?region|us-|asia-|ap-|worldwide|any-region|default-region)/i.test(line) &&
      !/allow|approved|whitelist|policy|guard|eu-|sovereign/i.test(line)
    ) {
      hardcodedGlobalOrForeignLines.push(index + 1);
    }
  });

  const hasRegionPolicy = /allow(ed)?Regions|approvedRegions|regionPolicy|dataResidencyPolicy|sovereignty/i.test(code);

  if (hardcodedGlobalOrForeignLines.length > 0 && !hasRegionPolicy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Region usage without residency policy guardrails",
      description:
        "Code appears to use global/foreign region patterns without an explicit approved-region policy. This can cause unintentional cross-border storage or processing.",
      lineNumbers: hardcodedGlobalOrForeignLines.slice(0, 10),
      recommendation:
        "Enforce a strict approved-region allowlist and reject deployments/requests outside permitted jurisdictions.",
      reference: "Data Residency Governance / GDPR Chapter V",
    });
  }

  const crossBorderEgressLines: number[] = [];
  lines.forEach((line, index) => {
    if (
      /(fetch\(|axios\.|http(s)?:\/\/|webhook|third.?party|external.?api|sendTo|forwardTo)/i.test(line) &&
      !/consent|scc|adequacy|jurisdiction|region|residency|sovereignty/i.test(line)
    ) {
      crossBorderEgressLines.push(index + 1);
    }
  });

  if (crossBorderEgressLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential cross-border data egress without jurisdiction checks",
      description:
        "External API/network calls are present without visible jurisdictional or transfer controls, increasing cross-border data transfer risk.",
      lineNumbers: crossBorderEgressLines.slice(0, 10),
      recommendation:
        "Add egress controls that validate destination jurisdiction, data classification, and lawful transfer conditions before sending data.",
      reference: "GDPR Articles 44-49 / Cross-Border Transfer Controls",
    });
  }

  const replicationLines: number[] = [];
  lines.forEach((line, index) => {
    if (/(replica|replication|backup|dr|disaster.?recovery|geo-?redundant|read.?replica)/i.test(line) && !/same.?region|region.?locked|sovereign|local.?zone/i.test(line)) {
      replicationLines.push(index + 1);
    }
  });

  if (replicationLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Replication/backup configuration may violate localization requirements",
      description:
        "Replication or backup behavior is referenced without explicit geography constraints, which can replicate regulated data to unauthorized regions.",
      lineNumbers: replicationLines.slice(0, 10),
      recommendation:
        "Pin replication and backup targets to approved jurisdictions and document DR geography constraints.",
      reference: "Data Localization Controls / Operational Resilience",
    });
  }

  const exportLines: number[] = [];
  lines.forEach((line, index) => {
    if (/(export|download|dump|report|analytics|telemetry|support.?bundle)/i.test(line) && !/redact|anonym|aggregate|jurisdiction|policy/i.test(line)) {
      exportLines.push(index + 1);
    }
  });

  if (exportLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Data export path without sovereignty-aware controls",
      description:
        "Export/reporting flows appear without visible controls for jurisdiction, minimization, or anonymization, increasing sovereignty and transfer risk.",
      lineNumbers: exportLines.slice(0, 10),
      recommendation:
        "Apply policy checks to export paths (region eligibility, minimization, anonymization) and block disallowed exports.",
      reference: "Data Governance / Transfer Risk Mitigation",
    });
  }

  const geoRoutingSignals = /(country|locale|region|jurisdiction|tenantRegion|dataBoundary)/i.test(code);
  const hasPolicyEnforcement = /(deny|reject|throw|forbidden|policyViolation|residencyViolation)/i.test(code);

  if (regionMentionLines.length > 0 && geoRoutingSignals && !hasPolicyEnforcement) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Jurisdiction context present without explicit enforcement branch",
      description:
        "Code references region/jurisdiction context but does not clearly enforce deny/allow behavior when rules are violated.",
      lineNumbers: regionMentionLines.slice(0, 10),
      recommendation:
        "Implement explicit enforcement branches that block operations violating residency or transfer policy.",
      reference: "Policy-as-Code Enforcement Best Practices",
    });
  }

  if (findings.length === 0 && code.length > 0) {
    const hasDataHandling = /(user|customer|personal|profile|account|email|phone|pii|data)/i.test(code);
    if (hasDataHandling) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "info",
        title: "Sovereignty evidence not explicit in code",
        description:
          "Data handling is present, but sovereignty controls (policy references, jurisdiction checks, transfer guardrails) are not explicitly visible in this code segment.",
        recommendation:
          "Add explicit sovereignty control points in code/config and link them to auditable policy artifacts.",
        reference: "Data Sovereignty Assurance Guidance",
      });
    }
  }

  return findings;
}
