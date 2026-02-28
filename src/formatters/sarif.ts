/**
 * SARIF 2.1.0 Formatter
 *
 * Converts Judges Panel findings into the SARIF (Static Analysis Results
 * Interchange Format) JSON schema used by GitHub Code Scanning, Azure DevOps,
 * and other CI/CD tools.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import type { Finding, JudgeEvaluation, TribunalVerdict, Severity } from "../types.js";

// ─── SARIF type stubs (minimal subset we emit) ──────────────────────────────

interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
}

interface SarifRun {
  tool: { driver: SarifDriver };
  results: SarifResult[];
}

interface SarifDriver {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: SarifLevel };
  helpUri?: string;
}

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations: SarifLocation[];
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: { startLine: number };
  };
}

type SarifLevel = "error" | "warning" | "note" | "none";

// ─── Severity → SARIF level mapping ─────────────────────────────────────────

function severityToLevel(s: Severity): SarifLevel {
  switch (s) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    case "info":
      return "note";
    default:
      return "note";
  }
}

// ─── Build rule descriptors ─────────────────────────────────────────────────

function buildRules(findings: Finding[]): SarifRule[] {
  const seen = new Map<string, SarifRule>();
  for (const f of findings) {
    if (!seen.has(f.ruleId)) {
      seen.set(f.ruleId, {
        id: f.ruleId,
        name: f.title,
        shortDescription: { text: f.recommendation },
        defaultConfiguration: { level: severityToLevel(f.severity) },
      });
    }
  }
  return [...seen.values()];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert an array of Findings into a SARIF 2.1.0 JSON log.
 *
 * @param findings  - The findings to convert.
 * @param filePath  - The source file these findings originate from (default "source.ts").
 * @param version   - The judges version string (default "2.3.0").
 */
export function findingsToSarif(findings: Finding[], filePath = "source.ts", version = "2.3.0"): SarifLog {
  const results: SarifResult[] = findings.map((f) => ({
    ruleId: f.ruleId,
    level: severityToLevel(f.severity),
    message: { text: `${f.title}: ${f.recommendation}` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: filePath },
          region: { startLine: f.lineNumbers?.[0] ?? 1 },
        },
      },
    ],
  }));

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "judges",
            version,
            informationUri: "https://github.com/KevinRabun/judges",
            rules: buildRules(findings),
          },
        },
        results,
      },
    ],
  };
}

/**
 * Convert a single-judge JudgeEvaluation into SARIF.
 */
export function evaluationToSarif(evaluation: JudgeEvaluation, filePath?: string, version?: string): SarifLog {
  return findingsToSarif(evaluation.findings, filePath, version);
}

/**
 * Convert a full TribunalVerdict (all judges) into SARIF.
 */
export function verdictToSarif(verdict: TribunalVerdict, filePath?: string, version?: string): SarifLog {
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  return findingsToSarif(allFindings, filePath, version);
}
