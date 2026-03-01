// ─── Evaluators Module ───────────────────────────────────────────────────────
// Re-exports the evaluation engine: analyser routing, scoring, formatting.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  JudgeDefinition,
  JudgeEvaluation,
  TribunalVerdict,
  ProjectVerdict,
  DiffVerdict,
  Finding,
  Severity,
  Verdict,
  MustFixGateOptions,
  JudgesConfig,
} from "../types.js";
import { JUDGES } from "../judges/index.js";
import { analyzeStructure } from "../ast/index.js";
import { analyzeTaintFlows } from "../ast/index.js";
import type { CodeStructure, FunctionInfo } from "../ast/types.js";
import type { TaintFlow } from "../ast/taint-tracker.js";
import { LRUCache, contentHash } from "../cache.js";

// ─── Shared Utilities ────────────────────────────────────────────────────────
import {
  calculateScore,
  deriveVerdict,
  buildSummary,
  buildTribunalSummary,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
  classifyFile,
  shouldRunAbsenceRules,
  applyConfig,
  applyFrameworkAwareness,
} from "./shared.js";

// ─── Extracted Modules ───────────────────────────────────────────────────────
import { evaluateMustFixGate, clampConfidence, applyConfidenceThreshold, isAbsenceBasedFinding } from "../scoring.js";
import { enrichWithPatches } from "../patches/index.js";
import { crossEvaluatorDedup } from "../dedup.js";

// ─── Individual Analyzers ────────────────────────────────────────────────────
// NOTE: Analyzer functions are now registered directly on each JudgeDefinition
// via the judge.analyze property (wired in judges/index.ts). The central
// dispatch switch has been replaced by a single `judge.analyze(code, language)`
// call, eliminating the need for imports here.

// ─── Evaluation Engine ──────────────────────────────────────────────────────

export interface EvaluationOptions {
  includeAstFindings?: boolean;
  minConfidence?: number;
  mustFixGate?: MustFixGateOptions;
  /** Optional file path — used for file-type gating to suppress absence-based rules on non-server files */
  filePath?: string;
  /** Optional config for rule/judge/severity filtering (.judgesrc) */
  config?: JudgesConfig;
  /** @internal — pre-computed AST structure for the file (set by evaluateWithTribunal) */
  _astCache?: CodeStructure;
  /** @internal — pre-computed taint flows for the file (set by evaluateWithTribunal) */
  _taintFlows?: TaintFlow[];
}

// ── AST-aware post-processing ───────────────────────────────────────────────

// ── Module-level caches for AST/taint results ───────────────────────────────
const astStructureCache = new LRUCache<CodeStructure>(256);
const taintFlowCache = new LRUCache<TaintFlow[]>(256);

/** Clear all internal evaluation caches. Useful in tests or after large runs. */
export function clearEvaluationCaches(): void {
  astStructureCache.clear();
  taintFlowCache.clear();
}

/**
 * Known sanitization/security library names. When one is imported, related
 * findings can have confidence reduced because the developer has taken steps
 * to mitigate the issue.
 */
const SECURITY_IMPORTS: Record<string, string[]> = {
  xss: ["dompurify", "sanitize-html", "xss", "isomorphic-dompurify", "xss-filters"],
  headers: ["helmet", "secure-headers", "django-security"],
  rateLimit: ["express-rate-limit", "rate-limiter-flexible", "bottleneck", "limiter", "rate-limit"],
  validation: ["joi", "zod", "yup", "ajv", "class-validator", "express-validator"],
  csrf: ["csurf", "csrf", "csrf-csrf"],
  crypto: ["bcrypt", "argon2", "scrypt"],
  jwt: ["jsonwebtoken", "jose", "passport-jwt"],
};

/**
 * Returns the containing function for a given line number, if any.
 */
function getContainingFunction(line: number, structure: CodeStructure): FunctionInfo | undefined {
  return structure.functions.find((f) => line >= f.startLine && line <= f.endLine);
}

const TEST_FUNCTION_PATTERN =
  /^(?:test|it|describe|beforeEach|afterEach|beforeAll|afterAll|setUp|tearDown|test_|spec_)/i;

// ─── Taint Flow → Finding Matching ───────────────────────────────────────────

/** Map taint-sink kinds to finding title/ruleId patterns they confirm */
const TAINT_SINK_TO_FINDING: Record<string, RegExp> = {
  "code-execution": /eval|code.?inject|code.?exec|dynamic.?code/i,
  "command-exec": /command.?inject|os.?command|shell.?inject|exec/i,
  "sql-query": /sql.?inject|query.?inject|unsanitized.?query/i,
  xss: /xss|cross.?site\s*script|innerhtml|html.?inject/i,
  "path-traversal": /path.?travers|directory.?travers|file.?inclu/i,
  redirect: /open.?redirect|unvalidated.?redirect/i,
  deserialization: /deseri|unsafe.?parse|untrusted.?data.?parse/i,
  template: /template.?inject|ssti/i,
};

/**
 * Apply AST-aware refinements to findings:
 * - Remove findings on dead code lines
 * - Lower confidence for findings inside test-like functions
 * - Adjust confidence based on imported security libraries
 * - Boost/annotate findings confirmed by taint flow analysis
 */
function applyAstRefinements(findings: Finding[], structure: CodeStructure, taintFlows?: TaintFlow[]): Finding[] {
  const deadSet = new Set(structure.deadCodeLines);
  const importNames = new Set(
    structure.imports
      .map((i) => {
        // Extract package name from path: "@scope/pkg" → "@scope/pkg", "helmet" → "helmet"
        const parts = i.split("/");
        return i.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
      })
      .map((n) => n.toLowerCase()),
  );

  // Determine which security categories have mitigations imported
  const mitigatedCategories = new Set<string>();
  for (const [category, libs] of Object.entries(SECURITY_IMPORTS)) {
    if (libs.some((lib) => importNames.has(lib))) {
      mitigatedCategories.add(category);
    }
  }

  // Build a map of sink lines → taint flows for fast lookup
  const flowsBySinkLine = new Map<number, TaintFlow[]>();
  if (taintFlows) {
    for (const flow of taintFlows) {
      const existing = flowsBySinkLine.get(flow.sink.line) ?? [];
      existing.push(flow);
      flowsBySinkLine.set(flow.sink.line, existing);
    }
  }

  return findings
    .filter((f) => {
      // Remove findings where ALL referenced lines are dead code
      if (f.lineNumbers && f.lineNumbers.length > 0 && f.lineNumbers.every((l) => deadSet.has(l))) {
        return false;
      }
      return true;
    })
    .map((f) => {
      let confidenceAdj = 0;
      let descriptionSuffix = "";

      // Lower confidence for findings inside test-like functions
      if (f.lineNumbers && f.lineNumbers.length > 0) {
        const primaryLine = f.lineNumbers[0];
        const fn = getContainingFunction(primaryLine, structure);
        if (fn && TEST_FUNCTION_PATTERN.test(fn.name)) {
          confidenceAdj -= 0.15;
        }
      }

      // Adjust confidence based on security library imports
      const title = f.title.toLowerCase();
      if (mitigatedCategories.has("xss") && /xss|innerhtml|cross.?site\s*script/i.test(title)) {
        confidenceAdj -= 0.2;
      }
      if (mitigatedCategories.has("headers") && /security\s*header|helmet/i.test(title)) {
        confidenceAdj -= 0.25;
      }
      if (mitigatedCategories.has("rateLimit") && /rate\s*limit|throttl/i.test(title)) {
        confidenceAdj -= 0.2;
      }
      if (mitigatedCategories.has("validation") && /input\s*valid|sanitiz|unsanitized/i.test(title)) {
        confidenceAdj -= 0.15;
      }
      if (mitigatedCategories.has("csrf") && /csrf|cross.?site\s*request/i.test(title)) {
        confidenceAdj -= 0.25;
      }

      // ── Taint flow confirmation ────────────────────────────────────────
      if (taintFlows && taintFlows.length > 0 && f.lineNumbers && f.lineNumbers.length > 0) {
        const matchingFlows = findMatchingTaintFlows(f, flowsBySinkLine);
        if (matchingFlows.length > 0) {
          // Confirmed: user input reaches this sink → boost confidence
          confidenceAdj += 0.2;
          const flow = matchingFlows[0];
          const via =
            flow.intermediates.length > 0 ? ` via ${flow.intermediates.map((i) => i.variable).join(" → ")}` : "";
          descriptionSuffix = `\n\n**Confirmed data flow**: \`${flow.source.expression}\` (line ${flow.source.line})${via} → sink at line ${flow.sink.line}`;
        }
      }

      if (confidenceAdj !== 0 || descriptionSuffix) {
        const currentConf = f.confidence ?? 0.5;
        return {
          ...f,
          confidence: clampConfidence(currentConf + confidenceAdj),
          ...(descriptionSuffix ? { description: (f.description ?? "") + descriptionSuffix } : {}),
        };
      }
      return f;
    });
}

/**
 * Find taint flows that confirm a given finding.
 * Matches by checking if any of the finding's referenced lines correspond to
 * a taint sink and the sink kind matches the finding's topic.
 */
function findMatchingTaintFlows(finding: Finding, flowsBySinkLine: Map<number, TaintFlow[]>): TaintFlow[] {
  if (!finding.lineNumbers || finding.lineNumbers.length === 0) return [];

  const title = (finding.title + " " + (finding.ruleId ?? "")).toLowerCase();
  const matched: TaintFlow[] = [];

  for (const line of finding.lineNumbers) {
    const flows = flowsBySinkLine.get(line);
    if (!flows) continue;

    for (const flow of flows) {
      const pattern = TAINT_SINK_TO_FINDING[flow.sink.kind];
      if (pattern && pattern.test(title)) {
        matched.push(flow);
      }
    }
  }

  return matched;
}

// ── Inline suppression comment support ──────────────────────────────────────

/**
 * Scan source code for inline `// judges-ignore RULE-ID` or
 * `// judges-ignore-next-line RULE-ID` comments. Returns a set of suppressed
 * {ruleId, line} pairs and a set of globally suppressed rule IDs.
 */
function parseInlineSuppressions(code: string): {
  lineSuppressed: Map<number, Set<string>>;
  globalSuppressed: Set<string>;
} {
  const lines = code.split("\n");
  const lineSuppressed = new Map<number, Set<string>>();
  const globalSuppressed = new Set<string>();

  // Pattern: // judges-ignore RULE-ID [, RULE-ID ...]
  //          // judges-ignore-next-line RULE-ID [, RULE-ID ...]
  //          # judges-ignore RULE-ID  (Python, YAML, etc.)
  const suppressPattern = /(?:\/\/|#|\/\*)\s*judges-ignore(?:-next-line)?\s+([\w*,\s-]+)/gi;
  const isNextLine = /judges-ignore-next-line/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    suppressPattern.lastIndex = 0;
    while ((match = suppressPattern.exec(line)) !== null) {
      const ruleIds = match[1].split(/[,\s]+/).filter(Boolean);
      const targetLine = isNextLine.test(match[0]) ? i + 2 : i + 1; // 1-indexed

      for (const ruleId of ruleIds) {
        if (ruleId === "*") {
          // Wildcard: suppress all rules on this line
          const set = lineSuppressed.get(targetLine) ?? new Set();
          set.add("*");
          lineSuppressed.set(targetLine, set);
        } else {
          const set = lineSuppressed.get(targetLine) ?? new Set();
          set.add(ruleId.toUpperCase());
          lineSuppressed.set(targetLine, set);
        }
      }
    }

    // File-level suppression: // judges-file-ignore RULE-ID
    const filePattern = /(?:\/\/|#|\/\*)\s*judges-file-ignore\s+([\w*,\s-]+)/gi;
    let fileMatch;
    filePattern.lastIndex = 0;
    while ((fileMatch = filePattern.exec(line)) !== null) {
      const ruleIds = fileMatch[1].split(/[,\s]+/).filter(Boolean);
      for (const ruleId of ruleIds) {
        globalSuppressed.add(ruleId === "*" ? "*" : ruleId.toUpperCase());
      }
    }
  }

  return { lineSuppressed, globalSuppressed };
}

/**
 * Filter findings based on inline suppression comments in the source code.
 */
export function applyInlineSuppressions(findings: Finding[], code: string): Finding[] {
  const { lineSuppressed, globalSuppressed } = parseInlineSuppressions(code);

  if (lineSuppressed.size === 0 && globalSuppressed.size === 0) {
    return findings;
  }

  return findings.filter((f) => {
    const ruleUpper = f.ruleId.toUpperCase();

    // Check file-level suppression
    if (globalSuppressed.has("*") || globalSuppressed.has(ruleUpper)) {
      return false;
    }
    // Check prefix wildcards: "AUTH-*" suppresses "AUTH-001"
    for (const suppressed of globalSuppressed) {
      if (suppressed.endsWith("-*") && ruleUpper.startsWith(suppressed.slice(0, -1))) {
        return false;
      }
    }

    // Check line-level suppressions
    if (f.lineNumbers && f.lineNumbers.length > 0) {
      for (const lineNum of f.lineNumbers) {
        const suppressed = lineSuppressed.get(lineNum);
        if (suppressed) {
          if (suppressed.has("*") || suppressed.has(ruleUpper)) {
            return false;
          }
          for (const s of suppressed) {
            if (s.endsWith("-*") && ruleUpper.startsWith(s.slice(0, -1))) {
              return false;
            }
          }
        }
      }
    }

    return true;
  });
}

function resolveJudgeSet(options?: EvaluationOptions): JudgeDefinition[] {
  const includeAstFindings = options?.includeAstFindings ?? true;
  let judges = includeAstFindings ? JUDGES : JUDGES.filter((judge) => judge.id !== "code-structure");

  // Apply config-based judge filtering
  if (options?.config?.disabledJudges && options.config.disabledJudges.length > 0) {
    const disabled = new Set(options.config.disabledJudges);
    judges = judges.filter((j) => !disabled.has(j.id));
  }
  return judges;
}

/**
 * Run a single judge against the provided code.
 */
export function evaluateWithJudge(
  judge: JudgeDefinition,
  code: string,
  language: string,
  context?: string,
  options?: EvaluationOptions,
): JudgeEvaluation {
  const findings: Finding[] = [];

  // ── Registry-based dispatch: each judge carries its own analyze() method ──
  if (judge.analyze) {
    findings.push(...judge.analyze(code, language));
  }

  // ── File-type gating: suppress absence-based findings on non-server files ──
  const fileCategory = classifyFile(code, language, options?.filePath);
  const gatedFindings = shouldRunAbsenceRules(fileCategory)
    ? findings
    : findings.filter((f) => !isAbsenceBasedFinding(f));

  // ── Tag & demote remaining absence-based findings ──
  // In single-file mode, absence-based findings are inherently lower confidence
  // because the missing capability may exist in another file. Cap their severity
  // at 'medium' and tag them for downstream consumers.
  const taggedFindings = gatedFindings.map((f) => {
    if (isAbsenceBasedFinding(f)) {
      const cappedSeverity: Record<string, string> = { critical: "medium", high: "medium" };
      return {
        ...f,
        isAbsenceBased: true,
        provenance: f.provenance ?? "absence-of-pattern",
        severity: (cappedSeverity[f.severity] ?? f.severity) as Severity,
        confidence: Math.min(f.confidence ?? 0.5, 0.6),
      };
    }
    return f;
  });

  // ── Framework-aware confidence reduction ──
  // Detect frameworks/middleware from code patterns (works for all languages)
  // and reduce confidence for findings that the framework inherently handles.
  const frameworkAware = applyFrameworkAwareness(taggedFindings, code);

  // ── AST-aware refinements: dead code removal, scope context, import awareness, taint flows ──
  const astStructure = options?._astCache;
  const refinedFindings = astStructure
    ? applyAstRefinements(frameworkAware, astStructure, options?._taintFlows)
    : frameworkAware;

  // ── Inline suppression: respect // judges-ignore RULE-ID comments ──
  const unsuppressed = applyInlineSuppressions(refinedFindings, code);

  // ── Auto-fix patches: attach machine-applicable patches where possible ──
  const patchEnriched = enrichWithPatches(unsuppressed, code);

  const filteredFindings = applyConfidenceThreshold(patchEnriched, options);
  const configFiltered = applyConfig(filteredFindings, options?.config);
  const score = calculateScore(configFiltered, code);
  const verdict = deriveVerdict(configFiltered, score);
  const summary = buildSummary(judge, configFiltered, score, verdict);

  return {
    judgeId: judge.id,
    judgeName: judge.name,
    verdict,
    score,
    summary,
    findings: configFiltered,
  };
}

/**
 * Run the full tribunal — all judges evaluate the code.
 */
export function evaluateWithTribunal(
  code: string,
  language: string,
  context?: string,
  options?: EvaluationOptions,
): TribunalVerdict {
  // Compute AST once and share across all judges via options
  // Use content-hash cache to avoid re-computing for identical code
  const includeAst = options?.includeAstFindings ?? true;
  const hash = contentHash(code, language);

  let astResult = options?._astCache;
  if (!astResult && includeAst) {
    astResult = astStructureCache.get(hash);
    if (!astResult) {
      astResult = analyzeStructure(code, language);
      astStructureCache.set(hash, astResult);
    }
  }

  let taintResult = options?._taintFlows;
  if (!taintResult) {
    taintResult = taintFlowCache.get(hash);
    if (!taintResult) {
      taintResult = analyzeTaintFlows(code, language);
      taintFlowCache.set(hash, taintResult);
    }
  }

  const enrichedOptions: EvaluationOptions = {
    ...options,
    ...(astResult ? { _astCache: astResult } : {}),
    ...(taintResult ? { _taintFlows: taintResult } : {}),
  };

  const judges = resolveJudgeSet(enrichedOptions);
  const evaluations = judges.map((judge) => evaluateWithJudge(judge, code, language, context, enrichedOptions));

  const overallScore = Math.round(evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length);

  const overallVerdict: Verdict = evaluations.some((e) => e.verdict === "fail")
    ? "fail"
    : evaluations.some((e) => e.verdict === "warning")
      ? "warning"
      : "pass";

  const rawFindings = evaluations.flatMap((e) => e.findings);
  const dedupedFindings = crossEvaluatorDedup(rawFindings);
  const allFindings = applyConfig(dedupedFindings, options?.config);
  const mustFixGate = evaluateMustFixGate(allFindings, options?.mustFixGate);
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  const effectiveVerdict: Verdict = mustFixGate?.triggered ? "fail" : overallVerdict;

  const summary =
    buildTribunalSummary(evaluations, effectiveVerdict, overallScore, criticalCount, highCount) +
    (mustFixGate
      ? `\n\n## Must-Fix Gate\n\n- Status: **${mustFixGate.triggered ? "TRIGGERED" : "PASS"}**\n- Minimum confidence: **${Math.round(mustFixGate.minConfidence * 100)}%**\n- Matched findings: **${mustFixGate.matchedCount}**\n- Matched rule IDs: ${mustFixGate.matchedRuleIds.length > 0 ? mustFixGate.matchedRuleIds.map((id: string) => `\`${id}\``).join(", ") : "none"}\n`
      : "");

  return {
    overallVerdict: effectiveVerdict,
    overallScore,
    summary,
    evaluations,
    findings: allFindings,
    criticalCount,
    highCount,
    timestamp: new Date().toISOString(),
    mustFixGate,
  };
}

// ─── Project-level Multi-file Analysis (delegated to project.ts) ─────────────
import { evaluateProject as _evaluateProject } from "./project.js";
import type { TribunalRunner } from "./project.js";

export function evaluateProject(
  files: Array<{ path: string; content: string; language: string }>,
  context?: string,
  options?: EvaluationOptions,
): ProjectVerdict {
  const runner: TribunalRunner = { evaluateWithTribunal };
  return _evaluateProject(runner, files, context, options);
}

// ─── Diff-based Incremental Analysis ──────────────────────────────────────────

/**
 * Evaluate only the changed lines in a diff. Runs the full tribunal on the
 * new code but filters findings to only those affecting changed line ranges.
 */
export function evaluateDiff(
  code: string,
  language: string,
  changedLines: number[],
  context?: string,
  options?: EvaluationOptions,
): DiffVerdict {
  const verdict = evaluateWithTribunal(code, language, context, options);
  const allFindings = verdict.findings;

  // Filter findings to only those touching changed lines
  const changedSet = new Set(changedLines);
  const diffFindings = allFindings.filter((f) => {
    if (!f.lineNumbers || f.lineNumbers.length === 0) return false;
    return f.lineNumbers.some((ln) => changedSet.has(ln));
  });

  const score = calculateScore(diffFindings, code);
  const diffVerdict = deriveVerdict(diffFindings, score);

  return {
    linesAnalyzed: changedLines.length,
    findings: diffFindings,
    score,
    verdict: diffVerdict,
    summary: `Diff analysis: ${changedLines.length} changed lines, ${diffFindings.length} findings in changed code, score ${score}/100 — ${diffVerdict.toUpperCase()}`,
  };
}

// ─── Dependency / Supply-chain Analysis (delegated to dependencies.ts) ───────
export { analyzeDependencies } from "./dependencies.js";

// ─── App Builder Flow (Review → Translate → Task Plan) ─────────────────────

import { runAppBuilderWorkflow as _runAppBuilderWorkflow } from "./app-builder.js";
import type { EvaluationEngine } from "./app-builder.js";

const engine: EvaluationEngine = { evaluateWithTribunal, evaluateProject, evaluateDiff };

export function runAppBuilderWorkflow(
  params: Parameters<typeof _runAppBuilderWorkflow>[1],
): ReturnType<typeof _runAppBuilderWorkflow> {
  return _runAppBuilderWorkflow(engine, params);
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { formatVerdictAsMarkdown, formatEvaluationAsMarkdown };
export { enrichWithPatches } from "../patches/index.js";
export { crossEvaluatorDedup } from "../dedup.js";
