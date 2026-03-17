import * as vscode from "vscode";
import { JudgesDiagnosticProvider } from "./diagnostics";
import { JudgesCodeActionProvider } from "./code-actions";
import { JudgesCodeLensProvider } from "./codelens";
import { JudgesFindingsPanel } from "./findings-panel";
import { registerChatParticipant } from "./chat-participant";
import { registerLmTools } from "./lm-tool";
import { runLlmBenchmark, saveResultsToWorkspace } from "./llm-benchmark-runner";
import type { Finding } from "@kevinrabun/judges/api";

let diagnosticProvider: JudgesDiagnosticProvider;
let findingsPanel: JudgesFindingsPanel;

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("judges");
  diagnosticProvider = new JudgesDiagnosticProvider(diagnosticCollection);

  // ─── Findings Panel (Tree View) ──────────────────────────────────────
  findingsPanel = new JudgesFindingsPanel();
  const treeView = vscode.window.createTreeView("judges.findingsPanel", {
    treeDataProvider: findingsPanel,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Wire diagnostic provider → findings panel so the panel updates live
  diagnosticProvider.onFindingsChanged((e) => {
    findingsPanel.updateFindings(e.uri, e.findings);
  });

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

    vscode.commands.registerCommand("judges.evaluateDiff", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const result = diagnosticProvider.evaluateDiffAware(editor.document);
        vscode.window.showInformationMessage(
          `Judges: Diff-aware evaluation complete — ${result.diffFiltered} finding(s) on changed lines (${result.total} total).`,
        );
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

    vscode.commands.registerCommand("judges.fixAll", async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Judges: Applying all safe fixes…",
          cancellable: false,
        },
        () => diagnosticProvider.fixAll(),
      );
      if (result.applied > 0) {
        vscode.window.showInformationMessage(
          `Judges: Applied ${result.applied} fix(es) across ${result.files} file(s).`,
        );
      } else {
        vscode.window.showInformationMessage("Judges: No auto-fixable findings across open files.");
      }
    }),

    vscode.commands.registerCommand("judges.clearDiagnostics", () => {
      diagnosticCollection.clear();
      findingsPanel.clearAll();
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

    // ─── Skills Quick Pick ────────────────────────────────────────────────
    vscode.commands.registerCommand("judges.skills.quickPick", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Judges: Open a file to run a skill.");
        return;
      }
      const doc = editor.document;
      const code = doc.getText();
      const lang = doc.languageId || "plaintext";

      // Lazy import to avoid bundling issues
      const judgesApi = await import("@kevinrabun/judges");
      const skills = judgesApi.listSkills?.(require("node:path").join(__dirname, "..", "skills")) || [];
      if (!skills.length) {
        vscode.window.showWarningMessage("Judges: No skills found. Ensure the skills/ directory exists.");
        return;
      }
      const pick = await vscode.window.showQuickPick(
        skills.map((s: any) => ({
          label: s.name || s.id,
          description: s.id,
          detail: s.description,
          skill: s.id,
        })),
        { placeHolder: "Select a Judges skill to run" },
      );
      if (!pick) return;
      const verdict = await judgesApi.runSkill?.(pick.skill, code, lang);
      if (!verdict) {
        vscode.window.showWarningMessage(`Judges skill '${pick.skill}' returned no verdict.`);
        return;
      }
      // Render to output channel
      const out = vscode.window.createOutputChannel("Judges Skills");
      out.show(true);
      out.appendLine(`# Skill: ${pick.skill}`);
      out.appendLine(JSON.stringify(verdict, null, 2));
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

    vscode.commands.registerCommand("judges.runLlmBenchmark", async () => {
      const cts = new vscode.CancellationTokenSource();
      const storageUri = context.globalStorageUri;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Judges: Running LLM Benchmark…",
          cancellable: true,
        },
        async (progress, progressToken) => {
          progressToken.onCancellationRequested(() => cts.cancel());

          try {
            const result = await runLlmBenchmark(
              cts.token,
              (p) => {
                progress.report({
                  message: `[${p.completed}/${p.total}] ${p.message}`,
                  increment: p.total > 0 ? (1 / p.total) * 100 : undefined,
                });
              },
              storageUri,
            );

            if (cts.token.isCancellationRequested) {
              vscode.window.showInformationMessage("Judges: LLM Benchmark cancelled — partial results saved.");
              return;
            }

            // Open the report in a new markdown preview tab
            const doc = await vscode.workspace.openTextDocument({
              content: result.reportMarkdown,
              language: "markdown",
            });
            await vscode.window.showTextDocument(doc, { preview: true });

            const f1 = result.perJudge ? `Per-Judge F1: ${(result.perJudge.f1Score * 100).toFixed(1)}%` : "";
            const f1t = result.tribunal ? `Tribunal F1: ${(result.tribunal.f1Score * 100).toFixed(1)}%` : "";

            const action = await vscode.window.showInformationMessage(
              `Judges: LLM Benchmark complete. ${[f1, f1t].filter(Boolean).join(" · ")}`,
              "Save to Workspace",
            );

            if (action === "Save to Workspace") {
              const reportUri = await saveResultsToWorkspace(storageUri);
              if (reportUri) {
                vscode.window.showInformationMessage("Benchmark results saved to benchmarks/ — ready to commit.");
              }
            }
          } catch (error) {
            if (error instanceof vscode.CancellationError) return;
            vscode.window.showErrorMessage(
              `Judges: LLM Benchmark failed — ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      );

      cts.dispose();
    }),

    vscode.commands.registerCommand("judges.saveBenchmarkToWorkspace", async () => {
      const reportUri = await saveResultsToWorkspace(context.globalStorageUri);
      if (reportUri) {
        vscode.window.showInformationMessage("Benchmark results saved to benchmarks/ — ready to commit.");
      }
    }),

    vscode.commands.registerCommand("judges.showPanel", () => {
      vscode.commands.executeCommand("judges.findingsPanel.focus");
    }),

    // ─── Interactive Review Session ──────────────────────────────────────
    // Walk through findings one-by-one with accept/dismiss/fix actions.
    vscode.commands.registerCommand("judges.reviewSession", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Judges: No file is open. Open a file to start a review session.");
        return;
      }

      // Force a fresh evaluation
      diagnosticProvider.forceEvaluate(editor.document);
      const findings = diagnosticProvider.getFindings(editor.document.uri.toString());

      if (findings.length === 0) {
        vscode.window.showInformationMessage("Judges: No findings to review.");
        return;
      }

      // Sort by severity (critical first)
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const sorted = [...findings].sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5));

      let dismissed = 0;
      let accepted = 0;

      for (let i = 0; i < sorted.length; i++) {
        const f = sorted[i];
        const lineRef = f.lineNumbers?.[0] ?? 1;

        // Navigate to the finding location
        const position = new vscode.Position(lineRef - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

        const label = `[${i + 1}/${sorted.length}] ${f.severity.toUpperCase()}: ${f.title}`;
        const detail = f.description;

        const action = await vscode.window.showInformationMessage(
          label,
          { modal: true, detail },
          "Accept",
          "Dismiss",
          "Skip",
          "Stop",
        );

        if (action === "Stop" || action === undefined) break;
        if (action === "Accept") accepted++;
        if (action === "Dismiss") dismissed++;
      }

      vscode.window.showInformationMessage(
        `Review session complete: ${accepted} accepted, ${dismissed} dismissed, ${sorted.length - accepted - dismissed} skipped.`,
      );
    }),

    vscode.commands.registerCommand("judges.sortBySeverity", () => {
      findingsPanel.setSortMode("severity");
    }),

    vscode.commands.registerCommand("judges.sortByFile", () => {
      findingsPanel.setSortMode("file");
    }),

    vscode.commands.registerCommand("judges.sortByRule", () => {
      findingsPanel.setSortMode("rule");
    }),

    vscode.commands.registerCommand("judges.sortByJudge", () => {
      findingsPanel.setSortMode("judge");
    }),

    vscode.commands.registerCommand("judges.filterAll", () => {
      findingsPanel.setFilterSeverity("all");
    }),

    vscode.commands.registerCommand("judges.filterCritical", () => {
      findingsPanel.setFilterSeverity("critical");
    }),

    vscode.commands.registerCommand("judges.filterHigh", () => {
      findingsPanel.setFilterSeverity("high");
    }),

    vscode.commands.registerCommand("judges.filterMedium", () => {
      findingsPanel.setFilterSeverity("medium");
    }),

    vscode.commands.registerCommand("judges.configureMcp", () => configureMcpManually()),

    vscode.commands.registerCommand("judges.addCiWorkflow", () => addCiWorkflow()),

    // ─── Feedback Commands (Thumbs Up/Down) ──────────────────────────────
    vscode.commands.registerCommand(
      "judges.feedbackTp",
      async (ruleId: string, uri: vscode.Uri, line: number, finding?: Finding) => {
        await recordFeedbackEntry(uri, ruleId, "tp", line, finding);
        vscode.window.showInformationMessage(`Judges: Marked ${ruleId} as true positive ✓`);
      },
    ),

    vscode.commands.registerCommand(
      "judges.feedbackFp",
      async (ruleId: string, uri: vscode.Uri, line: number, finding?: Finding) => {
        const comment = await vscode.window.showInputBox({
          prompt: `Why is ${ruleId} a false positive here? (optional)`,
          placeHolder: "Brief explanation…",
        });
        await recordFeedbackEntry(uri, ruleId, "fp", line, finding, comment);
        vscode.window.showInformationMessage(`Judges: Marked ${ruleId} as false positive ✓`);
      },
    ),

    vscode.commands.registerCommand(
      "judges.feedbackWontfix",
      async (ruleId: string, uri: vscode.Uri, line: number, finding?: Finding) => {
        await recordFeedbackEntry(uri, ruleId, "wontfix", line, finding);
        vscode.window.showInformationMessage(`Judges: Marked ${ruleId} as won't fix ✓`);
      },
    ),

    // ─── Preview Fix Diff Command ──────────────────────────────────────
    vscode.commands.registerCommand(
      "judges.previewFixDiff",
      async (uri: vscode.Uri, _range: vscode.Range, oldText: string, newText: string, ruleId: string) => {
        const doc = await vscode.workspace.openTextDocument(uri);
        const originalContent = doc.getText();
        const fixedContent = originalContent.replace(oldText, newText);

        // Create virtual documents for diff view
        const originalUri = vscode.Uri.parse(`judges-original:${uri.path}?${Date.now()}`);
        const fixedUri = vscode.Uri.parse(`judges-fixed:${uri.path}?${Date.now()}`);

        const provider = new (class implements vscode.TextDocumentContentProvider {
          provideTextDocumentContent(u: vscode.Uri): string {
            return u.scheme === "judges-original" ? originalContent : fixedContent;
          }
        })();

        context.subscriptions.push(
          vscode.workspace.registerTextDocumentContentProvider("judges-original", provider),
          vscode.workspace.registerTextDocumentContentProvider("judges-fixed", provider),
        );

        await vscode.commands.executeCommand(
          "vscode.diff",
          originalUri,
          fixedUri,
          `Fix Preview: ${ruleId} — ${vscode.workspace.asRelativePath(uri)}`,
        );
      },
    ),
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
    "php",
    "ruby",
    "kotlin",
    "swift",
  ];

  // ─── CodeLens Provider ───────────────────────────────────────────────
  const codeLensProvider = new JudgesCodeLensProvider((uri) => diagnosticProvider.getFindings(uri));
  diagnosticProvider.onFindingsChanged(() => codeLensProvider.refresh());

  for (const lang of supportedLanguages) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { language: lang, scheme: "file" },
        new JudgesCodeActionProvider(diagnosticProvider),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
      ),
      vscode.languages.registerCodeLensProvider({ language: lang, scheme: "file" }, codeLensProvider),
    );
  }

  // ─── First-Run Toast ──────────────────────────────────────────────────
  // Show a one-time welcome message after the first successful evaluation.

  if (!context.globalState.get<boolean>("judges.hasShownFirstRunToast")) {
    const firstRunDisposable = diagnosticProvider.onFindingsChanged(async (e) => {
      if (e.findings.length === 0) return; // wait for real findings

      await context.globalState.update("judges.hasShownFirstRunToast", true);
      firstRunDisposable.dispose();

      const action = await vscode.window.showInformationMessage(
        "Judges Panel found findings in your code. Type @judges in Copilot Chat for a deep review.",
        "Open Chat",
        "Noise too high? Adjust settings",
      );
      if (action === "Open Chat") {
        vscode.commands.executeCommand("workbench.action.chat.open", "@judges");
      } else if (action?.startsWith("Noise")) {
        vscode.commands.executeCommand("workbench.action.openSettings", "judges.minSeverity");
      }
    });
    context.subscriptions.push(firstRunDisposable);
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

  // ─── Real-Time (On-Change) Evaluation ────────────────────────────────

  let changeDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const config = vscode.workspace.getConfiguration("judges");
      if (!config.get<boolean>("evaluateOnChange", false)) return;

      const document = event.document;
      // Only re-evaluate on actual content changes, not metadata
      if (event.contentChanges.length === 0) return;

      const changeDebounceMs = config.get<number>("changeDebounceMs", 2000);

      if (changeDebounceTimer) clearTimeout(changeDebounceTimer);
      changeDebounceTimer = setTimeout(() => {
        diagnosticProvider.evaluate(document);
      }, changeDebounceMs);
    }),
  );

  // ─── Status Bar ──────────────────────────────────────────────────────

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "judges.evaluateFile";
  statusBar.text = "$(shield) Judges";
  statusBar.tooltip = "Click to evaluate with Judges Panel";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Update status bar when findings change for the active editor
  diagnosticProvider.onFindingsChanged((e) => {
    const activeUri = vscode.window.activeTextEditor?.document.uri.toString();
    if (activeUri === e.uri.toString()) {
      updateStatusBar(statusBar, e.findings);
    }
  });

  // Update status bar when user switches editors
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        statusBar.text = "$(shield) Judges";
        statusBar.tooltip = "Click to evaluate with Judges Panel";
        return;
      }
      const findings = diagnosticProvider.getCachedFindings(editor.document.uri);
      if (findings) {
        updateStatusBar(statusBar, findings);
      } else {
        statusBar.text = "$(shield) Judges";
        statusBar.tooltip = "Click to evaluate with Judges Panel";
      }
    }),
  );

  context.subscriptions.push(diagnosticCollection);
}

export function deactivate(): void {
  // Cleanup handled by disposables
}

// ─── Status Bar Helper ────────────────────────────────────────────────

function updateStatusBar(statusBar: vscode.StatusBarItem, findings: Finding[]): void {
  const fixable = findings.filter((f) => (f as { patch?: unknown }).patch).length;
  if (findings.length === 0) {
    statusBar.text = "$(shield) Judges ✅";
    statusBar.tooltip = "No findings — click to re-evaluate";
  } else {
    const fixSuffix = fixable > 0 ? `, ${fixable} fixable` : "";
    statusBar.text = `$(shield) Judges: ${findings.length} finding(s)${fixSuffix}`;
    statusBar.tooltip = `${findings.length} finding(s)${fixSuffix} — click to re-evaluate`;
  }
}

// ─── MCP Server Registration ──────────────────────────────────────────────

/**
 * Register the Judges MCP server via the VS Code MCP provider API.
 * This makes the 45 expert-persona prompts (Layer 2) automatically available
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

// ─── Feedback Persistence ─────────────────────────────────────────────────

/**
 * Record a feedback entry to the local .judges-feedback.json.
 * Uses the data adapter pattern — judges never hosts user data;
 * data stays in the user's project directory.
 */
async function recordFeedbackEntry(
  uri: vscode.Uri,
  ruleId: string,
  verdict: "tp" | "fp" | "wontfix",
  line: number,
  finding?: Finding,
  comment?: string,
): Promise<void> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const projectDir = workspaceFolder?.uri.fsPath ?? ".";
  const feedbackFile = vscode.Uri.joinPath(vscode.Uri.file(projectDir), ".judges-feedback.json");

  let store: {
    version: 1;
    entries: Array<Record<string, unknown>>;
    metadata: { createdAt: string; lastUpdated: string; totalSubmissions: number };
  };
  try {
    const raw = await vscode.workspace.fs.readFile(feedbackFile);
    store = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    const now = new Date().toISOString();
    store = {
      version: 1,
      entries: [],
      metadata: { createdAt: now, lastUpdated: now, totalSubmissions: 0 },
    };
  }

  store.entries.push({
    ruleId,
    verdict,
    filePath: vscode.workspace.asRelativePath(uri),
    timestamp: new Date().toISOString(),
    title: finding?.title,
    severity: finding?.severity,
    source: "manual",
    ...(comment ? { comment } : {}),
  });
  store.metadata.totalSubmissions = store.entries.length;
  store.metadata.lastUpdated = new Date().toISOString();

  const content = Buffer.from(JSON.stringify(store, null, 2) + "\n", "utf8");
  await vscode.workspace.fs.writeFile(feedbackFile, content);
}

// ─── CI Workflow Generation ───────────────────────────────────────────────

const CI_WORKFLOW_YAML = `name: Judges
on: [pull_request]

permissions:
  contents: read

jobs:
  judges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: KevinRabun/judges@v3
        with:
          preset: security-only
`;

/**
 * Generate a GitHub Actions workflow file at .github/workflows/judges.yml.
 */
async function addCiWorkflow(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    vscode.window.showWarningMessage("Judges: Open a workspace folder first.");
    return;
  }

  const workflowUri = vscode.Uri.joinPath(workspaceFolders[0].uri, ".github", "workflows", "judges.yml");

  try {
    await vscode.workspace.fs.stat(workflowUri);
    vscode.window.showInformationMessage("Judges: .github/workflows/judges.yml already exists.");
    return;
  } catch {
    // File doesn't exist — create it
  }

  const content = Buffer.from(CI_WORKFLOW_YAML, "utf8");
  await vscode.workspace.fs.writeFile(workflowUri, content);

  const doc = await vscode.workspace.openTextDocument(workflowUri);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage("Judges: Created .github/workflows/judges.yml ✓");
}
