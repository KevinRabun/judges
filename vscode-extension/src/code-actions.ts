import * as vscode from "vscode";
import type { JudgesDiagnosticProvider } from "./diagnostics";

/**
 * Provides quick-fix code actions for Judges findings that have patches.
 */
export class JudgesCodeActionProvider implements vscode.CodeActionProvider {
  private diagnosticProvider: JudgesDiagnosticProvider;

  constructor(diagnosticProvider: JudgesDiagnosticProvider) {
    this.diagnosticProvider = diagnosticProvider;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Only produce actions for judges diagnostics
    const judgesDiagnostics = context.diagnostics.filter((d) => d.source === "Judges");
    if (judgesDiagnostics.length === 0) return actions;

    const findings = this.diagnosticProvider.getFindings(document.uri.toString());

    for (const diag of judgesDiagnostics) {
      // Find matching finding with a patch
      const finding = findings.find((f) => f.ruleId === diag.code && f.patch);

      if (finding?.patch) {
        const action = new vscode.CodeAction(
          `Fix: ${finding.title} (${finding.ruleId})`,
          vscode.CodeActionKind.QuickFix,
        );

        const patch = finding.patch;
        const edit = new vscode.WorkspaceEdit();

        // Calculate range for the patch
        const startLine = Math.max(0, patch.startLine - 1);
        const endLine = patch.endLine;
        const patchRange = new vscode.Range(startLine, 0, endLine, 0);

        const regionText = document.getText(patchRange);
        if (regionText.includes(patch.oldText)) {
          const newText = regionText.replace(patch.oldText, patch.newText);
          edit.replace(document.uri, patchRange, newText);
          action.edit = edit;
          action.diagnostics = [diag];
          action.isPreferred = finding.severity === "critical" || finding.severity === "high";
          actions.push(action);
        }
      }

      // Always add a "learn more" action
      const learnAction = new vscode.CodeAction(`Learn more: ${diag.code}`, vscode.CodeActionKind.QuickFix);
      learnAction.command = {
        command: "vscode.open",
        title: "Open documentation",
        arguments: [vscode.Uri.parse(`https://github.com/KevinRabun/judges#${String(diag.code).toLowerCase()}`)],
      };
      learnAction.diagnostics = [diag];
      actions.push(learnAction);
    }

    return actions;
  }
}
