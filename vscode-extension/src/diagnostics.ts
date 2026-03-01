import * as vscode from "vscode";
import { evaluateWithTribunal } from "@kevinrabun/judges/api";
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
};

interface FindingWithPatch extends Finding {
  patch?: Patch;
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

    try {
      const verdict = evaluateWithTribunal(code, language);
      const allFindings = verdict.evaluations.flatMap((e) => e.findings);

      // Filter by severity
      const severityOrder = ["critical", "high", "medium", "low", "info"];
      const minIdx = severityOrder.indexOf(minSeverity);
      const filtered = allFindings.filter((f) => {
        const idx = severityOrder.indexOf(f.severity);
        return idx >= 0 && idx <= minIdx;
      });

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
