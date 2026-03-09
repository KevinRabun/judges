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
  SuppressionRecord,
  SuppressionResult,
} from "../types.js";
import { JUDGES } from "../judges/index.js";
import { analyzeStructure } from "../ast/index.js";
import { analyzeTaintFlows } from "../ast/index.js";
import type { CodeStructure, FunctionInfo } from "../ast/types.js";
import type { TaintFlow } from "../ast/taint-tracker.js";
import { LRUCache, contentHash } from "../cache.js";
import { getSharedDiskCache } from "../disk-cache.js";

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
import { crossEvaluatorDedup, severityRank } from "../dedup.js";
import { filterFalsePositiveHeuristics } from "./false-positive-review.js";
import { buildCalibrationProfile, calibrateFindings, loadCalibrationProfile } from "../calibration.js";
import type { CalibrationOptions, CalibrationProfile } from "../calibration.js";
import { applyAutoTune } from "../auto-tune.js";
import { loadFeedbackStore } from "../commands/feedback.js";

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
  /**
   * Maximum number of findings to keep per file. When exceeded, findings are
   * priority-sorted (severity → confidence → suggestedFix) and the lowest-
   * priority items are dropped. Defaults to 20. Set to 0 to disable.
   */
  maxFindingsPerFile?: number;
  /**
   * When true, absence-based findings ("no rate limiting", "no monitoring",
   * etc.) are kept for cross-file resolution in project-level analysis.
   * When false (default), absence-based findings are suppressed because they
   * are project-level concerns that cannot be accurately assessed from a
   * single file — the missing capability may exist in another module.
   */
  projectMode?: boolean;
  /**
   * Additional judges loaded from plugins (via config.plugins).
   * These are appended to the built-in JUDGES array before evaluation.
   */
  pluginJudges?: JudgeDefinition[];
  /**
   * Enable feedback-driven confidence calibration.
   * When true, loads the feedback store and adjusts finding confidence
   * based on historical FP rates. Set to a CalibrationOptions object
   * for fine-grained control (minSamples, maxReduction, maxBoost).
   */
  calibrate?: boolean | CalibrationOptions;
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
 * Metadata captured per suppression directive during parsing.
 */
interface SuppressionDirective {
  /** Normalised rule ID (uppercased) or "*" */
  ruleId: string;
  /** Type of directive that created this suppression */
  kind: "line" | "next-line" | "block" | "file";
  /** 1-based line number of the suppression comment itself */
  commentLine: number;
  /** Optional reason text extracted from the comment */
  reason?: string;
}

/**
 * Parsed result of inline suppression comments in source code.
 *
 * Supports five directive styles:
 *   // judges-ignore RULE-ID              → suppress on same line
 *   // judges-ignore-next-line RULE-ID    → suppress on the next line
 *   // judges-ignore-block RULE-ID        → suppress until matching end
 *   // judges-end-block                   → ends block suppression
 *   // judges-file-ignore RULE-ID         → suppress across entire file
 *
 * All directive styles also accept # and /* comment prefixes for
 * Python/YAML/CSS compatibility.
 *
 * An optional reason can be appended after " -- ":
 *   // judges-ignore SEC-001 -- legacy code, tracked in JIRA-123
 */
function parseInlineSuppressions(code: string): {
  lineSuppressed: Map<number, SuppressionDirective[]>;
  globalSuppressed: SuppressionDirective[];
} {
  const lines = code.split("\n");
  const lineSuppressed = new Map<number, SuppressionDirective[]>();
  const globalSuppressed: SuppressionDirective[] = [];

  // Active block suppressions: ruleId → { commentLine, reason }
  const activeBlocks = new Map<string, { commentLine: number; reason?: string }>();

  // Pattern: // judges-ignore[-next-line|-block] RULE-ID [, RULE-ID ...] [-- reason]
  const suppressPattern = /(?:\/\/|#|\/\*)\s*judges-ignore(?:-(next-line|block))?\s+([^\n]*?)(?:\s*\*\/)?$/gi;
  const endBlockPattern = /(?:\/\/|#|\/\*)\s*judges-end-block/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-indexed

    // Check for block-end
    if (endBlockPattern.test(line)) {
      activeBlocks.clear();
    }

    // Apply any active block suppressions to this line
    for (const [ruleId, meta] of activeBlocks) {
      const arr = lineSuppressed.get(lineNum) ?? [];
      arr.push({ ruleId, kind: "block", commentLine: meta.commentLine, reason: meta.reason });
      lineSuppressed.set(lineNum, arr);
    }

    // Parse suppression directives
    let match;
    suppressPattern.lastIndex = 0;
    while ((match = suppressPattern.exec(line)) !== null) {
      const modifier = match[1]?.toLowerCase(); // "next-line", "block", or undefined
      const rawContent = match[2];
      const dashSplit = rawContent.split(/\s+--\s+/);
      const ruleIds = dashSplit[0].split(/[,\s]+/).filter(Boolean);
      const reason = dashSplit[1]?.trim() || undefined;

      const kind: SuppressionDirective["kind"] =
        modifier === "next-line" ? "next-line" : modifier === "block" ? "block" : "line";
      const targetLine = kind === "next-line" ? lineNum + 1 : lineNum;

      for (const rawId of ruleIds) {
        const ruleId = rawId === "*" ? "*" : rawId.toUpperCase();

        if (kind === "block") {
          // Start block suppression — applies to all subsequent lines until end-block
          activeBlocks.set(ruleId, { commentLine: lineNum, reason });
        } else {
          const arr = lineSuppressed.get(targetLine) ?? [];
          arr.push({ ruleId, kind, commentLine: lineNum, reason });
          lineSuppressed.set(targetLine, arr);
        }
      }
    }

    // File-level suppression: // judges-file-ignore RULE-ID [-- reason]
    const filePattern = /(?:\/\/|#|\/\*)\s*judges-file-ignore\s+([^\n]*?)(?:\s*\*\/)?$/gi;
    let fileMatch;
    filePattern.lastIndex = 0;
    while ((fileMatch = filePattern.exec(line)) !== null) {
      const rawFileContent = fileMatch[1];
      const fileDashSplit = rawFileContent.split(/\s+--\s+/);
      const ruleIds = fileDashSplit[0].split(/[,\s]+/).filter(Boolean);
      const reason = fileDashSplit[1]?.trim() || undefined;
      for (const rawId of ruleIds) {
        const ruleId = rawId === "*" ? "*" : rawId.toUpperCase();
        globalSuppressed.push({ ruleId, kind: "file", commentLine: lineNum, reason });
      }
    }
  }

  return { lineSuppressed, globalSuppressed };
}

/**
 * Check whether a rule ID matches a set of suppression directives.
 * Supports exact match, wildcard "*", and prefix wildcards like "AUTH-*".
 */
function matchesSuppression(ruleUpper: string, directives: SuppressionDirective[]): SuppressionDirective | undefined {
  for (const d of directives) {
    if (d.ruleId === "*" || d.ruleId === ruleUpper) {
      return d;
    }
    if (d.ruleId.endsWith("-*") && ruleUpper.startsWith(d.ruleId.slice(0, -1))) {
      return d;
    }
  }
  return undefined;
}

/**
 * Apply inline suppression comments and return both filtered findings
 * and a full audit trail of what was suppressed.
 */
export function applyInlineSuppressionsWithAudit(findings: Finding[], code: string): SuppressionResult {
  const { lineSuppressed, globalSuppressed } = parseInlineSuppressions(code);

  if (lineSuppressed.size === 0 && globalSuppressed.length === 0) {
    return { findings, suppressed: [] };
  }

  const kept: Finding[] = [];
  const suppressed: SuppressionRecord[] = [];

  for (const f of findings) {
    const ruleUpper = f.ruleId.toUpperCase();

    // Check file-level suppression
    const globalMatch = matchesSuppression(ruleUpper, globalSuppressed);
    if (globalMatch) {
      suppressed.push({
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        kind: globalMatch.kind,
        commentLine: globalMatch.commentLine,
        findingLines: f.lineNumbers,
        reason: globalMatch.reason,
      });
      continue;
    }

    // Check line-level suppressions
    let wasLineSuppressed = false;
    if (f.lineNumbers && f.lineNumbers.length > 0) {
      for (const lineNum of f.lineNumbers) {
        const directives = lineSuppressed.get(lineNum);
        if (directives) {
          const lineMatch = matchesSuppression(ruleUpper, directives);
          if (lineMatch) {
            suppressed.push({
              ruleId: f.ruleId,
              severity: f.severity,
              title: f.title,
              kind: lineMatch.kind,
              commentLine: lineMatch.commentLine,
              findingLines: f.lineNumbers,
              reason: lineMatch.reason,
            });
            wasLineSuppressed = true;
            break;
          }
        }
      }
    }

    if (!wasLineSuppressed) {
      kept.push(f);
    }
  }

  return { findings: kept, suppressed };
}

/**
 * Filter findings based on inline suppression comments in the source code.
 * Drop-in backward-compatible wrapper around `applyInlineSuppressionsWithAudit`.
 */
export function applyInlineSuppressions(findings: Finding[], code: string): Finding[] {
  return applyInlineSuppressionsWithAudit(findings, code).findings;
}

function resolveJudgeSet(options?: EvaluationOptions): JudgeDefinition[] {
  const includeAstFindings = options?.includeAstFindings ?? true;
  let judges = includeAstFindings ? JUDGES : JUDGES.filter((judge) => judge.id !== "code-structure");

  // Append plugin judges if provided
  if (options?.pluginJudges && options.pluginJudges.length > 0) {
    const builtInIds = new Set(judges.map((j) => j.id));
    const uniquePlugins = options.pluginJudges.filter((j) => !builtInIds.has(j.id));
    judges = [...judges, ...uniquePlugins];
  }

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
    // Pass pre-computed AST context so evaluators can make scope-aware decisions
    const analyzeCtx =
      options?._astCache || options?._taintFlows
        ? { ast: options._astCache, taintFlows: options._taintFlows }
        : undefined;
    findings.push(...judge.analyze(code, language, analyzeCtx));
  }

  // ── Absence gating ──
  // Absence-based findings ("no rate limiting", "no monitoring", etc.) are
  // project-level concerns that cannot be accurately assessed from a single
  // file — the missing capability may exist in another module, middleware,
  // or infrastructure layer. Suppress them entirely in single-file mode.
  // In project mode (evaluateProject), keep them for cross-file resolution.
  const fileCategory = classifyFile(code, language, options?.filePath);
  const isProjectMode = options?.projectMode === true;
  const allowAbsence = shouldRunAbsenceRules(fileCategory) && isProjectMode;
  const gatedFindings = allowAbsence ? findings : findings.filter((f) => !isAbsenceBasedFinding(f));

  // ── Tag & demote remaining absence-based findings ──
  // In project mode, absence-based findings are kept but demoted: cap severity
  // at 'medium' and confidence at 0.6 since the missing capability may still
  // exist in another file not yet analyzed.
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
  const { findings: unsuppressed, suppressed: suppressionRecords } = applyInlineSuppressionsWithAudit(
    refinedFindings,
    code,
  );

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
    suppressions: suppressionRecords.length > 0 ? suppressionRecords : undefined,
  };
}

// ─── Per-File Finding Cap ────────────────────────────────────────────────────

/** Default maximum findings per file — keeps output actionable. */
const DEFAULT_MAX_FINDINGS_PER_FILE = 20;

/**
 * Cap the number of findings by priority-sorting and keeping only
 * the top N.  Ensures high-severity / high-confidence findings always survive.
 *
 * In the current single-file `evaluateWithTribunal` pipeline all findings
 * belong to one file, so a flat cap suffices.  When multi-file evaluation
 * is added, this function should group findings by file path first.
 */
function applyPerFileFindingCap(findings: Finding[], maxFindings: number): Finding[] {
  if (maxFindings <= 0 || findings.length <= maxFindings) return findings;

  // Sort by: severity desc → confidence desc → has suggestedFix → description length
  const sorted = [...findings].sort((a, b) => {
    const sevDiff = severityRank(b.severity) - severityRank(a.severity);
    if (sevDiff !== 0) return sevDiff;
    const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (confDiff !== 0) return confDiff;
    const fixDiff = (b.suggestedFix ? 1 : 0) - (a.suggestedFix ? 1 : 0);
    if (fixDiff !== 0) return fixDiff;
    return b.description.length - a.description.length;
  });
  return sorted.slice(0, maxFindings);
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
  // ── Disk cache: check for a previously cached result ──
  // Include options that affect output in the cache key so different
  // evaluations of the same code (e.g. with/without AST, different configs)
  // are cached separately.
  const optionsSuffix = options
    ? JSON.stringify({
        ast: options.includeAstFindings,
        mc: options.minConfidence,
        mf: options.maxFindingsPerFile,
        dr: options.config?.disabledRules,
        dj: options.config?.disabledJudges,
        ms: options.config?.minSeverity,
        jw: options.config?.judgeWeights,
        mfg: options.mustFixGate,
      })
    : "";
  const hash = contentHash(code, language + optionsSuffix);
  const diskCache = getSharedDiskCache();
  if (diskCache) {
    const cached = diskCache.get(hash) as TribunalVerdict | undefined;
    if (cached) return cached;
  }

  // Compute AST once and share across all judges via options
  // Use content-hash cache to avoid re-computing for identical code
  const includeAst = options?.includeAstFindings ?? true;

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

  // Weighted score aggregation — uses judgeWeights from config when available
  const weights = enrichedOptions?.config?.judgeWeights;
  let overallScore: number;
  if (weights && Object.keys(weights).length > 0) {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const e of evaluations) {
      const w = weights[e.judgeId] ?? 1.0;
      weightedSum += e.score * w;
      totalWeight += w;
    }
    overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  } else {
    overallScore = Math.round(evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length);
  }

  const overallVerdict: Verdict = evaluations.some((e) => e.verdict === "fail")
    ? "fail"
    : evaluations.some((e) => e.verdict === "warning")
      ? "warning"
      : "pass";

  const rawFindings = evaluations.flatMap((e) => e.findings);
  const dedupedFindings = crossEvaluatorDedup(rawFindings);
  const { filtered: fpFiltered } = filterFalsePositiveHeuristics(
    dedupedFindings,
    code,
    language,
    enrichedOptions?.filePath,
  );
  const configFiltered = applyConfig(fpFiltered, options?.config);

  // ── Feedback-driven confidence calibration & auto-tuning ──
  // When options.calibrate is set, load the feedback store and apply:
  // 1. Auto-suppression of rules with FP rate ≥ 80%
  // 2. Severity downgrade for rules with FP rate 50-80%
  // 3. Confidence calibration based on historical FP rates
  let calibrated = configFiltered;
  if (enrichedOptions.calibrate) {
    try {
      const calOpts: CalibrationOptions | undefined =
        typeof enrichedOptions.calibrate === "object" ? enrichedOptions.calibrate : undefined;
      const feedbackStore = loadFeedbackStore(calOpts?.feedbackPath);
      if (feedbackStore.entries.length > 0) {
        const tuned = applyAutoTune(calibrated, feedbackStore);
        calibrated = tuned.findings;
      } else {
        // No feedback data — try plain calibration profile
        const profile = loadCalibrationProfile(calOpts);
        if (profile.isActive) {
          calibrated = calibrateFindings(calibrated, profile, calOpts);
        }
      }
    } catch {
      // Calibration failure is non-fatal — continue with uncalibrated findings
    }
  }

  const maxFindings = options?.maxFindingsPerFile ?? DEFAULT_MAX_FINDINGS_PER_FILE;
  const cappedFindings = applyPerFileFindingCap(calibrated, maxFindings);

  // ── Confidence-based tiering for progressive disclosure ──
  // Tag each finding with a disclosure tier so downstream consumers (CLI,
  // formatters, VS Code extension) can show only high-confidence findings
  // by default and reveal lower tiers on demand.
  const allFindings = cappedFindings.map((f) => {
    const conf = f.confidence ?? 0.5;
    const tier: Finding["confidenceTier"] = conf >= 0.8 ? "essential" : conf >= 0.6 ? "important" : "supplementary";
    return { ...f, confidenceTier: tier };
  });

  const mustFixGate = evaluateMustFixGate(allFindings, options?.mustFixGate);
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  const effectiveVerdict: Verdict = mustFixGate?.triggered ? "fail" : overallVerdict;

  const summary =
    buildTribunalSummary(evaluations, effectiveVerdict, overallScore, criticalCount, highCount) +
    (mustFixGate
      ? `\n\n## Must-Fix Gate\n\n- Status: **${mustFixGate.triggered ? "TRIGGERED" : "PASS"}**\n- Minimum confidence: **${Math.round(mustFixGate.minConfidence * 100)}%**\n- Matched findings: **${mustFixGate.matchedCount}**\n- Matched rule IDs: ${mustFixGate.matchedRuleIds.length > 0 ? mustFixGate.matchedRuleIds.map((id: string) => `\`${id}\``).join(", ") : "none"}\n`
      : "");

  // ── Aggregate suppression audit trail across all judges ──
  const allSuppressions = evaluations.flatMap((e) => e.suppressions ?? []);

  const result: TribunalVerdict = {
    overallVerdict: effectiveVerdict,
    overallScore,
    summary,
    evaluations,
    findings: allFindings,
    criticalCount,
    highCount,
    timestamp: new Date().toISOString(),
    mustFixGate,
    ...(allSuppressions.length > 0 ? { suppressions: allSuppressions } : {}),
  };

  // ── Disk cache: persist for future runs ──
  if (diskCache) {
    try {
      diskCache.set(hash, result, options?.filePath);
    } catch {
      // Non-fatal — disk write failure should not break evaluation
    }
  }

  return result;
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
  // Enable project mode so absence-based findings survive for cross-file resolution
  return _evaluateProject(runner, files, context, { ...options, projectMode: true });
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
export { crossEvaluatorDedup, crossFileDedup, diffFindings, formatFindingDiff } from "../dedup.js";
export type { FindingDiff } from "../dedup.js";
