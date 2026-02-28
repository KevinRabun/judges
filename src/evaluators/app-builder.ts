/**
 * App Builder Workflow
 *
 * Extracted from the evaluators monolith. Provides a high-level, opinionated
 * workflow that chains tribunal review → plain-language translation → task planning
 * for use by AI-powered code review agents and CI/CD pipelines.
 */

import type {
  Finding,
  Severity,
  Verdict,
  AppBuilderWorkflowResult,
  PlainLanguageFinding,
  WorkflowTask,
  TribunalVerdict,
  ProjectVerdict,
  DiffVerdict,
} from "../types.js";
import { severityRank } from "../dedup.js";
import type { EvaluationOptions } from "./index.js";

// ─── Dependency Injection Types ──────────────────────────────────────────────

export interface EvaluationEngine {
  evaluateWithTribunal: (
    code: string,
    language: string,
    context?: string,
    options?: EvaluationOptions,
  ) => TribunalVerdict;
  evaluateProject: (
    files: Array<{ path: string; content: string; language: string }>,
    context?: string,
    options?: EvaluationOptions,
  ) => ProjectVerdict;
  evaluateDiff: (
    code: string,
    language: string,
    changedLines: number[],
    context?: string,
    options?: EvaluationOptions,
  ) => DiffVerdict;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.ruleId}|${finding.title}|${finding.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }

  return result;
}

function decideRelease(
  criticalCount: number,
  highCount: number,
  score: number,
): AppBuilderWorkflowResult["releaseDecision"] {
  if (criticalCount > 0 || score < 60) return "do-not-ship";
  if (highCount > 0 || score < 80) return "ship-with-caution";
  return "ship-now";
}

function toPlainLanguageFinding(finding: Finding): PlainLanguageFinding {
  const severityImpact: Record<Severity, string> = {
    critical: "This can directly cause security incidents, outages, or serious compliance exposure.",
    high: "This is likely to impact users or operations if left unresolved.",
    medium: "This can create reliability, maintainability, or quality issues over time.",
    low: "This is a quality improvement that reduces friction and future rework.",
    info: "This is guidance to strengthen consistency and engineering hygiene.",
  };

  return {
    ruleId: finding.ruleId,
    severity: finding.severity,
    title: finding.title,
    whatIsWrong: `${finding.title}: ${finding.description}`,
    whyItMatters: severityImpact[finding.severity],
    nextAction: finding.recommendation,
  };
}

function pickOwner(finding: Finding): WorkflowTask["owner"] {
  if (/^(UX|A11Y|I18N|ETHICS|COMPAT)-/.test(finding.ruleId)) return "product";
  if (/^(DOC|TEST|MAINT|ERR|CFG)-/.test(finding.ruleId)) return "ai";
  return "developer";
}

function pickPriority(severity: Severity): WorkflowTask["priority"] {
  if (severity === "critical") return "P0";
  if (severity === "high") return "P1";
  return "P2";
}

function pickEffort(finding: Finding): WorkflowTask["effort"] {
  if (finding.severity === "critical") return "L";
  if (finding.severity === "high") return "M";
  return finding.lineNumbers && finding.lineNumbers.length > 3 ? "M" : "S";
}

function toWorkflowTask(finding: Finding): WorkflowTask {
  const owner = pickOwner(finding);
  const priority = pickPriority(finding.severity);
  const effort = pickEffort(finding);
  const aiFixable = owner !== "product";

  return {
    priority,
    owner,
    effort,
    ruleId: finding.ruleId,
    task: `${finding.title} — ${finding.recommendation}`,
    doneWhen: `A follow-up review no longer reports ${finding.ruleId} and related tests/checks pass.`,
    aiFixable,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function runAppBuilderWorkflow(
  engine: EvaluationEngine,
  params: {
    code?: string;
    language?: string;
    files?: Array<{ path: string; content: string; language: string }>;
    changedLines?: number[];
    context?: string;
    includeAstFindings?: boolean;
    minConfidence?: number;
    maxFindings?: number;
    maxTasks?: number;
  },
): AppBuilderWorkflowResult {
  const maxFindings = Math.max(1, params.maxFindings ?? 10);
  const maxTasks = Math.max(1, params.maxTasks ?? 20);

  let mode: AppBuilderWorkflowResult["mode"];
  let verdict: Verdict;
  let score: number;
  let findings: Finding[];

  if (params.files && params.files.length > 0) {
    mode = "project";
    const result = engine.evaluateProject(params.files, params.context, {
      includeAstFindings: params.includeAstFindings,
      minConfidence: params.minConfidence,
    });
    verdict = result.overallVerdict;
    score = result.overallScore;
    findings = [...result.fileResults.flatMap((fr) => fr.findings), ...result.architecturalFindings];
  } else if (params.changedLines && params.changedLines.length > 0) {
    if (!params.code || !params.language) {
      throw new Error("changedLines mode requires both code and language inputs");
    }

    mode = "diff";
    const result = engine.evaluateDiff(params.code, params.language, params.changedLines, params.context, {
      includeAstFindings: params.includeAstFindings,
      minConfidence: params.minConfidence,
    });
    verdict = result.verdict;
    score = result.score;
    findings = result.findings;
  } else {
    if (!params.code || !params.language) {
      throw new Error("code mode requires both code and language, or provide files for project mode");
    }

    mode = "code";
    const result = engine.evaluateWithTribunal(params.code, params.language, params.context, {
      includeAstFindings: params.includeAstFindings,
      minConfidence: params.minConfidence,
    });
    verdict = result.overallVerdict;
    score = result.overallScore;
    findings = result.findings;
  }

  const dedupedFindings = dedupeFindings(findings).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const criticalCount = dedupedFindings.filter((finding) => finding.severity === "critical").length;
  const highCount = dedupedFindings.filter((finding) => finding.severity === "high").length;
  const mediumCount = dedupedFindings.filter((finding) => finding.severity === "medium").length;

  const releaseDecision = decideRelease(criticalCount, highCount, score);
  const topFindings = dedupedFindings
    .filter((finding) => ["critical", "high", "medium"].includes(finding.severity))
    .slice(0, maxFindings);

  const plainLanguageFindings = topFindings.map(toPlainLanguageFinding);
  const tasks = dedupedFindings.slice(0, maxTasks).map(toWorkflowTask);
  const aiFixableNow = tasks.filter((task) => task.aiFixable && (task.priority === "P0" || task.priority === "P1"));

  const summary =
    releaseDecision === "do-not-ship"
      ? "Do not ship yet. Resolve critical risks before release."
      : releaseDecision === "ship-with-caution"
        ? "Ship with caution. Address high-priority gaps and monitor closely."
        : "Ship now. No blocking risks were detected in this review pass.";

  return {
    mode,
    verdict,
    score,
    criticalCount,
    highCount,
    mediumCount,
    releaseDecision,
    summary,
    plainLanguageFindings,
    tasks,
    aiFixableNow,
  };
}
