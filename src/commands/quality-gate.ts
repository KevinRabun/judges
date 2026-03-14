/**
 * `judges quality-gate` — Configurable composite quality gates.
 *
 * Defines and evaluates multi-dimensional quality gates for CI pipelines.
 * Goes beyond simple severity counts — supports score thresholds, specific
 * rule requirements, trend-based gates, and custom composite conditions.
 *
 * Usage:
 *   judges quality-gate --file src/app.ts                    # Evaluate default gate
 *   judges quality-gate --file src/app.ts --gate strict      # Named gate definition
 *   judges quality-gate --file src/app.ts --json             # JSON output
 *
 * Configuration in .judgesrc:
 * ```json
 * {
 *   "qualityGates": {
 *     "default": {
 *       "maxFindings": { "critical": 0, "high": 2 },
 *       "minScore": 70,
 *       "requiredJudges": ["cybersecurity", "data-security"],
 *       "maxFpRate": 0.3
 *     },
 *     "strict": {
 *       "maxFindings": { "critical": 0, "high": 0, "medium": 5 },
 *       "minScore": 85,
 *       "requiredJudges": ["cybersecurity", "data-security", "authentication"]
 *     }
 *   }
 * }
 * ```
 */

import { existsSync, readFileSync } from "fs";
import { extname } from "path";
import { evaluateWithTribunal } from "../evaluators/index.js";
import type { Severity, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QualityGateDefinition {
  /** Maximum allowed findings by severity — exceeding any triggers failure */
  maxFindings?: Partial<Record<Severity, number>>;
  /** Minimum aggregated score (0-100) */
  minScore?: number;
  /** Judge IDs that must participate in evaluation */
  requiredJudges?: string[];
  /** Maximum false-positive rate allowed (0-1) — requires feedback data */
  maxFpRate?: number;
  /** Required rules that must not be violated — listing a rule ID means zero violations */
  blockerRules?: string[];
  /** Minimum percentage of findings that must have auto-fix patches */
  minFixRate?: number;
  /** Minimum average confidence score for findings (0-1) */
  minConfidence?: number;
}

export interface QualityGateResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Named gate that was evaluated */
  gateName: string;
  /** Individual check results */
  checks: QualityGateCheck[];
  /** Verdict summary */
  summary: string;
}

export interface QualityGateCheck {
  /** Check name */
  name: string;
  /** Pass/fail */
  passed: boolean;
  /** Descriptive message */
  message: string;
}

// ─── Gate Evaluation ────────────────────────────────────────────────────────

const SEVERITY_LEVELS: Severity[] = ["critical", "high", "medium", "low", "info"];

export function evaluateQualityGate(
  gate: QualityGateDefinition,
  gateName: string,
  verdict: TribunalVerdict,
  fpRateByRule?: Map<string, number>,
): QualityGateResult {
  const checks: QualityGateCheck[] = [];

  // Check max findings by severity
  if (gate.maxFindings) {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of verdict.findings) {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    }

    for (const sev of SEVERITY_LEVELS) {
      const max = gate.maxFindings[sev];
      if (max !== undefined) {
        const actual = counts[sev];
        checks.push({
          name: `max-${sev}`,
          passed: actual <= max,
          message: `${sev} findings: ${actual}/${max} allowed`,
        });
      }
    }
  }

  // Check minimum score
  if (gate.minScore !== undefined) {
    checks.push({
      name: "min-score",
      passed: verdict.overallScore >= gate.minScore,
      message: `Score: ${verdict.overallScore}/${gate.minScore} required`,
    });
  }

  // Check required judges participated
  if (gate.requiredJudges) {
    const participatingJudges = new Set(verdict.evaluations.map((e) => e.judgeId));
    for (const required of gate.requiredJudges) {
      checks.push({
        name: `required-judge-${required}`,
        passed: participatingJudges.has(required),
        message: `Judge "${required}": ${participatingJudges.has(required) ? "participated" : "MISSING"}`,
      });
    }
  }

  // Check blocker rules
  if (gate.blockerRules) {
    const violatedRules = new Set(verdict.findings.map((f) => f.ruleId));
    for (const rule of gate.blockerRules) {
      const violated = violatedRules.has(rule);
      checks.push({
        name: `blocker-${rule}`,
        passed: !violated,
        message: `Blocker rule ${rule}: ${violated ? "VIOLATED" : "clear"}`,
      });
    }
  }

  // Check max FP rate
  if (gate.maxFpRate !== undefined && fpRateByRule) {
    const avgFpRate =
      fpRateByRule.size > 0 ? Array.from(fpRateByRule.values()).reduce((sum, r) => sum + r, 0) / fpRateByRule.size : 0;
    checks.push({
      name: "max-fp-rate",
      passed: avgFpRate <= gate.maxFpRate,
      message: `FP rate: ${(avgFpRate * 100).toFixed(1)}%/${(gate.maxFpRate * 100).toFixed(1)}% allowed`,
    });
  }

  // Check min fix rate
  if (gate.minFixRate !== undefined) {
    const fixable = verdict.findings.filter((f) => f.patch).length;
    const total = verdict.findings.length;
    const fixRate = total > 0 ? fixable / total : 1;
    checks.push({
      name: "min-fix-rate",
      passed: fixRate >= gate.minFixRate,
      message: `Fix rate: ${(fixRate * 100).toFixed(1)}%/${(gate.minFixRate * 100).toFixed(1)}% required`,
    });
  }

  // Check min confidence
  if (gate.minConfidence !== undefined) {
    const confidences = verdict.findings.filter((f) => f.confidence !== undefined).map((f) => f.confidence!);
    const avgConf = confidences.length > 0 ? confidences.reduce((s, c) => s + c, 0) / confidences.length : 1;
    checks.push({
      name: "min-confidence",
      passed: avgConf >= gate.minConfidence,
      message: `Avg confidence: ${(avgConf * 100).toFixed(1)}%/${(gate.minConfidence * 100).toFixed(1)}% required`,
    });
  }

  const passed = checks.every((c) => c.passed);
  const failed = checks.filter((c) => !c.passed);

  return {
    passed,
    gateName,
    checks,
    summary: passed
      ? `Quality gate "${gateName}" PASSED — all ${checks.length} check(s) passed`
      : `Quality gate "${gateName}" FAILED — ${failed.length}/${checks.length} check(s) failed`,
  };
}

// ─── Config Parsing ─────────────────────────────────────────────────────────

export function parseQualityGateConfig(
  obj: Record<string, unknown>,
): Record<string, QualityGateDefinition> | undefined {
  if (!obj.qualityGates) return undefined;

  const raw = obj.qualityGates as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;

  const gates: Record<string, QualityGateDefinition> = {};

  for (const [name, def] of Object.entries(raw)) {
    if (typeof def !== "object" || def === null) continue;
    const d = def as Record<string, unknown>;
    const gate: QualityGateDefinition = {};

    if (d.maxFindings && typeof d.maxFindings === "object") {
      gate.maxFindings = d.maxFindings as Partial<Record<Severity, number>>;
    }
    if (typeof d.minScore === "number") gate.minScore = d.minScore;
    if (Array.isArray(d.requiredJudges)) gate.requiredJudges = d.requiredJudges as string[];
    if (typeof d.maxFpRate === "number") gate.maxFpRate = d.maxFpRate;
    if (Array.isArray(d.blockerRules)) gate.blockerRules = d.blockerRules as string[];
    if (typeof d.minFixRate === "number") gate.minFixRate = d.minFixRate;
    if (typeof d.minConfidence === "number") gate.minConfidence = d.minConfidence;

    gates[name] = gate;
  }

  return Object.keys(gates).length > 0 ? gates : undefined;
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
};

export function runQualityGate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges quality-gate — Evaluate configurable quality gates

Usage:
  judges quality-gate --file <path>              Evaluate default gate
  judges quality-gate --file <path> --gate <name> Use a named gate definition
  judges quality-gate --json                      JSON output

Configuration (.judgesrc):
  "qualityGates": {
    "default": {
      "maxFindings": { "critical": 0, "high": 2 },
      "minScore": 70,
      "requiredJudges": ["cybersecurity"],
      "blockerRules": ["SEC-001", "AUTH-001"]
    }
  }

Options:
  --file, -f <path>    File to evaluate
  --gate <name>        Gate name (default: "default")
  --json               JSON output
  --help, -h           Show this help
`);
    return;
  }

  const file = argv.find((_a, i) => argv[i - 1] === "--file" || argv[i - 1] === "-f");
  const gateName = argv.find((_a, i) => argv[i - 1] === "--gate") || "default";
  const jsonFormat = argv.includes("--json");

  if (!file) {
    console.error("Error: --file is required.");
    process.exit(1);
  }

  if (!existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
  }

  // Load quality gate config from .judgesrc
  let gates: Record<string, QualityGateDefinition> | undefined;
  for (const name of [".judgesrc", ".judgesrc.json"]) {
    if (existsSync(name)) {
      try {
        const raw = JSON.parse(readFileSync(name, "utf-8")) as Record<string, unknown>;
        gates = parseQualityGateConfig(raw);
      } catch {
        // Skip invalid config
      }
      break;
    }
  }

  // Use a sensible default gate if none configured
  const gate: QualityGateDefinition = gates?.[gateName] ?? {
    maxFindings: { critical: 0, high: 3 },
    minScore: 60,
  };

  // Evaluate
  const code = readFileSync(file, "utf-8");
  const lang = EXT_TO_LANG[extname(file)] || "typescript";
  const verdict = evaluateWithTribunal(code, lang);

  // Load FP rates if available
  let fpRateByRule: Map<string, number> | undefined;
  try {
    const { loadFeedbackStore, getFpRateByRule: getFpRate } = require("./feedback.js");
    const store = loadFeedbackStore();
    const rates = getFpRate(store);
    fpRateByRule = rates instanceof Map ? rates : new Map(Object.entries(rates));
  } catch {
    // Feedback data not available
  }

  const result = evaluateQualityGate(gate, gateName, verdict, fpRateByRule);

  if (jsonFormat) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const icon = result.passed ? "✅" : "❌";
    console.log(`\n  ${icon} ${result.summary}\n`);
    for (const check of result.checks) {
      const checkIcon = check.passed ? "  ✓" : "  ✗";
      console.log(`  ${checkIcon} ${check.message}`);
    }
    console.log("");
  }

  if (!result.passed) {
    process.exit(1);
  }
}
