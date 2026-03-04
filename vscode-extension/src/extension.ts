import * as vscode from "vscode";
import { JudgesDiagnosticProvider } from "./diagnostics";
import { JudgesCodeActionProvider } from "./code-actions";
import { registerChatParticipant } from "./chat-participant";
import { registerLmTools } from "./lm-tool";

let diagnosticProvider: JudgesDiagnosticProvider;

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("judges");
  diagnosticProvider = new JudgesDiagnosticProvider(diagnosticCollection);

  // ─── MCP Server Auto-Configuration ───────────────────────────────────
  // Register the Judges MCP server so Copilot / LMs can use Layer 2
  // (expert-persona prompts) without any manual configuration.

  registerMcpServer(context);

  // ─── Chat Participant & LM Tools ─────────────────────────────────────
  // Register @judges chat participant (natural-language commands) and
  // judges_evaluate LM tool (Copilot auto-discovery). These let users
  // trigger evaluations via chat without knowing about the extension.

  registerChatParticipant(context, diagnosticProvider);
  registerLmTools(context);

  // ─── Commands ─────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("judges.evaluateFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        diagnosticProvider.forceEvaluate(editor.document);
        vscode.window.showInformationMessage("Judges: Evaluation complete.");
      } else {
        vscode.window.showWarningMessage("Judges: No file is open. Open a file to evaluate.");
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

    vscode.commands.registerCommand("judges.fixFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const result = await diagnosticProvider.fix(editor.document);
        if (result.applied > 0) {
          vscode.window.showInformationMessage(`Judges: Applied ${result.applied} fix(es).`);
        } else if (result.fixable === 0) {
          vscode.window.showInformationMessage("Judges: No auto-fixable findings.");
        } else {
          vscode.window.showInformationMessage("Judges: Fixes could not be applied (code may have changed).");
        }
      } else {
        vscode.window.showWarningMessage("Judges: No file is open. Open a file to fix.");
      }
    }),

    vscode.commands.registerCommand("judges.clearDiagnostics", () => {
      diagnosticCollection.clear();
      vscode.window.showInformationMessage("Judges: Diagnostics cleared.");
    }),

    vscode.commands.registerCommand("judges.refineWithAI", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Judges: No file is open. Open a file to refine.");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Judges: Reviewing findings with AI…",
          cancellable: false,
        },
        async () => {
          const result = await diagnosticProvider.refineWithAI(editor.document);
          if (result.original === 0) {
            vscode.window.showInformationMessage("Judges: No findings to refine.");
          } else {
            const removed = result.original - result.refined;
            vscode.window.showInformationMessage(
              `Judges: AI review complete — ${removed} false positive(s) removed, ${result.refined} finding(s) confirmed.`,
            );
          }
        },
      );
    }),

    vscode.commands.registerCommand("judges.deepReview", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Judges: No file is open. Open a file to deep-review.");
        return;
      }

      const cts = new vscode.CancellationTokenSource();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Judges: Running deep review (Layer 1 + Layer 2)…",
          cancellable: true,
        },
        async (progress, progressToken) => {
          progressToken.onCancellationRequested(() => cts.cancel());

          const result = await diagnosticProvider.deepReview(editor.document, cts.token, (msg) =>
            progress.report({ message: msg }),
          );

          if (cts.token.isCancellationRequested) return;

          // Open the report in a new markdown preview tab
          const doc = await vscode.workspace.openTextDocument({
            content: result.markdown,
            language: "markdown",
          });
          await vscode.window.showTextDocument(doc, { preview: true });
        },
      );

      cts.dispose();
    }),

    vscode.commands.registerCommand("judges.showPanel", () => {
      vscode.window.showInformationMessage("Judges: Results panel coming soon.");
    }),

    vscode.commands.registerCommand("judges.configureMcp", () => configureMcpManually()),
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
    "terraform",
    "bicep",
    "powershell",
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

// ─── MCP Server Registration ──────────────────────────────────────────────

/**
 * Register the Judges MCP server via the VS Code MCP provider API.
 * This makes the 37 expert-persona prompts (Layer 2) automatically available
 * to Copilot and other LMs — zero manual configuration required.
 */
function registerMcpServer(context: vscode.ExtensionContext): void {
  try {
    if (!vscode.lm?.registerMcpServerDefinitionProvider) {
      return; // API not available (older VS Code) — skip silently
    }

    context.subscriptions.push(
      vscode.lm.registerMcpServerDefinitionProvider("judges-mcp", {
        provideMcpServerDefinitions: () => [
          new vscode.McpStdioServerDefinition("Judges Panel", "npx", ["-y", "@kevinrabun/judges"]),
        ],
      }),
    );
  } catch {
    // Graceful degradation — Layer 1 still works without MCP
  }
}

/**
 * Manual MCP configuration command — writes the server definition to
 * .vscode/mcp.json for users who prefer explicit workspace config or
 * whose environment doesn't support the provider API.
 */
async function configureMcpManually(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    vscode.window.showWarningMessage("Judges: Open a workspace folder first.");
    return;
  }

  const mcpJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, ".vscode", "mcp.json");

  // Check if mcp.json already exists and has the judges server
  let existingConfig: Record<string, unknown> = {};
  try {
    const raw = await vscode.workspace.fs.readFile(mcpJsonUri);
    existingConfig = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    // File doesn't exist yet — that's fine
  }

  const servers = (existingConfig.servers ?? {}) as Record<string, unknown>;
  if (servers["judges"]) {
    vscode.window.showInformationMessage("Judges: MCP server is already configured in .vscode/mcp.json");
    return;
  }

  servers["judges"] = {
    command: "npx",
    args: ["-y", "@kevinrabun/judges"],
  };
  existingConfig.servers = servers;

  const content = Buffer.from(JSON.stringify(existingConfig, null, 2) + "\n", "utf8");
  await vscode.workspace.fs.writeFile(mcpJsonUri, content);

  vscode.window.showInformationMessage("Judges: MCP server configured in .vscode/mcp.json ✓");
}
