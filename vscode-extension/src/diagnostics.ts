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

  constructor(diagnosticCollection: vscode.DiagnosticCollection) {
    this.diagnosticCollection = diagnosticCollection;
  }

  /**
   * Evaluate a document and publish diagnostics.
   */
  evaluate(document: vscode.TextDocument): void {
    const language = LANG_MAP[document.languageId];
    if (!language) return;

    const code = document.getText();
    if (!code.trim()) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

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

      // Cache findings for code actions
      this.findingsMap.set(document.uri.toString(), finalFindings);

      // Convert to diagnostics
      const diagnostics = finalFindings.map((f) => this.findingToDiagnostic(document, f));
      this.diagnosticCollection.set(document.uri, diagnostics);
    } catch (error) {
      console.error("Judges evaluation error:", error);
    }
  }

  /**
   * Auto-fix all fixable findings in a document.
   */
  async fix(document: vscode.TextDocument): Promise<{ applied: number; fixable: number; evaluated: boolean }> {
    let findings = this.findingsMap.get(document.uri.toString());

    // If no cached findings, run evaluation first so the button works
    // from chat context where evaluate() was never called on this provider
    let evaluated = false;
    if (!findings) {
      this.evaluate(document);
      findings = this.findingsMap.get(document.uri.toString());
      evaluated = true;
    }

    if (!findings || findings.length === 0) {
      return { applied: 0, fixable: 0, evaluated };
    }

    const fixable = findings.filter((f) => f.patch);
    if (fixable.length === 0) {
      return { applied: 0, fixable: 0, evaluated };
    }

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
      const success = await vscode.workspace.applyEdit(edit);
      if (success) {
        // Re-evaluate after fixes
        setTimeout(() => this.evaluate(document), 500);
      }
      return { applied: success ? applied : 0, fixable: fixable.length, evaluated };
    }

    return { applied: 0, fixable: fixable.length, evaluated };
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
