import { parseLlmRuleIds } from "../commands/llm-benchmark.js";
import type { Severity } from "../types.js";
import { severityRank } from "../dedup.js";

export interface LlmFinding {
  ruleId: string;
  severity: Severity;
  title?: string;
  description?: string;
  recommendation?: string;
  raw?: unknown;
}

export interface ValidationResult {
  findings: LlmFinding[];
  ruleIds: string[];
  errors: string[];
}

const SEVERITY_SET: Set<string> = new Set(["critical", "high", "medium", "low", "info"]);

/**
 * Attempt to parse a JSON payload embedded in LLM output. Supports fenced code blocks and raw JSON.
 */
function parseJsonBlock(text: string): unknown | undefined {
  const fenceMatch =
    text.match(/```(?:json)?[ \t]*\n([\s\S]*?)\n[ \t]*```/i) ?? text.match(/```(?:json)?[ \t]*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function normalizeRuleId(id: string): string {
  return id.trim().toUpperCase();
}

function isValidRuleId(id: string, validPrefixes: Set<string>): boolean {
  const match = id.match(/^([A-Z]{2,})-\d{3}$/);
  if (!match) return false;
  return validPrefixes.has(match[1]);
}

function normalizeSeverity(sev: unknown): Severity | undefined {
  if (typeof sev !== "string") return undefined;
  const lower = sev.toLowerCase();
  return SEVERITY_SET.has(lower) ? (lower as Severity) : undefined;
}

/**
 * Validate structured findings array.
 */
export function validateStructuredFindings(structured: unknown, validPrefixes: Set<string>): ValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(structured)) {
    errors.push("LLM output is not an array of findings");
    return { findings: [], ruleIds: [], errors };
  }

  const findings: LlmFinding[] = [];
  const ruleIds: string[] = [];

  structured.forEach((raw, idx) => {
    if (typeof raw !== "object" || raw === null) {
      errors.push(`Finding #${idx} is not an object`);
      return;
    }
    const obj = raw as Record<string, unknown>;
    const ruleIdRaw = obj.ruleId ?? obj.ruleID ?? obj.rule_id ?? obj.id;
    if (typeof ruleIdRaw !== "string") {
      errors.push(`Finding #${idx} missing ruleId`);
      return;
    }
    const ruleId = normalizeRuleId(ruleIdRaw);
    if (!isValidRuleId(ruleId, validPrefixes)) {
      errors.push(`Finding #${idx} has invalid ruleId: ${ruleId}`);
      return;
    }

    const severity = normalizeSeverity(obj.severity);
    if (!severity) {
      errors.push(`Finding #${idx} has invalid severity: ${String(obj.severity)}`);
      return;
    }

    findings.push({
      ruleId,
      severity,
      title: typeof obj.title === "string" ? obj.title : undefined,
      description: typeof obj.description === "string" ? obj.description : undefined,
      recommendation: typeof obj.recommendation === "string" ? obj.recommendation : undefined,
      raw,
    });
    ruleIds.push(ruleId);
  });

  return { findings, ruleIds, errors };
}

/**
 * Extract findings from free-form text. Tries structured JSON first, else regex fallback.
 */
export function extractAndValidateLlmFindings(response: string, validPrefixes: Set<string>): ValidationResult {
  const errors: string[] = [];
  const structured = parseJsonBlock(response);
  if (structured !== undefined) {
    const result = validateStructuredFindings(structured, validPrefixes);
    return result;
  }

  // Fallback: regex rule ID extraction with prefix filtering
  const ruleIds = parseLlmRuleIds(response);
  const invalid = ruleIds.filter((id) => !isValidRuleId(id, validPrefixes));
  if (invalid.length) {
    errors.push(`Invalid rule IDs found in text: ${invalid.join(", ")}`);
  }
  const validRuleIds = ruleIds.filter((id) => isValidRuleId(id, validPrefixes));
  const deduped = [...new Set(validRuleIds)];
  const findings: LlmFinding[] = deduped.map((ruleId) => ({ ruleId, severity: "medium" }));
  return { findings, ruleIds: deduped, errors };
}

/**
 * Merge structured findings with fallback rule IDs; keep highest severity per rule.
 */
export function mergeFindings(primary: ValidationResult, fallbackRuleIds: string[]): ValidationResult {
  const map = new Map<string, LlmFinding>();
  const push = (f: LlmFinding) => {
    const existing = map.get(f.ruleId);
    if (!existing) return map.set(f.ruleId, f);
    // keep higher severity if both exist
    if (severityRank(f.severity) < severityRank(existing.severity)) {
      map.set(f.ruleId, f);
    }
  };

  primary.findings.forEach(push);
  fallbackRuleIds.forEach((rid) => push({ ruleId: rid, severity: "medium" }));

  const merged = [...map.values()];
  return { findings: merged, ruleIds: merged.map((f) => f.ruleId), errors: primary.errors };
}
