/**
 * Regulatory Scope — Framework-aware finding filtering.
 *
 * When `regulatoryScope` is set in `.judgesrc`, findings whose `reference`
 * field cites ONLY out-of-scope frameworks are suppressed. Findings that
 * cite at least one in-scope framework (or have no regulatory reference)
 * are kept.
 */

import type { Finding } from "./types.js";

// ─── Framework Definitions ──────────────────────────────────────────────────

/**
 * Each supported framework has:
 * - `id`: The canonical identifier used in `.judgesrc`
 * - `aliases`: Alternative names/abbreviations that may appear in finding references
 * - `description`: Human-readable label
 */
interface RegulatoryFramework {
  id: string;
  aliases: string[];
  description: string;
}

const FRAMEWORKS: RegulatoryFramework[] = [
  {
    id: "GDPR",
    aliases: [
      "gdpr",
      "general data protection",
      "article 5",
      "article 6",
      "article 8",
      "article 17",
      "article 22",
      "article 32",
      "chapter v",
      "data protection regulation",
    ],
    description: "EU General Data Protection Regulation",
  },
  {
    id: "CCPA",
    aliases: ["ccpa", "california consumer privacy", "cpra", "right to delete"],
    description: "California Consumer Privacy Act",
  },
  {
    id: "HIPAA",
    aliases: [
      "hipaa",
      "health insurance portability",
      "phi",
      "protected health information",
      "45 cfr",
      "security rule",
      "minimum necessary",
    ],
    description: "Health Insurance Portability and Accountability Act",
  },
  {
    id: "PCI-DSS",
    aliases: ["pci", "pci dss", "pci-dss", "payment card", "cardholder data", "requirement 3"],
    description: "Payment Card Industry Data Security Standard",
  },
  {
    id: "SOC2",
    aliases: ["soc 2", "soc2", "trust service", "cc6", "cc7"],
    description: "SOC 2 Trust Service Criteria",
  },
  {
    id: "SOX",
    aliases: ["sox", "sarbanes-oxley", "sarbanes oxley"],
    description: "Sarbanes-Oxley Act",
  },
  {
    id: "COPPA",
    aliases: ["coppa", "children.*online privacy", "age appropriate design"],
    description: "Children's Online Privacy Protection Act",
  },
  {
    id: "FERPA",
    aliases: ["ferpa", "family educational rights"],
    description: "Family Educational Rights and Privacy Act",
  },
  {
    id: "FedRAMP",
    aliases: ["fedramp", "fed ramp", "federal risk"],
    description: "Federal Risk and Authorization Management Program",
  },
  {
    id: "NIST",
    aliases: ["nist", "sp 800", "800-53", "800-63", "800-131", "800-122", "ssdf"],
    description: "NIST Cybersecurity Framework & Special Publications",
  },
  {
    id: "ISO27001",
    aliases: ["iso 27001", "iso27001", "iso/iec 27001"],
    description: "ISO/IEC 27001 Information Security Management",
  },
  {
    id: "ePrivacy",
    aliases: ["eprivacy", "e-privacy", "cookie.*directive", "eprivacy directive"],
    description: "EU ePrivacy Directive",
  },
  {
    id: "DORA",
    aliases: ["dora", "digital operational resilience"],
    description: "Digital Operational Resilience Act",
  },
  {
    id: "NIS2",
    aliases: ["nis2", "nis 2", "network.*information.*security"],
    description: "Network and Information Security Directive 2",
  },
  {
    id: "EU-AI-Act",
    aliases: ["eu ai act", "ai act", "artificial intelligence act"],
    description: "EU Artificial Intelligence Act",
  },
  {
    id: "LGPD",
    aliases: ["lgpd", "lei geral.*prote"],
    description: "Brazil General Data Protection Law",
  },
  {
    id: "PIPEDA",
    aliases: ["pipeda", "personal information protection.*electronic"],
    description: "Canada Personal Information Protection and Electronic Documents Act",
  },
];

/** Look up supported framework IDs for listing/validation. */
export function getSupportedFrameworks(): Array<{ id: string; description: string }> {
  return FRAMEWORKS.map((f) => ({ id: f.id, description: f.description }));
}

// ─── Framework Detection in Finding References ──────────────────────────────

/**
 * Detect which regulatory frameworks a finding references.
 * Checks the `reference` and `description` fields for framework aliases.
 */
function detectFrameworks(finding: Finding): Set<string> {
  const detected = new Set<string>();
  const text = `${finding.reference ?? ""} ${finding.description ?? ""}`.toLowerCase();

  if (!text.trim()) return detected;

  for (const fw of FRAMEWORKS) {
    for (const alias of fw.aliases) {
      if (text.includes(alias.toLowerCase())) {
        detected.add(fw.id);
        break;
      }
    }
  }

  return detected;
}

// ─── Regulatory Scope Filter ────────────────────────────────────────────────

/**
 * Filter findings based on `regulatoryScope`. Findings that cite ONLY
 * out-of-scope frameworks are suppressed. Findings with no regulatory
 * reference or with at least one in-scope framework are kept.
 *
 * @param findings - All findings from the tribunal
 * @param scope - Array of framework IDs (e.g. ["GDPR", "PCI-DSS"])
 * @returns Object with kept findings and count of suppressed findings
 */
export function filterByRegulatoryScope(
  findings: Finding[],
  scope: string[],
): { findings: Finding[]; suppressed: number } {
  if (!scope || scope.length === 0) {
    return { findings, suppressed: 0 };
  }

  const scopeSet = new Set(scope.map((s) => s.toUpperCase()));
  // Normalize framework IDs (e.g. "pci-dss" → "PCI-DSS")
  const normalizedScope = new Set<string>();
  for (const id of scopeSet) {
    const fw = FRAMEWORKS.find((f) => f.id.toUpperCase() === id);
    if (fw) normalizedScope.add(fw.id);
  }

  let suppressed = 0;
  const kept: Finding[] = [];

  for (const finding of findings) {
    const cited = detectFrameworks(finding);

    if (cited.size === 0) {
      // No regulatory reference — keep (it's a general code quality finding)
      kept.push(finding);
    } else {
      // Has regulatory reference — keep only if at least one is in scope
      const hasInScope = [...cited].some((id) => normalizedScope.has(id));
      if (hasInScope) {
        kept.push(finding);
      } else {
        suppressed++;
      }
    }
  }

  return { findings: kept, suppressed };
}
