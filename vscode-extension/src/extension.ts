import * as vscode from "vscode";
import { JudgesDiagnosticProvider } from "./diagnostics";
import { JudgesCodeActionProvider } from "./code-actions";

let diagnosticProvider: JudgesDiagnosticProvider;

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("judges");
  diagnosticProvider = new JudgesDiagnosticProvider(diagnosticCollection);

  // ─── Commands ─────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("judges.evaluateFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        diagnosticProvider.evaluate(editor.document);
        vscode.window.showInformationMessage("Judges: Evaluation complete.");
      }
    }),

    vscode.commands.registerCommand("judges.evaluateWorkspace", async () => {
      const files = await vscode.workspace.findFiles("**/*.{ts,js,py,go,rs,java,cs,cpp}", "**/node_modules/**");
      let count = 0;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Judges: Evaluating workspace…" },
        async (progress) => {
          for (const uri of files) {
            progress.report({ message: `[${++count}/${files.length}] ${vscode.workspace.asRelativePath(uri)}` });
            const doc = await vscode.workspace.openTextDocument(uri);
            diagnosticProvider.evaluate(doc);
          }
        },
      );
      vscode.window.showInformationMessage(`Judges: Evaluated ${files.length} files.`);
    }),

    vscode.commands.registerCommand("judges.fixFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        diagnosticProvider.fix(editor.document);
      }
    }),

    vscode.commands.registerCommand("judges.clearDiagnostics", () => {
      diagnosticCollection.clear();
      vscode.window.showInformationMessage("Judges: Diagnostics cleared.");
    }),

    vscode.commands.registerCommand("judges.showPanel", () => {
      vscode.window.showInformationMessage("Judges: Results panel coming soon.");
    }),
  );

  // ─── Code Action Provider ────────────────────────────────────────────

  const supportedLanguages = [
    "typescript",
    "javascript",
    "typescriptreact",
    "javascriptreact",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "cpp",
  ];

  for (const lang of supportedLanguages) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { language: lang, scheme: "file" },
        new JudgesCodeActionProvider(diagnosticProvider),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
      ),
    );
  }

  // ─── On-Save Evaluation ──────────────────────────────────────────────

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const config = vscode.workspace.getConfiguration("judges");
      if (!config.get<boolean>("evaluateOnSave", true)) return;

      const debounceMs = config.get<number>("debounceMs", 1000);

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        diagnosticProvider.evaluate(document);
      }, debounceMs);
    }),
  );

  // ─── Status Bar ──────────────────────────────────────────────────────

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "judges.evaluateFile";
  statusBar.text = "$(shield) Judges";
  statusBar.tooltip = "Click to evaluate with Judges Panel";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(diagnosticCollection);
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
