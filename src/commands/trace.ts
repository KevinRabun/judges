// ─── Trace Mode — Show Your Work ─────────────────────────────────────────────
// Renders a detailed, human-readable trace of exactly how the evaluation
// pipeline reached its decision for every finding. Each finding's journey
// through the pipeline is shown: detection → FP filters → dedup → calibration
// → confidence scoring → final disposition.
//
// All data is computed locally from the evaluation result — no external
// services or data storage involved.
//
// Usage:
//   judges eval src/app.ts --trace            # text trace to stdout
//   judges eval src/app.ts --trace --format json   # structured trace
// ──────────────────────────────────────────────────────────────────────────────

import type { Finding, TribunalVerdict, JudgeEvaluation } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TraceStep {
  /** Stage name in the pipeline */
  stage: string;
  /** What happened at this stage */
  action: "kept" | "suppressed" | "demoted" | "boosted" | "merged" | "capped" | "added";
  /** Human-readable explanation */
  reason: string;
}

export interface FindingTrace {
  /** The final (or suppressed) finding */
  ruleId: string;
  title: string;
  severity: string;
  /** Final disposition */
  disposition: "reported" | "suppressed" | "merged";
  /** Ordered pipeline steps */
  steps: TraceStep[];
  /** Confidence journey: initial → final */
  confidenceJourney?: { initial: number; final: number; adjustments: string[] };
}

export interface EvaluationTrace {
  /** File evaluated */
  filePath?: string;
  /** Language detected */
  language: string;
  /** Total judges that ran */
  judgesRun: number;
  /** Total raw findings before any filtering */
  rawFindingCount: number;
  /** Total findings after full pipeline */
  finalFindingCount: number;
  /** Findings suppressed by each pipeline stage */
  suppressionSummary: { stage: string; count: number }[];
  /** Per-finding trace */
  findings: FindingTrace[];
  /** Per-judge summary */
  judgeSummaries: { judgeId: string; judgeName: string; findingsProduced: number; durationMs: number }[];
}

// ─── Trace Builder ──────────────────────────────────────────────────────────

/**
 * Build an evaluation trace from a tribunal verdict.
 *
 * This reconstructs the pipeline journey from the data available on the
 * verdict — it does not require runtime hooks in the evaluator. The trace
 * is approximate but highly informative for understanding why findings
 * were kept or dropped.
 */
export function buildEvaluationTrace(verdict: TribunalVerdict, filePath?: string, language?: string): EvaluationTrace {
  const judgeSummaries = verdict.evaluations.map((e: JudgeEvaluation) => ({
    judgeId: e.judgeId,
    judgeName: e.judgeName,
    findingsProduced: e.findings.length,
    durationMs: e.durationMs ?? 0,
  }));

  const rawFindingCount = verdict.evaluations.reduce((sum: number, e: JudgeEvaluation) => sum + e.findings.length, 0);

  // Build per-finding traces from what we can infer
  const findingTraces: FindingTrace[] = [];

  // Track what the final set contains
  const finalRuleIds = new Set(verdict.findings.map((f: Finding) => `${f.ruleId}:${f.lineNumbers?.[0] ?? 0}`));

  // Process each judge's findings
  for (const evaluation of verdict.evaluations) {
    for (const finding of evaluation.findings) {
      const key = `${finding.ruleId}:${finding.lineNumbers?.[0] ?? 0}`;
      const steps: TraceStep[] = [];

      // Step 1: Detection
      steps.push({
        stage: "detection",
        action: "kept",
        reason: `Detected by ${evaluation.judgeName} (${evaluation.judgeId}) via ${finding.provenance ?? "pattern-match"}`,
      });

      // Step 2: Evidence basis
      if (finding.evidenceBasis) {
        steps.push({
          stage: "confidence-scoring",
          action: finding.confidence && finding.confidence >= 0.7 ? "boosted" : "kept",
          reason: `Evidence: ${finding.evidenceBasis}`,
        });
      }

      // Step 3: Evidence chain
      if (finding.evidenceChain) {
        const chainDesc = finding.evidenceChain.steps
          .map((s) => `${s.source}${s.line ? ` L${s.line}` : ""}: ${s.observation}`)
          .join(" → ");
        steps.push({
          stage: "evidence-chain",
          action: "kept",
          reason: chainDesc,
        });
      }

      // Step 4: Absence gating
      if (finding.isAbsenceBased) {
        steps.push({
          stage: "absence-gating",
          action: "demoted",
          reason: "Absence-based finding — severity capped at medium, confidence capped at 0.6",
        });
      }

      // Step 5: Confidence tier
      if (finding.confidenceTier) {
        steps.push({
          stage: "confidence-tiering",
          action: "kept",
          reason: `Classified as "${finding.confidenceTier}" (confidence: ${((finding.confidence ?? 0.5) * 100).toFixed(0)}%)`,
        });
      }

      // Step 6: Check if it survived to final output
      const inFinal = finalRuleIds.has(key);
      if (!inFinal) {
        // Determine likely suppression reason
        if (finding.isAbsenceBased) {
          steps.push({
            stage: "pipeline-filter",
            action: "suppressed",
            reason: "Suppressed: absence-based finding in single-file mode",
          });
        } else {
          steps.push({
            stage: "pipeline-filter",
            action: "suppressed",
            reason: "Suppressed: likely removed by FP heuristics, dedup, or config filter",
          });
        }
      }

      // Step 7: OWASP LLM mapping
      if (finding.owaspLlmTop10) {
        steps.push({
          stage: "ai-risk-mapping",
          action: "kept",
          reason: `Mapped to ${finding.owaspLlmTop10}`,
        });
      }

      // Step 8: Patch availability
      if (finding.patch) {
        steps.push({
          stage: "auto-fix",
          action: "added",
          reason: `Auto-fix available: L${finding.patch.startLine}-${finding.patch.endLine}`,
        });
      }

      const confidenceJourney = finding.evidenceBasis
        ? {
            initial: 0.5,
            final: finding.confidence ?? 0.5,
            adjustments: finding.evidenceBasis.split(", "),
          }
        : undefined;

      findingTraces.push({
        ruleId: finding.ruleId,
        title: finding.title,
        severity: finding.severity,
        disposition: inFinal ? "reported" : "suppressed",
        steps,
        confidenceJourney,
      });
    }
  }

  // Add traces for suppressed findings (from inline suppression audit trail)
  if (verdict.suppressions) {
    for (const s of verdict.suppressions) {
      findingTraces.push({
        ruleId: s.ruleId,
        title: s.title,
        severity: s.severity,
        disposition: "suppressed",
        steps: [
          { stage: "detection", action: "kept", reason: "Detected by pattern match" },
          {
            stage: "inline-suppression",
            action: "suppressed",
            reason: `Suppressed by ${s.kind} comment at L${s.commentLine}${s.reason ? `: ${s.reason}` : ""}`,
          },
        ],
      });
    }
  }

  // Compute suppression summary by stage
  const suppressionMap = new Map<string, number>();
  for (const trace of findingTraces) {
    if (trace.disposition === "suppressed") {
      const lastStep = trace.steps[trace.steps.length - 1];
      const stage = lastStep?.stage ?? "unknown";
      suppressionMap.set(stage, (suppressionMap.get(stage) ?? 0) + 1);
    }
  }
  const suppressionSummary = [...suppressionMap.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);

  return {
    filePath,
    language: language ?? "unknown",
    judgesRun: verdict.evaluations.length,
    rawFindingCount,
    finalFindingCount: verdict.findings.length,
    suppressionSummary,
    findings: findingTraces,
    judgeSummaries,
  };
}

// ─── Text Formatter ─────────────────────────────────────────────────────────

/**
 * Format an evaluation trace as human-readable text output.
 */
export function formatTraceText(trace: EvaluationTrace): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           Judges Panel — Evaluation Trace                    ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  if (trace.filePath) lines.push(`  File      : ${trace.filePath}`);
  lines.push(`  Language  : ${trace.language}`);
  lines.push(`  Judges    : ${trace.judgesRun}`);
  lines.push(`  Raw       : ${trace.rawFindingCount} findings detected`);
  lines.push(`  Final     : ${trace.finalFindingCount} findings reported`);
  lines.push(`  Filtered  : ${trace.rawFindingCount - trace.finalFindingCount} findings suppressed`);
  lines.push("");

  // Judge timing breakdown
  lines.push("  ─── Judge Execution ────────────────────────────────────────");
  lines.push("");
  for (const j of trace.judgeSummaries) {
    const icon = j.findingsProduced > 0 ? "🔍" : "✅";
    lines.push(`  ${icon} ${j.judgeName.padEnd(35)} ${j.findingsProduced} finding(s)  ${j.durationMs}ms`);
  }
  lines.push("");

  // Suppression summary
  if (trace.suppressionSummary.length > 0) {
    lines.push("  ─── Suppression Summary ────────────────────────────────────");
    lines.push("");
    for (const s of trace.suppressionSummary) {
      lines.push(`  ⊘ ${s.stage.padEnd(30)} ${s.count} finding(s) removed`);
    }
    lines.push("");
  }

  // Per-finding traces
  lines.push("  ─── Finding Decision Traces ────────────────────────────────");
  lines.push("");

  for (const f of trace.findings) {
    const icon = f.disposition === "reported" ? "📋" : f.disposition === "merged" ? "🔀" : "⊘";
    lines.push(`  ${icon} [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}`);
    lines.push(`    Disposition: ${f.disposition.toUpperCase()}`);

    for (const step of f.steps) {
      const actionIcon =
        step.action === "kept"
          ? "  →"
          : step.action === "suppressed"
            ? "  ✗"
            : step.action === "demoted"
              ? "  ↓"
              : step.action === "boosted"
                ? "  ↑"
                : step.action === "merged"
                  ? "  ⊕"
                  : step.action === "added"
                    ? "  +"
                    : step.action === "capped"
                      ? "  ⌐"
                      : "  ?";
      lines.push(`  ${actionIcon} [${step.stage}] ${step.reason}`);
    }

    if (f.confidenceJourney) {
      lines.push(
        `    Confidence: ${(f.confidenceJourney.initial * 100).toFixed(0)}% → ${(f.confidenceJourney.final * 100).toFixed(0)}%`,
      );
      for (const adj of f.confidenceJourney.adjustments) {
        lines.push(`      ${adj.trim()}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
