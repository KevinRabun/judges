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
import type { Finding } from "@kevinrabun/judges/api";
import type { JudgesDiagnosticProvider } from "./diagnostics";

// ─── Language Map ────────────────────────────────────────────────────────────

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

// ─── Severity Icons ──────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

// ─── Chat Participant Registration ───────────────────────────────────────────

/**
 * Register the `@judges` chat participant.
 * Users can type `@judges review this file`, `@judges security`, etc.
 * VS Code's disambiguation also routes natural-language queries like
 * "run a judges panel review" to this participant automatically.
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  diagnosticProvider: JudgesDiagnosticProvider,
): void {
  try {
    if (!vscode.chat?.createChatParticipant) {
      console.warn(
        "Judges: vscode.chat.createChatParticipant API not available — skipping chat participant registration.",
      );
      return;
    }

    // Store reference so handlers can populate diagnostics
    _diagnosticProvider = diagnosticProvider;

    const participant = vscode.chat.createChatParticipant("judges-panel.judges", handleChatRequest);
    participant.iconPath = new vscode.ThemeIcon("shield");

    // Provide "Re-Evaluate" as a chat followup so results render in the
    // chat window instead of only updating diagnostics with a toast.
    participant.followupProvider = {
      provideFollowups(result, _ctx, _tok) {
        const followups: vscode.ChatFollowup[] = [];
        const meta = result.metadata as Record<string, unknown> | undefined;
        if (!meta?.showReEvaluate) return followups;

        if (meta.isWorkspace) {
          followups.push({
            prompt: "review the workspace",
            command: "review",
            label: "$(shield) Re-Evaluate Workspace",
          });
        } else {
          followups.push({
            prompt: "",
            command: (meta.reviewCommand as string) || "review",
            label: "$(shield) Re-Evaluate",
          });
        }
        return followups;
      },
    };

    context.subscriptions.push(participant);
  } catch (error) {
    // Log the error so it's visible in Developer Tools, but don't crash the extension
    console.error("Judges: Failed to register chat participant:", error);
  }
}

// ─── Request Handler ─────────────────────────────────────────────────────────

/** Module-level reference to the diagnostic provider, set during registration. */
let _diagnosticProvider: JudgesDiagnosticProvider | undefined;

const handleChatRequest: vscode.ChatRequestHandler = async (
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult | void> => {
  const command = request.command ?? inferCommand(request.prompt);

  switch (command) {
    case "review":
      return await handleReview(request, stream, token);
    case "security":
      return await handleReview(request, stream, token, "security-only");
    case "deepreview":
      return await handleDeepReview(request, stream, token);
    case "fix":
      return await handleFix(stream, token);
    case "help":
      return handleHelp(stream);
    default:
      return await handleReview(request, stream, token);
  }
};

// ─── Command Inference ───────────────────────────────────────────────────────

/**
 * Infer intent when user doesn't use an explicit /command.
 * E.g. "review this file for security issues" → "security"
 */
function inferCommand(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\bfix\b/.test(lower)) return "fix";
  if (/\bdeep\s*review\b/.test(lower)) return "deepreview";
  if (/\bsecur/.test(lower)) return "security";
  if (/\bhelp\b/.test(lower)) return "help";
  return "review";
}

// ─── Workspace Intent Detection ──────────────────────────────────────────────

/** File extensions supported by judges, mapped to language names. */
const SUPPORTED_GLOB = "**/*.{ts,tsx,js,jsx,py,go,rs,java,cs,cpp,tf,bicep,ps1,psm1}";
const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".tf": "terraform",
  ".bicep": "bicep",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

/** Max files to evaluate in a single workspace review to avoid timeouts. */
const MAX_WORKSPACE_FILES = 50;

/**
 * Detect whether the user's prompt indicates a workspace-wide review
 * rather than a single-file review.
 */
function isWorkspaceIntent(prompt: string): boolean {
  return /\b(codebase|workspace|project|all\s+files|entire|whole|repo|repository|folder)\b/i.test(prompt);
}

// ─── /review Handler ─────────────────────────────────────────────────────────

async function handleReview(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  preset?: string,
): Promise<vscode.ChatResult | void> {
  const wantsWorkspace = isWorkspaceIntent(request.prompt);
  const editor = vscode.window.activeTextEditor;

  // If user explicitly asks for workspace review, or no file is open but a workspace is
  if (wantsWorkspace || (!editor && vscode.workspace.workspaceFolders?.length)) {
    return await handleWorkspaceReview(request, stream, token, preset);
  }

  if (!editor) {
    stream.markdown("No file is open and no workspace folder is detected. Open a file or folder and try again.");
    return;
  }

  const document = editor.document;
  const language = LANG_MAP[document.languageId];
  if (!language) {
    stream.markdown(
      `Language **${document.languageId}** is not supported. Supported: TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++.`,
    );
    return;
  }

  if (token.isCancellationRequested) return;

  stream.progress("Running 35 judges on the active file…");

  const code = document.getText();
  if (!code.trim()) {
    stream.markdown("The file is empty — nothing to evaluate.");
    return;
  }

  try {
    const verdict = evaluateWithTribunal(code, language);
    const allFindings = verdict.evaluations.flatMap((e) => e.findings);

    // Filter by preset if provided
    let findings = allFindings;
    if (preset === "security-only") {
      findings = allFindings.filter((f) => /^(SEC|CYBER|AUTH|DATA|COMP)/i.test(f.ruleId));
    }

    // Optionally filter by user prompt keywords (e.g. "review for performance")
    const prompt = request.prompt.toLowerCase();
    if (!preset && prompt.length > 0) {
      const focusFilter = detectFocusFilter(prompt);
      if (focusFilter) {
        findings = allFindings.filter((f) => focusFilter.test(f.ruleId));
      }
    }

    if (token.isCancellationRequested) return;

    const relativePath = vscode.workspace.asRelativePath(document.uri);

    if (findings.length === 0) {
      stream.markdown(
        `### ✅ No findings\n\n` +
          `**${relativePath}** passed all ${verdict.evaluations.length} judges ` +
          `(score: **${verdict.overallScore}/100**).\n`,
      );
      return;
    }

    // Count auto-fixable vs manual-only findings
    const autoFixable = findings.filter((f) => f.patch);
    const manualOnly = findings.length - autoFixable.length;

    // Header
    stream.markdown(
      `### 🔍 Judges Panel Review — ${relativePath}\n\n` +
        `**Score:** ${verdict.overallScore}/100  |  ` +
        `**Findings:** ${findings.length}  |  ` +
        `**Judges run:** ${verdict.evaluations.length}\n\n` +
        `🔧 **${autoFixable.length}** auto-fixable  |  ` +
        `📝 **${manualOnly}** require manual review\n\n`,
    );

    // Group by severity
    const bySeverity = groupBySeverity(findings);

    for (const [severity, group] of bySeverity) {
      if (token.isCancellationRequested) return;

      const icon = SEVERITY_ICON[severity] ?? "⚪";
      stream.markdown(`#### ${icon} ${capitalize(severity)} (${group.length})\n\n`);

      for (const f of group) {
        const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
        const fixTag = f.patch ? " 🔧" : " 📝";
        stream.markdown(`- **\`${f.ruleId}\`** ${f.title}${lineRef}${fixTag}\n` + `  ${f.description}\n`);
        if (f.suggestedFix) {
          stream.markdown(`  💡 *Fix:* ${f.suggestedFix}\n`);
        }
        stream.markdown("\n");
      }
    }

    // Footer with action buttons and context
    if (autoFixable.length > 0 && manualOnly > 0) {
      stream.markdown(`---\n\n` + `> 🔧 = auto-fixable  |  📝 = requires manual review\n\n`);
    }

    if (autoFixable.length > 0) {
      stream.button({
        command: "judges.fixFile",
        title: `$(wrench) Auto-Fix ${autoFixable.length} of ${findings.length} Findings`,
      });
    } else {
      stream.markdown(`> All ${findings.length} findings require manual review — no auto-fixes available.\n\n`);
    }
    // Populate diagnostics provider cache with the findings we already
    // computed — avoids a redundant evaluation and ensures the "Auto-Fix"
    // button and "Re-Evaluate" followup work immediately.
    if (_diagnosticProvider) {
      _diagnosticProvider.populateFindings(document, findings);
    }

    return {
      metadata: {
        showReEvaluate: true,
        reviewCommand: preset === "security-only" ? "security" : "review",
      },
    };
  } catch (error) {
    stream.markdown(`**Error** running evaluation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── Workspace Review Handler ────────────────────────────────────────────────

interface FileResult {
  relativePath: string;
  score: number;
  findings: Finding[];
  judgeCount: number;
}

async function handleWorkspaceReview(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  preset?: string,
): Promise<vscode.ChatResult | void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    stream.markdown("No workspace folder is open. Open a folder and try again.");
    return;
  }

  stream.progress("Finding source files in workspace…");

  const uris = await vscode.workspace.findFiles(SUPPORTED_GLOB, "**/node_modules/**", MAX_WORKSPACE_FILES + 1);

  if (token.isCancellationRequested) return;

  if (uris.length === 0) {
    stream.markdown("No supported source files found in the workspace.");
    return;
  }

  const capped = uris.length > MAX_WORKSPACE_FILES;
  const filesToProcess = capped ? uris.slice(0, MAX_WORKSPACE_FILES) : uris;

  const promptLower = request.prompt.toLowerCase();
  const focusFilter = !preset ? detectFocusFilter(promptLower) : null;

  const results: FileResult[] = [];
  let processed = 0;

  for (const uri of filesToProcess) {
    if (token.isCancellationRequested) return;

    processed++;
    const relativePath = vscode.workspace.asRelativePath(uri);
    stream.progress(`[${processed}/${filesToProcess.length}] Evaluating ${relativePath}…`);

    // Determine language from file extension
    const ext = uri.fsPath.substring(uri.fsPath.lastIndexOf(".")).toLowerCase();
    const language = EXT_TO_LANG[ext];
    if (!language) continue;

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const code = doc.getText();
      if (!code.trim()) continue;

      const verdict = evaluateWithTribunal(code, language);
      let allFindings = verdict.evaluations.flatMap((e) => e.findings);

      // Apply preset / focus filters
      if (preset === "security-only") {
        allFindings = allFindings.filter((f) => /^(SEC|CYBER|AUTH|DATA|COMP)/i.test(f.ruleId));
      } else if (focusFilter) {
        allFindings = allFindings.filter((f) => focusFilter.test(f.ruleId));
      }

      results.push({
        relativePath,
        score: verdict.overallScore,
        findings: allFindings,
        judgeCount: verdict.evaluations.length,
      });
    } catch {
      // Skip files that fail to parse — don't crash the whole review
    }
  }

  if (token.isCancellationRequested) return;

  if (results.length === 0) {
    stream.markdown("No evaluable files found in the workspace.");
    return;
  }

  // ── Aggregate stats ──
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const allFindings = results.flatMap((r) => r.findings.map((f) => ({ ...f, file: r.relativePath })));
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  // ── Header ──
  stream.markdown(
    `### 🔍 Judges Panel — Workspace Review\n\n` +
      `**Files evaluated:** ${results.length}` +
      (capped ? ` (capped at ${MAX_WORKSPACE_FILES})` : "") +
      `  |  **Avg score:** ${avgScore}/100  |  ` +
      `**Total findings:** ${totalFindings}  |  ` +
      `🔴 ${criticalCount} critical  🟠 ${highCount} high\n\n`,
  );

  if (totalFindings === 0) {
    stream.markdown(`All ${results.length} files passed — no findings across all judges. 🎉\n`);
    return;
  }

  // ── Top issues (critical & high across workspace) ──
  const topIssues = allFindings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 15);

  if (topIssues.length > 0) {
    stream.markdown(`#### 🚨 Top Issues\n\n`);
    for (const f of topIssues) {
      const icon = SEVERITY_ICON[f.severity] ?? "⚪";
      const lineRef = f.lineNumbers?.length ? `:${f.lineNumbers[0]}` : "";
      stream.markdown(`- ${icon} **\`${f.ruleId}\`** ${f.title} — \`${f.file}${lineRef}\`\n` + `  ${f.description}\n`);
      if (f.suggestedFix) {
        stream.markdown(`  💡 *Fix:* ${f.suggestedFix}\n`);
      }
      stream.markdown("\n");
    }
  }

  // ── Per-file scoreboard (sorted worst → best) ──
  const sorted = [...results].sort((a, b) => a.score - b.score);
  stream.markdown(`#### 📊 File Scores\n\n`);
  stream.markdown(`| File | Score | Findings |\n|---|---|---|\n`);
  for (const r of sorted) {
    const scoreEmoji = r.score >= 80 ? "✅" : r.score >= 50 ? "⚠️" : "❌";
    stream.markdown(`| \`${r.relativePath}\` | ${scoreEmoji} ${r.score}/100 | ${r.findings.length} |\n`);
  }
  stream.markdown("\n");

  // ── Finding distribution by category ──
  const byPrefix = new Map<string, number>();
  for (const f of allFindings) {
    const prefix = f.ruleId.replace(/-\d+$/, "");
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
  }
  const sortedPrefixes = [...byPrefix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sortedPrefixes.length > 0) {
    stream.markdown(`#### 📋 Finding Categories\n\n`);
    stream.markdown(`| Category | Count |\n|---|---|\n`);
    for (const [prefix, count] of sortedPrefixes) {
      stream.markdown(`| \`${prefix}\` | ${count} |\n`);
    }
    stream.markdown("\n");
  }

  // ── Footer ──
  return { metadata: { showReEvaluate: true, isWorkspace: true } };
}

// ─── /deepreview Handler ─────────────────────────────────────────────────────

/**
 * Combined Layer 1 + Layer 2 analysis.
 *
 * 1. Runs all 35 deterministic evaluators (Layer 1)
 * 2. Streams the pattern-match findings to chat
 * 3. Builds a deep-review prompt with the L1 findings + expert criteria
 * 4. Sends to the VS Code Language Model API (Layer 2)
 * 5. Streams the LLM's contextual deep-review analysis to chat
 */
async function handleDeepReview(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult | void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    stream.markdown("No file is open. Open a file and try `@judges /deepreview` again.");
    return;
  }

  const document = editor.document;
  const language = LANG_MAP[document.languageId];
  if (!language) {
    stream.markdown(
      `Language **${document.languageId}** is not supported. Supported: TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++.`,
    );
    return;
  }

  const code = document.getText();
  if (!code.trim()) {
    stream.markdown("The file is empty — nothing to evaluate.");
    return;
  }

  if (token.isCancellationRequested) return;

  // ── Layer 1: Deterministic Evaluation ──────────────────────────────────
  stream.progress("Layer 1 — Running 35 judges (deterministic analysis)…");

  const relativePath = vscode.workspace.asRelativePath(document.uri);
  let findings: Finding[];

  try {
    const verdict = evaluateWithTribunal(code, language);
    findings = verdict.evaluations.flatMap((e) => e.findings);

    if (token.isCancellationRequested) return;

    // Populate diagnostics cache
    if (_diagnosticProvider) {
      _diagnosticProvider.populateFindings(document, findings);
    }

    // Stream L1 summary
    const autoFixable = findings.filter((f) => f.patch);
    const manualOnly = findings.length - autoFixable.length;

    stream.markdown(
      `### 🔍 Layer 1 — Deterministic Analysis — ${relativePath}\n\n` +
        `**Score:** ${verdict.overallScore}/100  |  ` +
        `**Findings:** ${findings.length}  |  ` +
        `**Judges run:** ${verdict.evaluations.length}\n\n` +
        `🔧 **${autoFixable.length}** auto-fixable  |  ` +
        `📝 **${manualOnly}** require manual review\n\n`,
    );

    if (findings.length > 0) {
      const bySeverity = groupBySeverity(findings);

      for (const [severity, group] of bySeverity) {
        if (token.isCancellationRequested) return;

        const icon = SEVERITY_ICON[severity] ?? "⚪";
        stream.markdown(`#### ${icon} ${capitalize(severity)} (${group.length})\n\n`);

        for (const f of group) {
          const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
          const fixTag = f.patch ? " 🔧" : " 📝";
          stream.markdown(`- **\`${f.ruleId}\`** ${f.title}${lineRef}${fixTag}\n` + `  ${f.description}\n`);
          if (f.suggestedFix) {
            stream.markdown(`  💡 *Fix:* ${f.suggestedFix}\n`);
          }
          stream.markdown("\n");
        }
      }

      if (autoFixable.length > 0) {
        stream.button({
          command: "judges.fixFile",
          title: `$(wrench) Auto-Fix ${autoFixable.length} of ${findings.length} Findings`,
        });
      }
    } else {
      stream.markdown(`All ${verdict.evaluations.length} judges passed — no pattern-based findings. ✅\n\n`);
    }
  } catch (error) {
    stream.markdown(`**Error** running Layer 1 evaluation: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (token.isCancellationRequested) return;

  // ── Layer 2: LLM Deep Review ───────────────────────────────────────────
  stream.progress("Layer 2 — Running AI deep review (contextual analysis)…");

  // Build the L1 findings summary for the prompt
  const findingsSummary = findings
    .map((f, i) => {
      const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
      return `${i + 1}. [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title}${lineRef}\n   ${f.description}`;
    })
    .join("\n");

  // Get the deep review prompt section with all judge expert criteria
  const context = request.prompt.trim() || undefined;
  const deepReviewSection = buildTribunalDeepReviewSection(JUDGES, language, context);

  const codeAndFindings =
    `--- SOURCE CODE (${language}) ---\n${code}\n\n` +
    `--- LAYER 1 FINDINGS (${findings.length} pattern-based) ---\n` +
    (findings.length > 0 ? findingsSummary : "(No pattern-based findings)") +
    `\n\n`;

  const prompt = DEEP_REVIEW_PROMPT_INTRO + codeAndFindings + deepReviewSection;

  try {
    const models = await vscode.lm.selectChatModels({ family: "gpt-4o" });
    let model = models[0];
    if (!model) {
      const allModels = await vscode.lm.selectChatModels();
      model = allModels[0];
    }
    if (!model) {
      stream.markdown(
        `\n\n---\n\n### ⚠️ Layer 2 Unavailable\n\n` +
          `No language model is available for the AI deep review. ` +
          `Layer 1 findings above are still valid. ` +
          `Ensure GitHub Copilot or another language model extension is installed and signed in.\n`,
      );
      return { metadata: { showReEvaluate: true, reviewCommand: "deepreview" } };
    }

    if (token.isCancellationRequested) return;

    stream.markdown(`\n\n---\n\n### 🧠 Layer 2 — AI Deep Contextual Review\n\n`);

    const identityMsg = vscode.LanguageModelChatMessage.Assistant(DEEP_REVIEW_IDENTITY);
    const messages = [identityMsg, vscode.LanguageModelChatMessage.User(prompt)];

    // ── First attempt ──
    const response = await model.sendRequest(messages, {}, token);

    // Buffer complete response to detect content-policy refusal
    let responseText = "";
    for await (const chunk of response.text) {
      if (token.isCancellationRequested) return;
      responseText += chunk;
    }

    if (!isContentPolicyRefusal(responseText)) {
      // Normal response — stream to user
      stream.markdown(responseText);
      stream.markdown("\n");
    } else {
      // ── Content-policy refusal detected — retry with simplified prompt ──
      stream.progress("Retrying with simplified review prompt…");

      const simplifiedSection = buildSimplifiedDeepReviewSection(language, context);
      const retryPrompt = DEEP_REVIEW_PROMPT_INTRO + codeAndFindings + simplifiedSection;

      // Try a different model family if available, otherwise retry with same model
      const altModels = await vscode.lm.selectChatModels();
      const altModel = altModels.find((m) => m.id !== model!.id) ?? model;

      const retryMessages = [identityMsg, vscode.LanguageModelChatMessage.User(retryPrompt)];
      const retryResponse = await altModel.sendRequest(retryMessages, {}, token);

      let retryText = "";
      for await (const chunk of retryResponse.text) {
        if (token.isCancellationRequested) return;
        retryText += chunk;
      }

      if (!isContentPolicyRefusal(retryText)) {
        stream.markdown(retryText);
      } else {
        stream.markdown(
          `The AI model declined this review. This can happen with code that combines ` +
            `privacy/security infrastructure (e.g., GDPR, PII handling) with security evaluation criteria. ` +
            `Layer 1 findings above are still valid.\n`,
        );
      }
      stream.markdown("\n");
    }
  } catch (error) {
    if (error instanceof vscode.CancellationError) return;
    stream.markdown(
      `\n\n---\n\n### ⚠️ Layer 2 Error\n\n` +
        `AI deep review failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
        `Layer 1 findings above are still valid.\n`,
    );
  }

  return { metadata: { showReEvaluate: true, reviewCommand: "deepreview" } };
}

// ─── /fix Handler ────────────────────────────────────────────────────────────

async function handleFix(
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult | void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    stream.markdown("No file is open. Open a file and try `@judges /fix` again.");
    return;
  }

  stream.progress("Evaluating and applying fixes…");

  if (!_diagnosticProvider) {
    stream.markdown("**Error:** Diagnostic provider not initialized.");
    return;
  }

  const result = await _diagnosticProvider.fix(editor.document);

  if (result.applied > 0) {
    const totalFindings = _diagnosticProvider.getFindings(editor.document.uri.toString()).length;
    const remaining = totalFindings > 0 ? totalFindings : 0;
    const remainingNote =
      remaining > 0
        ? `\n\n📝 **${remaining}** finding(s) remain that require manual review — ` +
          `use \`@judges /review\` to see details.`
        : `\n\n✅ No remaining findings.`;
    stream.markdown(
      `### 🔧 Auto-Fix Applied\n\n` +
        `Applied **${result.applied}** of **${result.fixable}** auto-fixable fix(es) ` +
        `to **${vscode.workspace.asRelativePath(editor.document.uri)}**.` +
        remainingNote +
        `\n`,
    );
    return { metadata: { showReEvaluate: true, reviewCommand: "review" } };
  } else if (result.fixable === 0) {
    const allFindings = _diagnosticProvider.getFindings(editor.document.uri.toString());
    if (allFindings.length > 0) {
      stream.markdown(
        `### 📝 Manual Review Required\n\n` +
          `All **${allFindings.length}** finding(s) require manual review — none have auto-fixes available.\n\n` +
          `Use \`@judges /review\` to see detailed recommendations for each finding.\n`,
      );
      return { metadata: { showReEvaluate: true, reviewCommand: "review" } };
    } else {
      stream.markdown("No findings detected — the file looks clean! 🎉");
    }
  } else {
    stream.markdown(
      "Fixes could not be applied — the code may have changed since the last evaluation. " +
        "Try `@judges /review` to get fresh results.",
    );
    return { metadata: { showReEvaluate: true, reviewCommand: "review" } };
  }
}

// ─── /help Handler ──────────────────────────────────────────────────────────

function handleHelp(stream: vscode.ChatResponseStream): vscode.ChatResult | void {
  stream.markdown(
    `### Judges Panel — Chat Commands\n\n` +
      `| Command | What it does |\n` +
      `|---|---|\n` +
      `| \`@judges\` | Review the active file with all 35 judges |\n` +
      `| \`@judges /review\` | Same as above |\n` +
      `| \`@judges /review review the codebase\` | Review all files in the workspace |\n` +
      `| \`@judges /deepreview\` | Combined Layer 1 (pattern) + Layer 2 (AI deep review) |\n` +
      `| \`@judges /security\` | Security-focused review only |\n` +
      `| \`@judges /fix\` | Auto-fix findings that have patches (not all findings are auto-fixable) |\n` +
      `| \`@judges /help\` | Show this help |\n\n` +
      `**\`/deepreview\`** runs the fast deterministic evaluators first, then sends the code ` +
      `and findings to an AI model for contextual deep analysis — catching semantic issues, ` +
      `false positives, and architectural concerns that pattern matching cannot detect.\n\n` +
      `**Workspace review** triggers automatically when you mention ` +
      `*codebase*, *workspace*, *project*, *all files*, *repo*, or *folder* ` +
      `in your prompt (up to ${MAX_WORKSPACE_FILES} files).\n\n` +
      `You can also ask naturally:\n` +
      `- *"@judges review this file for performance issues"*\n` +
      `- *"@judges review the entire codebase"*\n` +
      `- *"@judges check security across the project"*\n` +
      `- *"@judges deep review this file"*\n` +
      `- *"@judges fix this file"*\n`,
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupBySeverity(findings: Finding[]): [string, Finding[]][] {
  const order = ["critical", "high", "medium", "low", "info"];
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = map.get(f.severity) ?? [];
    arr.push(f);
    map.set(f.severity, arr);
  }
  return order.filter((s) => map.has(s)).map((s) => [s, map.get(s)!]);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Detect if the user's prompt focuses on a specific domain.
 * Returns a regex filter for ruleId prefixes, or null if no focus.
 */
function detectFocusFilter(prompt: string): RegExp | null {
  if (/\bperformance?\b/.test(prompt)) return /^PERF/i;
  if (/\breliab/.test(prompt)) return /^REL/i;
  if (/\bcost\b/.test(prompt)) return /^COST/i;
  if (/\bscal/.test(prompt)) return /^SCAL/i;
  if (/\bapi\b/.test(prompt)) return /^API/i;
  if (/\bdoc/.test(prompt)) return /^DOC/i;
  if (/\bcompli/.test(prompt)) return /^COMP/i;
  if (/\bobserv/.test(prompt)) return /^(OBS|LOG)/i;
  if (/\btest/.test(prompt)) return /^TEST/i;
  if (/\baccessib/.test(prompt)) return /^A11Y/i;
  if (/\bconcurren/.test(prompt)) return /^CONC/i;
  return null;
}
