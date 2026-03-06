import * as vscode from "vscode";
import {
  evaluateWithTribunal,
  JUDGES,
  buildTribunalDeepReviewSection,
  buildSimplifiedDeepReviewSection,
  isContentPolicyRefusal,
  DEEP_REVIEW_PROMPT_INTRO,
  DEEP_REVIEW_IDENTITY,
} from "@kevinrabun/judges/api";
import type { Finding, Patch } from "@kevinrabun/judges/api";

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning,
  low: vscode.DiagnosticSeverity.Information,
  info: vscode.DiagnosticSeverity.Hint,
};

const LANG_MAP: Record<string, string> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "javascript",
  javascriptreact: "javascript",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  terraform: "terraform",
  bicep: "bicep",
  powershell: "powershell",
};

interface FindingWithPatch extends Finding {
  patch?: Patch;
}

export interface FindingsChangedEvent {
  uri: vscode.Uri;
  findings: Finding[];
}

/**
 * Manages diagnostics and findings for the Judges extension.
 * Caches findings per-document for code action support.
 */
export class JudgesDiagnosticProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private findingsMap = new Map<string, FindingWithPatch[]>();
  /** Code snapshot at the time findings were cached — used to detect stale patches. */
  private codeSnapshotMap = new Map<string, string>();
  /** Emitted whenever findings are published for a file (used by the findings panel). */
  private _onFindingsChanged = new vscode.EventEmitter<FindingsChangedEvent>();

  /** Subscribe to findings updates (used by the findings panel TreeView). */
  onFindingsChanged = this._onFindingsChanged.event;

  constructor(diagnosticCollection: vscode.DiagnosticCollection) {
    this.diagnosticCollection = diagnosticCollection;
  }

  /**
   * Evaluate a document and publish diagnostics.
   * Skips re-evaluation if the code hasn't changed since the last run
   * (prevents the on-save handler from overwriting chat-review findings).
   */
  evaluate(document: vscode.TextDocument): void {
    const language = LANG_MAP[document.languageId];
    if (!language) return;

    const code = document.getText();
    if (!code.trim()) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    // Skip re-evaluation if the code hasn't changed since the last evaluation.
    // This avoids overwriting chat-review findings (which bypass severity
    // filters and include patches) with filtered on-save results.
    const key = document.uri.toString();
    const snapshot = this.codeSnapshotMap.get(key);
    if (snapshot === code && this.findingsMap.has(key)) {
      return;
    }

    this.runEvaluation(document, code, language);
  }

  /**
   * Force a fresh evaluation even if the code hasn't changed.
   * Used by the manual "Evaluate File" command (user may have changed settings).
   */
  forceEvaluate(document: vscode.TextDocument): void {
    const language = LANG_MAP[document.languageId];
    if (!language) return;

    const code = document.getText();
    if (!code.trim()) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    // Clear snapshot so runEvaluation stores fresh data
    this.codeSnapshotMap.delete(document.uri.toString());
    this.runEvaluation(document, code, language);
  }

  private runEvaluation(document: vscode.TextDocument, code: string, language: string): void {
    const config = vscode.workspace.getConfiguration("judges");
    const minSeverity = config.get<string>("minSeverity", "medium");
    const enabledJudges = config.get<string[]>("enabledJudges", []);
    const confidenceTier = config.get<string>("confidenceTier", "important");

    // Confidence tier → minimum confidence threshold
    const confidenceThresholds: Record<string, number> = {
      essential: 0.8,
      important: 0.6,
      supplementary: 0,
    };
    const minConfidence = confidenceThresholds[confidenceTier] ?? 0.6;

    try {
      // Pass filePath so FP heuristics can use path-based file classification
      // (e.g. commands/ → CLI tool, tests/ → test file).
      // Use verdict.findings which includes dedup, FP filtering, calibration,
      // and per-file capping — NOT verdict.evaluations which has raw per-judge output.
      const filePath = document.uri.fsPath;
      const verdict = evaluateWithTribunal(code, language, undefined, { filePath });
      const allFindings = verdict.findings;

      // Filter by severity
      const severityOrder = ["critical", "high", "medium", "low", "info"];
      const minIdx = severityOrder.indexOf(minSeverity);
      let filtered = allFindings.filter((f) => {
        const idx = severityOrder.indexOf(f.severity);
        return idx >= 0 && idx <= minIdx;
      });

      // Filter by confidence tier
      if (minConfidence > 0) {
        filtered = filtered.filter((f) => (f.confidence ?? 0.5) >= minConfidence);
      }

      // Filter by enabled judges
      const finalFindings =
        enabledJudges.length > 0
          ? filtered.filter((f) => enabledJudges.some((j) => f.ruleId.toLowerCase().startsWith(j.toLowerCase())))
          : filtered;

      this.publishFindings(document, finalFindings, code);
    } catch (error) {
      console.error("Judges evaluation error:", error);
    }
  }

  /**
   * Populate the cache with pre-computed findings (e.g. from a chat review)
   * and publish diagnostics — avoids a redundant evaluateWithTribunal() call.
   */
  populateFindings(document: vscode.TextDocument, findings: FindingWithPatch[]): void {
    this.publishFindings(document, findings, document.getText());
  }

  /**
   * Store findings in cache and publish them as VS Code diagnostics.
   */
  private publishFindings(document: vscode.TextDocument, findings: FindingWithPatch[], code?: string): void {
    const key = document.uri.toString();
    this.findingsMap.set(key, findings);
    if (code !== undefined) {
      this.codeSnapshotMap.set(key, code);
    }
    const diagnostics = findings.map((f) => this.findingToDiagnostic(document, f));
    this.diagnosticCollection.set(document.uri, diagnostics);
    this._onFindingsChanged.fire({ uri: document.uri, findings });
  }

  /**
   * Auto-fix all fixable findings in a document.
   */
  async fix(document: vscode.TextDocument): Promise<{ applied: number; fixable: number; evaluated: boolean }> {
    const key = document.uri.toString();
    const currentCode = document.getText();
    let findings = this.findingsMap.get(key);
    let evaluated = false;

    // If no cached findings, or cached findings were generated from different
    // code (stale due to edits or on-save re-evaluation race), run a fresh
    // evaluation so patches are guaranteed to match the current document.
    const snapshot = this.codeSnapshotMap.get(key);
    if (!findings || snapshot !== currentCode) {
      this.evaluate(document);
      findings = this.findingsMap.get(key);
      evaluated = true;
    }

    if (!findings || findings.length === 0) {
      return { applied: 0, fixable: 0, evaluated };
    }

    const fixable = findings.filter((f) => f.patch);
    if (fixable.length === 0) {
      return { applied: 0, fixable: 0, evaluated };
    }

    let applied = this.applyPatches(document, fixable);

    // If cached patches all failed but we haven't re-evaluated yet, the cache
    // may have been overwritten by the on-save handler between the chat review
    // and the button click. Re-evaluate to get fresh patches and retry.
    if (applied === 0 && !evaluated) {
      this.evaluate(document);
      findings = this.findingsMap.get(key);
      evaluated = true;
      if (findings) {
        const freshFixable = findings.filter((f) => f.patch);
        if (freshFixable.length > 0) {
          applied = this.applyPatches(document, freshFixable);
        }
      }
    }

    if (applied > 0) {
      const edit = this.pendingEdit!;
      this.pendingEdit = undefined;
      const success = await vscode.workspace.applyEdit(edit);
      if (success) {
        // Re-evaluate after fixes
        setTimeout(() => this.evaluate(document), 500);
      }
      return { applied: success ? applied : 0, fixable: fixable.length, evaluated };
    }

    this.pendingEdit = undefined;
    return { applied: 0, fixable: fixable.length, evaluated };
  }

  /**
   * Try to apply patches to the document. Returns the number that matched.
   * Stores the WorkspaceEdit in this.pendingEdit for the caller to apply.
   */
  private pendingEdit: vscode.WorkspaceEdit | undefined;

  private applyPatches(document: vscode.TextDocument, fixable: FindingWithPatch[]): number {
    const edit = new vscode.WorkspaceEdit();
    let applied = 0;

    // Sort bottom-to-top for stable line numbers
    const sorted = [...fixable].sort((a, b) => {
      const aLine = a.patch!.startLine;
      const bLine = b.patch!.startLine;
      return bLine - aLine;
    });

    for (const f of sorted) {
      const patch = f.patch!;
      const startLine = Math.max(0, patch.startLine - 1);
      const endLine = patch.endLine;
      const range = new vscode.Range(startLine, 0, endLine, 0);

      // Get actual text in range and verify
      const regionText = document.getText(range);
      if (regionText.includes(patch.oldText)) {
        const newText = regionText.replace(patch.oldText, patch.newText);
        edit.replace(document.uri, range, newText);
        applied++;
      }
    }

    if (applied > 0) {
      this.pendingEdit = edit;
    }
    return applied;
  }

  /**
   * Get cached findings for a document (used by code action provider).
   */
  getFindings(uri: string): FindingWithPatch[] {
    return this.findingsMap.get(uri) || [];
  }

  /**
   * Send current deterministic findings to the VS Code Language Model API
   * for false-positive review. The LLM examines each finding against the
   * actual code context and removes those it identifies as false positives.
   * Remaining findings are re-published as diagnostics.
   */
  async refineWithAI(document: vscode.TextDocument): Promise<{ original: number; refined: number }> {
    const key = document.uri.toString();
    const findings = this.findingsMap.get(key);
    if (!findings || findings.length === 0) {
      return { original: 0, refined: 0 };
    }

    const code = document.getText();
    const original = findings.length;

    // Build a prompt asking the LLM to identify false positives
    const findingsList = findings
      .map((f, i) => {
        const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
        const lineContext =
          f.lineNumbers?.length && f.lineNumbers[0] > 0
            ? `\n   Code: ${document.lineAt(Math.min(f.lineNumbers[0] - 1, document.lineCount - 1)).text.trim()}`
            : "";
        return `${i + 1}. [${f.ruleId}] ${f.title}${lineRef}\n   ${f.description}${lineContext}`;
      })
      .join("\n");

    const prompt =
      `You are a false-positive reviewer for a static analysis tool called Judges Panel.\n` +
      `Below is the source code followed by ${original} deterministic findings.\n` +
      `Review each finding against the actual code and determine if it is a TRUE positive or FALSE positive.\n\n` +
      `A finding is a FALSE POSITIVE if:\n` +
      `- The flagged pattern appears inside a string literal, comment, or example code\n` +
      `- The issue is already mitigated by nearby code (e.g. logging near an admin operation)\n` +
      `- The variable is function-scoped but flagged as global state\n` +
      `- The code is a static analysis rule definition that contains example patterns\n` +
      `- The template literal or regex was misinterpreted as a hardcoded value\n\n` +
      `Respond with ONLY a JSON array of the finding numbers (1-based) that are TRUE positives.\n` +
      `Example: [1, 3, 5] means findings 1, 3, and 5 are real issues; all others are false positives.\n` +
      `If ALL findings are true positives, return all numbers.\n` +
      `If ALL are false positives, return [].\n` +
      `Return ONLY the JSON array, no other text.\n\n` +
      `--- SOURCE CODE ---\n${code}\n\n` +
      `--- FINDINGS ---\n${findingsList}`;

    try {
      // Use VS Code Language Model API
      // Use any available model (no hardcoded preference)
      const models = await vscode.lm.selectChatModels();
      const model = models[0];
      if (!model) {
        vscode.window.showWarningMessage("Judges: No language model available for AI refinement.");
        return { original, refined: original };
      }
      return await this.runLmRefinement(model, prompt, document, findings, original);
    } catch (error) {
      console.error("Judges: AI refinement error:", error);
      vscode.window.showWarningMessage(
        `Judges: AI refinement failed — ${error instanceof Error ? error.message : String(error)}`,
      );
      return { original, refined: original };
    }
  }

  private async runLmRefinement(
    model: vscode.LanguageModelChat,
    prompt: string,
    document: vscode.TextDocument,
    findings: FindingWithPatch[],
    original: number,
  ): Promise<{ original: number; refined: number }> {
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    // Collect streamed response
    let responseText = "";
    for await (const chunk of response.text) {
      responseText += chunk;
    }

    // Parse the JSON array of true-positive indices
    const jsonMatch = responseText.match(/\[[\d\s,]*\]/);
    if (!jsonMatch) {
      vscode.window.showWarningMessage("Judges: Could not parse AI refinement response.");
      return { original, refined: original };
    }

    const truePositiveIndices: number[] = JSON.parse(jsonMatch[0]);
    const truePositiveSet = new Set(truePositiveIndices);

    // Filter to only true positives (1-based indices from the LLM)
    const refined = findings.filter((_, i) => truePositiveSet.has(i + 1));
    this.publishFindings(document, refined, document.getText());

    return { original, refined: refined.length };
  }

  /**
   * Run combined Layer 1 (deterministic) + Layer 2 (LLM deep review) analysis.
   * Returns a markdown string with the full report, suitable for display in
   * a new editor tab or output channel.
   */
  async deepReview(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    onProgress?: (message: string) => void,
  ): Promise<{ markdown: string; findingsCount: number }> {
    const language = LANG_MAP[document.languageId];
    if (!language) {
      return { markdown: `Language **${document.languageId}** is not supported.`, findingsCount: 0 };
    }

    const code = document.getText();
    if (!code.trim()) {
      return { markdown: "The file is empty — nothing to evaluate.", findingsCount: 0 };
    }

    // ── Layer 1: Deterministic Evaluation ──
    onProgress?.("Layer 1 — Running deterministic analysis…");
    const verdict = evaluateWithTribunal(code, language);
    const findings = verdict.evaluations.flatMap((e) => e.findings);
    this.publishFindings(document, findings, code);

    if (token.isCancellationRequested) {
      return { markdown: "", findingsCount: findings.length };
    }

    let md = `# Judges Panel — Deep Review\n\n`;
    md += `**File:** ${vscode.workspace.asRelativePath(document.uri)}\n\n`;
    md += `## Layer 1 — Deterministic Analysis\n\n`;
    md += `**Score:** ${verdict.overallScore}/100  |  **Findings:** ${findings.length}\n\n`;

    if (findings.length > 0) {
      for (const f of findings) {
        const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
        md += `- **[${f.severity.toUpperCase()}] \`${f.ruleId}\`** ${f.title}${lineRef}\n`;
        md += `  ${f.description}\n\n`;
      }
    } else {
      md += `All ${verdict.evaluations.length} judges passed — no pattern-based findings. ✅\n\n`;
    }

    // ── Layer 2: LLM Deep Review ──
    const findingsSummary = findings
      .map((f, i) => {
        const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
        return `${i + 1}. [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title}${lineRef}\n   ${f.description}`;
      })
      .join("\n");

    const deepReviewSection = buildTribunalDeepReviewSection(JUDGES, language);

    const codeAndFindings =
      `--- SOURCE CODE (${language}) ---\n${code}\n\n` +
      `--- LAYER 1 FINDINGS (${findings.length} pattern-based) ---\n` +
      (findings.length > 0 ? findingsSummary : "(No pattern-based findings)") +
      `\n\n`;

    const prompt = DEEP_REVIEW_PROMPT_INTRO + codeAndFindings + deepReviewSection;

    try {
      // Use any available model (no hardcoded preference)
      onProgress?.("Layer 2 — Selecting language model…");
      const models = await vscode.lm.selectChatModels();
      let model = models[0];
      if (!model) {
        md += `---\n\n## ⚠️ Layer 2 Unavailable\n\n`;
        md += `No language model is available for the AI deep review.\n`;
        return { markdown: md, findingsCount: findings.length };
      }

      if (token.isCancellationRequested) {
        return { markdown: md, findingsCount: findings.length };
      }

      md += `---\n\n## Layer 2 — AI Deep Contextual Review\n\n`;

      const identityMsg = vscode.LanguageModelChatMessage.Assistant(DEEP_REVIEW_IDENTITY);
      const messages = [identityMsg, vscode.LanguageModelChatMessage.User(prompt)];

      // Try sending; if the first model fails, try an alternative
      onProgress?.("Layer 2 — Sending request to AI model…");
      let response: vscode.LanguageModelChatResponse;
      try {
        response = await model.sendRequest(messages, {}, token);
      } catch (sendError) {
        onProgress?.("Layer 2 — Trying alternative model…");
        const fallbackModels = await vscode.lm.selectChatModels();
        const fallback = fallbackModels.find((m) => m.id !== model!.id) ?? fallbackModels[0];
        if (!fallback) throw sendError;
        model = fallback;
        response = await model.sendRequest(messages, {}, token);
      }

      // ── Two-phase streaming with early refusal detection ──
      // Content-policy refusals are always < 300 chars (isContentPolicyRefusal
      // returns false for longer responses). Buffer the first 500 chars to
      // detect refusals, then accumulate remaining response.
      const REFUSAL_BUFFER_LIMIT = 500;
      let responseText = "";
      let refusalCleared = false;

      onProgress?.("Layer 2 — AI model is analyzing code…");

      for await (const chunk of response.text) {
        if (token.isCancellationRequested) break;
        responseText += chunk;

        if (!refusalCleared && responseText.length >= REFUSAL_BUFFER_LIMIT) {
          refusalCleared = true;
          onProgress?.("Layer 2 — Processing AI analysis…");
        }
      }

      if (!isContentPolicyRefusal(responseText)) {
        md += responseText;
      } else {
        // Retry with simplified prompt
        onProgress?.("Layer 2 — Content policy triggered, retrying…");
        const simplifiedSection = buildSimplifiedDeepReviewSection(language);
        const retryPrompt = DEEP_REVIEW_PROMPT_INTRO + codeAndFindings + simplifiedSection;

        const altModels = await vscode.lm.selectChatModels();
        const altModel = altModels.find((m) => m.id !== model!.id) ?? model;

        const retryMessages = [identityMsg, vscode.LanguageModelChatMessage.User(retryPrompt)];
        onProgress?.("Layer 2 — Sending simplified request…");
        const retryResponse = await altModel.sendRequest(retryMessages, {}, token);

        let retryText = "";
        onProgress?.("Layer 2 — AI model is re-analyzing…");
        for await (const chunk of retryResponse.text) {
          if (token.isCancellationRequested) break;
          retryText += chunk;
        }

        if (!isContentPolicyRefusal(retryText)) {
          md += retryText;
        } else {
          md += `The AI model declined this review. This can happen with code that combines `;
          md += `privacy/security infrastructure with security evaluation criteria. `;
          md += `Layer 1 findings above are still valid.\n`;
        }
      }

      md += "\n";
    } catch (error) {
      if (!(error instanceof vscode.CancellationError)) {
        md += `---\n\n## ⚠️ Layer 2 Error\n\n`;
        md += `AI deep review failed: ${error instanceof Error ? error.message : String(error)}\n`;
      }
    }

    return { markdown: md, findingsCount: findings.length };
  }

  private findingToDiagnostic(document: vscode.TextDocument, finding: Finding): vscode.Diagnostic {
    const line = (finding.lineNumbers?.[0] ?? 1) - 1;
    const safeLine = Math.min(line, document.lineCount - 1);
    const lineText = document.lineAt(safeLine).text;

    const range = new vscode.Range(safeLine, 0, safeLine, lineText.length);

    const severity = SEVERITY_MAP[finding.severity] ?? vscode.DiagnosticSeverity.Warning;

    const diagnostic = new vscode.Diagnostic(range, `${finding.title}: ${finding.description}`, severity);
    diagnostic.source = "Judges";
    diagnostic.code = finding.ruleId;

    if (finding.suggestedFix) {
      diagnostic.message += `\n💡 Fix: ${finding.suggestedFix}`;
    }

    return diagnostic;
  }
}
