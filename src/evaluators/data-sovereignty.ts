import type { Finding } from "../types.js";

export function analyzeDataSovereignty(code: string, _language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "SOV";
  let ruleNum = 1;

  const regionMentionLines: number[] = [];
  const hardcodedGlobalOrForeignLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Skip comment lines — doc blocks describing sovereignty controls are not violations
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;

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
      suggestedFix:
        "Add an approved-region allowlist: const ALLOWED_REGIONS = ['eu-west-1', 'eu-central-1']; and validate before deployment/request routing.",
      confidence: 0.85,
    });
  }

  const crossBorderEgressLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
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
      suggestedFix:
        "Add egress validation: if (!approvedJurisdictions.includes(getDestinationRegion(url))) throw new SovereigntyError('Cross-border transfer blocked');",
      confidence: 0.8,
    });
  }

  const replicationLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(\breplica\b|replication|backup|\bdr\b|disaster.?recovery|geo-?redundant|read.?replica)/i.test(line) &&
      !/same.?region|region.?locked|sovereign|local.?zone/i.test(line)
    ) {
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
      suggestedFix:
        "Pin replicas to approved regions: replication: { regions: ALLOWED_REGIONS } and add sovereignty tags to backup configurations.",
      confidence: 0.85,
    });
  }

  const exportLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Skip comment lines — doc blocks describing export policy are not real export paths
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    // Skip JS/TS export keyword declarations (export const, export function, etc.)
    if (/^\s*export\s+(default\s+)?(const|let|var|function|class|interface|type|enum|abstract|async)\b/i.test(line))
      return;
    // Skip env-var / config references that merely name a region or setting
    if (/process\.env\.|import\s|require\s*\(|getenv|os\.environ/i.test(line)) return;
    // Skip lines where 'export' only appears as part of an identifier (e.g., getExportRegion, isExportAllowed)
    if (/export/i.test(line) && !/(?<![a-zA-Z0-9_])export(?![a-zA-Z0-9_])/i.test(line)) return;
    if (
      /(export|download|dump|report|analytics|telemetry|support.?bundle)/i.test(line) &&
      !/redact|anonym|aggregate|jurisdiction|policy|allowed|blocked|guard|check|validate/i.test(line)
    ) {
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
      suggestedFix:
        "Gate export paths with policy checks: if (!exportPolicy.isAllowed(dataClass, targetRegion)) throw new Error('Export blocked by sovereignty policy');",
      confidence: 0.8,
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
      suggestedFix:
        "Add enforcement branches: if (region !== allowedRegion) { throw new PolicyViolationError('Data residency violation'); } before data operations.",
      confidence: 0.75,
    });
  }

  // CDN or third-party asset loading from external origins
  const cdnLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(?:cdn\.|cloudflare|unpkg|jsdelivr|cdnjs|googleapis|bootstrapcdn|cloudfront|akamai|maxcdn|stackpath)/i.test(
        line,
      ) &&
      !/integrity\s*=|crossorigin|nonce|hash/i.test(line)
    ) {
      cdnLines.push(index + 1);
    }
  });

  if (cdnLines.length > 0 && !hasRegionPolicy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "External CDN/third-party assets loaded without integrity checks",
      description:
        "Code loads assets from external CDN origins without Subresource Integrity (SRI) hashes or approved-origin policies. These assets are served from globally distributed infrastructure whose data processing locations may not comply with sovereignty requirements.",
      lineNumbers: cdnLines.slice(0, 10),
      recommendation:
        "Add SRI integrity attributes for CDN-loaded scripts/styles. Maintain an approved CDN origin allowlist. Consider self-hosting critical assets within sovereign infrastructure.",
      reference: "Subresource Integrity (SRI) / Data Sovereignty Asset Controls",
      suggestedFix:
        "Add SRI hashes to CDN assets: <script src='cdn-url' integrity='sha384-...' crossorigin='anonymous'> and maintain an approved CDN origin allowlist.",
      confidence: 0.85,
    });
  }

  // Telemetry / analytics to external services
  const telemetryLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(?:google.?analytics|gtag|mixpanel|segment|amplitude|hotjar|heap|fullstory|posthog|sentry|datadog|newrelic|appinsights|applicationinsights|bugsnag|rollbar|logrocket)/i.test(
        line,
      ) &&
      !/dsn.*localhost|endpoint.*localhost|self.?hosted|on.?premises?/i.test(line)
    ) {
      telemetryLines.push(index + 1);
    }
  });

  if (telemetryLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Telemetry/analytics data sent to external service",
      description:
        "Code integrates with external telemetry or analytics services that may process and store user behavior data, IP addresses, or session information in jurisdictions outside sovereignty boundaries.",
      lineNumbers: telemetryLines.slice(0, 10),
      recommendation:
        "Verify the analytics provider's data residency options and configure region-specific endpoints. Consider self-hosted alternatives (Plausible, Matomo, self-hosted PostHog) for sovereign environments. Ensure DPAs cover data processing locations.",
      reference: "GDPR Articles 44-49 / Telemetry Data Sovereignty",
      suggestedFix:
        "Configure region-specific telemetry endpoints or use self-hosted alternatives (Plausible, self-hosted PostHog). Ensure DPAs cover data processing locations.",
      confidence: 0.85,
    });
  }

  // PII stored without geographic partitioning
  const hasPiiFields =
    /(?:email|phone|ssn|social.?security|date.?of.?birth|address|first.?name|last.?name|national.?id|passport|driver.?license)/i.test(
      code,
    );
  const hasGeoPartitioning =
    /(?:partition|shard|region.*key|tenant.*region|geo.*route|data.*boundary|residency.*tag|region.*id)/i.test(code);
  const hasDbOps = /(?:create|insert|save|store|persist|write|update|upsert|put)/i.test(code);

  if (hasPiiFields && hasDbOps && !hasGeoPartitioning && code.split("\n").length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "PII stored without geographic partitioning indicator",
      description:
        "Code stores PII fields (email, phone, national ID, etc.) with database operations but has no visible geographic partitioning, tenant-region routing, or data boundary tagging. Without explicit geo-aware storage, PII may be co-mingled across jurisdictions.",
      recommendation:
        "Tag PII records with a region/jurisdiction identifier. Use tenant-scoped region routing for multi-tenant systems. Implement database-level partitioning by geography for regulated data.",
      reference: "Data Residency Partitioning / Multi-Tenant Sovereignty",
      suggestedFix:
        "Add region tagging to PII records: { ...userData, _region: tenantRegion } and partition storage by jurisdiction.",
      confidence: 0.8,
    });
  }

  // Region configuration without server-side enforcement
  const hasClientRegionConfig = /(?:region|location|zone)\s*[:=]\s*["'`][^"'`]+["'`]/i.test(code);
  const hasServerValidation =
    /(?:validateRegion|checkRegion|regionGuard|verifyJurisdiction|enforceResidency|assertRegion|regionPolicy)/i.test(
      code,
    );

  if (hasClientRegionConfig && !hasServerValidation && !hasPolicyEnforcement && code.split("\n").length > 15) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Region configuration without server-side enforcement",
      description:
        "A region or location is configured as a string value but no server-side validation or enforcement function is visible. Client-side region settings can be bypassed — sovereignty controls must be enforced server-side.",
      recommendation:
        "Implement server-side region validation that rejects requests targeting unauthorized regions. Use infrastructure-level guardrails (Azure Policy, AWS SCP, GCP Organization Policy) to enforce region boundaries.",
      reference: "Policy-as-Code / Server-Side Sovereignty Enforcement",
      suggestedFix:
        "Add server-side region validation: function validateRegion(region: string) { if (!ALLOWED_REGIONS.includes(region)) throw new Error('Unauthorized region'); }",
      confidence: 0.8,
    });
  }

  if (findings.length === 0 && code.length > 0) {
    const hasDataHandling = /(user|customer|personal|profile|account|email|phone|pii|data)/i.test(code);
    if (hasDataHandling) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "info",
        title: "Sovereignty evidence not explicit in code",
        description:
          "Data handling is present, but sovereignty controls (policy references, jurisdiction checks, transfer guardrails) are not explicitly visible in this code segment.",
        recommendation:
          "Add explicit sovereignty control points in code/config and link them to auditable policy artifacts.",
        reference: "Data Sovereignty Assurance Guidance",
        suggestedFix:
          "Add explicit sovereignty annotations: // @sovereignty: compliant, region=eu-west-1, policy=gdpr-ch5 — and link to auditable policy artifacts.",
        confidence: 0.7,
      });
    }
  }

  return findings;
}
