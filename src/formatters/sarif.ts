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
  properties?: { tags?: string[] };
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
      const tags: string[] = [];
      if (f.cweIds) tags.push(...f.cweIds);
      if (f.owaspIds) tags.push(...f.owaspIds.map((id) => `OWASP-${id}`));

      seen.set(f.ruleId, {
        id: f.ruleId,
        name: f.title,
        shortDescription: { text: f.recommendation },
        defaultConfiguration: { level: severityToLevel(f.severity) },
        ...(f.learnMoreUrl ? { helpUri: f.learnMoreUrl } : {}),
        ...(tags.length > 0 ? { properties: { tags } } : {}),
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
  const results: SarifResult[] = findings.map((f) => {
    const props: Record<string, unknown> = {};
    if (f.confidence !== undefined) props.confidence = f.confidence;
    if (f.provenance) props.provenance = f.provenance;
    if (f.evidenceBasis) props.evidenceBasis = f.evidenceBasis;
    if (f.evidenceChain) props.evidenceChain = f.evidenceChain;
    if (f.owaspLlmTop10) props.owaspLlmTop10 = f.owaspLlmTop10;

    const result: SarifResult = {
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
    };
    if (Object.keys(props).length > 0) {
      (result as unknown as Record<string, unknown>).properties = props;
    }
    return result;
  });

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

// ─── SARIF 2.1.0 Structural Validator ────────────────────────────────────────

/**
 * Validation error returned by validateSarifLog.
 */
export interface SarifValidationError {
  path: string;
  message: string;
}

const VALID_SARIF_LEVELS = new Set(["error", "warning", "note", "none"]);

/**
 * Validate that a JSON object structurally conforms to the SARIF 2.1.0 schema.
 * This is a lightweight check of all mandatory properties and value constraints
 * without requiring the full JSON Schema or ajv dependency.
 *
 * @returns Array of validation errors (empty = valid)
 */
export function validateSarifLog(log: unknown): SarifValidationError[] {
  const errors: SarifValidationError[] = [];

  if (typeof log !== "object" || log === null || Array.isArray(log)) {
    errors.push({ path: "$", message: "Root must be a non-null object" });
    return errors;
  }

  const obj = log as Record<string, unknown>;

  // Top-level required properties
  if (obj.version !== "2.1.0") {
    errors.push({ path: "$.version", message: `Must be "2.1.0", got ${JSON.stringify(obj.version)}` });
  }

  if (typeof obj.$schema !== "string" || !obj.$schema) {
    errors.push({ path: "$.$schema", message: "Must be a non-empty string URI" });
  }

  if (!Array.isArray(obj.runs)) {
    errors.push({ path: "$.runs", message: "Must be an array" });
    return errors;
  }

  if (obj.runs.length === 0) {
    errors.push({ path: "$.runs", message: "Must contain at least one run" });
    return errors;
  }

  // Validate each run
  for (let ri = 0; ri < obj.runs.length; ri++) {
    const run = obj.runs[ri] as Record<string, unknown>;
    const rp = `$.runs[${ri}]`;

    if (typeof run !== "object" || run === null) {
      errors.push({ path: rp, message: "Run must be a non-null object" });
      continue;
    }

    // tool.driver is required
    const tool = run.tool as Record<string, unknown> | undefined;
    if (typeof tool !== "object" || tool === null) {
      errors.push({ path: `${rp}.tool`, message: "Required object" });
      continue;
    }

    const driver = tool.driver as Record<string, unknown> | undefined;
    if (typeof driver !== "object" || driver === null) {
      errors.push({ path: `${rp}.tool.driver`, message: "Required object" });
      continue;
    }

    if (typeof driver.name !== "string" || !driver.name) {
      errors.push({ path: `${rp}.tool.driver.name`, message: "Required non-empty string" });
    }

    // rules array (optional per spec, but we always emit it)
    if (driver.rules !== undefined) {
      if (!Array.isArray(driver.rules)) {
        errors.push({ path: `${rp}.tool.driver.rules`, message: "Must be an array if present" });
      } else {
        for (let rri = 0; rri < driver.rules.length; rri++) {
          const rule = driver.rules[rri] as Record<string, unknown>;
          const rrp = `${rp}.tool.driver.rules[${rri}]`;

          if (typeof rule.id !== "string" || !rule.id) {
            errors.push({ path: `${rrp}.id`, message: "Required non-empty string" });
          }

          if (rule.shortDescription !== undefined) {
            const sd = rule.shortDescription as Record<string, unknown>;
            if (typeof sd !== "object" || typeof sd.text !== "string") {
              errors.push({ path: `${rrp}.shortDescription.text`, message: "Must be a string" });
            }
          }

          if (rule.defaultConfiguration !== undefined) {
            const dc = rule.defaultConfiguration as Record<string, unknown>;
            if (typeof dc === "object" && dc !== null && dc.level !== undefined) {
              if (!VALID_SARIF_LEVELS.has(dc.level as string)) {
                errors.push({
                  path: `${rrp}.defaultConfiguration.level`,
                  message: `Must be one of: error, warning, note, none. Got ${JSON.stringify(dc.level)}`,
                });
              }
            }
          }
        }
      }
    }

    // results array
    if (!Array.isArray(run.results)) {
      errors.push({ path: `${rp}.results`, message: "Required array" });
      continue;
    }

    for (let si = 0; si < run.results.length; si++) {
      const result = run.results[si] as Record<string, unknown>;
      const sp = `${rp}.results[${si}]`;

      if (typeof result.ruleId !== "string") {
        errors.push({ path: `${sp}.ruleId`, message: "Must be a string" });
      }

      if (result.level !== undefined && !VALID_SARIF_LEVELS.has(result.level as string)) {
        errors.push({
          path: `${sp}.level`,
          message: `Must be one of: error, warning, note, none. Got ${JSON.stringify(result.level)}`,
        });
      }

      // message.text is required
      const msg = result.message as Record<string, unknown> | undefined;
      if (typeof msg !== "object" || msg === null || typeof msg.text !== "string") {
        errors.push({ path: `${sp}.message.text`, message: "Required string" });
      }

      // locations array (optional per spec but we always emit)
      if (result.locations !== undefined) {
        if (!Array.isArray(result.locations)) {
          errors.push({ path: `${sp}.locations`, message: "Must be an array if present" });
        } else {
          for (let li = 0; li < result.locations.length; li++) {
            const loc = result.locations[li] as Record<string, unknown>;
            const lp = `${sp}.locations[${li}]`;
            const phys = loc?.physicalLocation as Record<string, unknown> | undefined;

            if (typeof phys !== "object" || phys === null) {
              errors.push({ path: `${lp}.physicalLocation`, message: "Required object" });
              continue;
            }

            const art = phys.artifactLocation as Record<string, unknown> | undefined;
            if (typeof art !== "object" || typeof art?.uri !== "string") {
              errors.push({ path: `${lp}.physicalLocation.artifactLocation.uri`, message: "Required string" });
            }

            const reg = phys.region as Record<string, unknown> | undefined;
            if (reg !== undefined) {
              if (typeof reg.startLine !== "number" || reg.startLine < 1) {
                errors.push({
                  path: `${lp}.physicalLocation.region.startLine`,
                  message: "Must be a positive integer",
                });
              }
            }
          }
        }
      }
    }
  }

  return errors;
}
