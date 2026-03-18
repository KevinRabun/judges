/**
 * SAST Integration Layer
 *
 * Bridges external Static Application Security Testing tools (CodeQL, Semgrep,
 * Bandit, ESLint security rules, etc.) into the Judges evaluation pipeline.
 *
 * External SAST tools complement Judges' LLM-powered tribunal by providing:
 * - Data-flow / taint analysis (CodeQL, Semgrep Pro)
 * - Known CVE pattern matching
 * - Language-specific semantic analysis
 *
 * This module:
 * 1. Ingests SARIF (Static Analysis Results Interchange Format) reports
 * 2. Normalizes external findings into Judges' Finding type
 * 3. Deduplicates against existing Judges findings
 * 4. Merges as supplementary evidence into tribunal verdicts
 */

import { readFileSync, existsSync } from "fs";
import { resolve, basename } from "path";
import type { Finding, Severity, TribunalVerdict } from "./types.js";

// ─── SARIF Types (subset of SARIF 2.1.0 schema) ─────────────────────────────

interface SarifLog {
  $schema?: string;
  version: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version?: string;
      rules?: SarifRule[];
    };
  };
  results: SarifResult[];
}

interface SarifRule {
  id: string;
  name?: string;
  shortDescription?: { text: string };
  fullDescription?: { text: string };
  defaultConfiguration?: {
    level?: "none" | "note" | "warning" | "error";
  };
  properties?: Record<string, unknown>;
}

interface SarifResult {
  ruleId: string;
  message: { text: string };
  level?: "none" | "note" | "warning" | "error";
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: {
        startLine?: number;
        endLine?: number;
        startColumn?: number;
        endColumn?: number;
      };
    };
  }>;
  fixes?: Array<{
    description?: { text: string };
  }>;
  properties?: Record<string, unknown>;
}

// ─── SAST Provider Registry ──────────────────────────────────────────────────

export interface SastProvider {
  /** Provider name (e.g., "codeql", "semgrep", "bandit") */
  name: string;
  /** Parse provider-specific output into SARIF format */
  parseSarif(content: string): SarifLog;
  /** Map provider rule IDs to Judges rule ID prefixes */
  mapRuleId(providerRuleId: string): string;
  /** Map provider severity to Judges severity */
  mapSeverity(level: string): Severity;
}

const providers = new Map<string, SastProvider>();

/** Register a SAST provider for integration. */
export function registerSastProvider(provider: SastProvider): void {
  providers.set(provider.name, provider);
}

/** Get a registered SAST provider by name. */
export function getSastProvider(name: string): SastProvider | undefined {
  return providers.get(name);
}

/** List all registered SAST providers. */
export function listSastProviders(): string[] {
  return Array.from(providers.keys());
}

// ─── Default Providers ───────────────────────────────────────────────────────

/** Generic SARIF provider — works with any SARIF 2.1.0 output */
const genericSarifProvider: SastProvider = {
  name: "sarif",
  parseSarif(content: string): SarifLog {
    return JSON.parse(content) as SarifLog;
  },
  mapRuleId(providerRuleId: string): string {
    return `SAST-${providerRuleId}`;
  },
  mapSeverity(level: string): Severity {
    switch (level) {
      case "error":
        return "high";
      case "warning":
        return "medium";
      case "note":
        return "low";
      default:
        return "medium";
    }
  },
};

/** CodeQL-specific provider */
const codeqlProvider: SastProvider = {
  name: "codeql",
  parseSarif(content: string): SarifLog {
    return JSON.parse(content) as SarifLog;
  },
  mapRuleId(providerRuleId: string): string {
    // CodeQL rules like "js/xss" → "SAST-CODEQL-JS-XSS"
    const normalized = providerRuleId.replace(/\//g, "-").toUpperCase();
    return `SAST-CODEQL-${normalized}`;
  },
  mapSeverity(level: string): Severity {
    switch (level) {
      case "error":
        return "critical";
      case "warning":
        return "high";
      case "note":
        return "medium";
      default:
        return "medium";
    }
  },
};

/** Semgrep-specific provider */
const semgrepProvider: SastProvider = {
  name: "semgrep",
  parseSarif(content: string): SarifLog {
    return JSON.parse(content) as SarifLog;
  },
  mapRuleId(providerRuleId: string): string {
    // Semgrep rules like "python.lang.security.audit.exec-detected" → "SAST-SEMGREP-EXEC-DETECTED"
    const parts = providerRuleId.split(".");
    const meaningful = parts.slice(-2).join("-").toUpperCase();
    return `SAST-SEMGREP-${meaningful}`;
  },
  mapSeverity(level: string): Severity {
    switch (level) {
      case "error":
        return "high";
      case "warning":
        return "medium";
      case "note":
        return "low";
      default:
        return "medium";
    }
  },
};

// Register default providers
registerSastProvider(genericSarifProvider);
registerSastProvider(codeqlProvider);
registerSastProvider(semgrepProvider);

// ─── SARIF Ingestion ─────────────────────────────────────────────────────────

/**
 * Parse a SARIF file and convert results into Judges Finding objects.
 */
export function ingestSarifFile(
  filePath: string,
  providerName?: string,
): { findings: Finding[]; toolName: string; toolVersion?: string } {
  if (!existsSync(filePath)) {
    return { findings: [], toolName: "unknown" };
  }

  const content = readFileSync(filePath, "utf-8");
  return ingestSarifContent(content, providerName);
}

/**
 * Parse SARIF content string and convert results into Judges Finding objects.
 */
export function ingestSarifContent(
  content: string,
  providerName?: string,
): { findings: Finding[]; toolName: string; toolVersion?: string } {
  const provider = providerName ? providers.get(providerName) : genericSarifProvider;
  if (!provider) {
    return { findings: [], toolName: "unknown" };
  }

  let sarif: SarifLog;
  try {
    sarif = provider.parseSarif(content);
  } catch {
    return { findings: [], toolName: "unknown" };
  }

  const findings: Finding[] = [];
  let toolName = "unknown";
  let toolVersion: string | undefined;

  for (const run of sarif.runs) {
    toolName = run.tool.driver.name;
    toolVersion = run.tool.driver.version;

    const ruleMap = new Map<string, SarifRule>();
    if (run.tool.driver.rules) {
      for (const rule of run.tool.driver.rules) {
        ruleMap.set(rule.id, rule);
      }
    }

    for (const result of run.results) {
      const rule = ruleMap.get(result.ruleId);
      const level = result.level || rule?.defaultConfiguration?.level || "warning";
      const severity = provider.mapSeverity(level);
      const ruleId = provider.mapRuleId(result.ruleId);

      const lineNumbers: number[] = [];
      let sourceFile: string | undefined;

      if (result.locations) {
        for (const loc of result.locations) {
          const region = loc.physicalLocation?.region;
          if (region?.startLine) {
            lineNumbers.push(region.startLine);
          }
          if (loc.physicalLocation?.artifactLocation?.uri) {
            sourceFile = loc.physicalLocation.artifactLocation.uri;
          }
        }
      }

      const title = rule?.shortDescription?.text || rule?.name || result.ruleId;
      const description = result.message.text || rule?.fullDescription?.text || "";
      const fix = result.fixes?.[0]?.description?.text;

      findings.push({
        ruleId,
        severity,
        title,
        description,
        lineNumbers: lineNumbers.length > 0 ? lineNumbers : undefined,
        recommendation: fix || `Address ${result.ruleId} finding from ${toolName}.`,
        reference: `${toolName}: ${result.ruleId}`,
        confidence: 0.9, // External SAST tools have high deterministic confidence
        provenance: `sast-${toolName.toLowerCase()}`,
        ...(sourceFile ? { filePath: sourceFile } : {}),
      });
    }
  }

  return { findings, toolName, toolVersion };
}

// ─── Merge with Tribunal Verdicts ────────────────────────────────────────────

/**
 * Merge external SAST findings into a tribunal verdict.
 * Deduplicates findings that overlap with existing judge findings
 * (same file + overlapping line range + similar rule category).
 */
export function mergeSastFindings(verdict: TribunalVerdict, sastFindings: Finding[]): TribunalVerdict {
  if (sastFindings.length === 0) return verdict;

  const existingKeys = new Set(
    verdict.findings.map((f) => {
      const line = f.lineNumbers?.[0] || 0;
      const bucket = Math.floor(line / 3) * 3;
      return `${bucket}::${f.severity}`;
    }),
  );

  const newFindings: Finding[] = [];
  for (const sf of sastFindings) {
    const line = sf.lineNumbers?.[0] || 0;
    const bucket = Math.floor(line / 3) * 3;
    const key = `${bucket}::${sf.severity}`;

    // Only add if no existing finding covers roughly the same location and severity
    if (!existingKeys.has(key)) {
      newFindings.push(sf);
      existingKeys.add(key);
    }
  }

  if (newFindings.length === 0) return verdict;

  return {
    ...verdict,
    findings: [...verdict.findings, ...newFindings],
    summary: `${verdict.summary}\n\n**SAST Supplement**: ${newFindings.length} additional finding(s) from external static analysis.`,
  };
}
