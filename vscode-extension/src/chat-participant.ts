import * as vscode from "vscode";
import {
  evaluateWithTribunal,
  JUDGES,
  buildTribunalDeepReviewSection,
  buildSimplifiedDeepReviewSection,
  isContentPolicyRefusal,
  DEEP_REVIEW_PROMPT_INTRO,
  DEEP_REVIEW_IDENTITY,
  getPreset,
} from "@kevinrabun/judges/api";
import type { Finding } from "@kevinrabun/judges/api";
import type { JudgesDiagnosticProvider } from "./diagnostics";
import { runLlmBenchmark, saveResultsToWorkspace } from "./llm-benchmark-runner";

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
  php: "php",
  ruby: "ruby",
  kotlin: "kotlin",
  swift: "swift",
};

// ─── Severity Icons ──────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

function matchWildcardSegment(value: string, pattern: string): boolean {
  let valueIndex = 0;
  let patternIndex = 0;
  let lastStarIndex = -1;
  let lastMatchIndex = 0;

  while (valueIndex < value.length) {
    if (
      patternIndex < pattern.length &&
      (pattern[patternIndex] === "?" || pattern[patternIndex] === value[valueIndex])
    ) {
      valueIndex++;
      patternIndex++;
      continue;
    }

    if (patternIndex < pattern.length && pattern[patternIndex] === "*") {
      lastStarIndex = patternIndex;
      patternIndex++;
      lastMatchIndex = valueIndex;
      continue;
    }

    if (lastStarIndex !== -1) {
      patternIndex = lastStarIndex + 1;
      lastMatchIndex++;
      valueIndex = lastMatchIndex;
      continue;
    }

    return false;
  }

  while (patternIndex < pattern.length && pattern[patternIndex] === "*") {
    patternIndex++;
  }

  return patternIndex === pattern.length;
}

function matchGlobPath(filePath: string, pattern: string): boolean {
  const fileSegments = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const patternSegments = pattern.replace(/\\/g, "/").split("/").filter(Boolean);
  const memo = new Map<string, boolean>();

  function match(pathIndex: number, patternIndex: number): boolean {
    const key = `${pathIndex}:${patternIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let result = false;
    if (patternIndex === patternSegments.length) {
      result = pathIndex === fileSegments.length;
    } else if (patternSegments[patternIndex] === "**") {
      result =
        match(pathIndex, patternIndex + 1) || (pathIndex < fileSegments.length && match(pathIndex + 1, patternIndex));
    } else if (pathIndex < fileSegments.length) {
      result =
        matchWildcardSegment(fileSegments[pathIndex], patternSegments[patternIndex]) &&
        match(pathIndex + 1, patternIndex + 1);
    }

    memo.set(key, result);
    return result;
  }

  return match(0, 0);
}

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
    _extensionContext = context;

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
let _extensionContext: vscode.ExtensionContext | undefined;

const handleChatRequest: vscode.ChatRequestHandler = async (
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult | void> => {
  const command = request.command ?? inferCommand(request.prompt);

  switch (command) {
    case "review":
    case "deepreview":
      return await handleDeepReview(request, stream, token);
    case "shallowreview":
      return await handleShallowReview(request, stream, token);
    case "security":
      return await handleShallowReview(request, stream, token, "security-only");
    case "aireview":
      return await handleShallowReview(request, stream, token, "ai-review");
    case "fix":
      return await handleFix(stream, token);
    case "benchmark":
      return await handleBenchmark(request, stream, token);
    case "help":
      return handleHelp(stream);
    default:
      return await handleDeepReview(request, stream, token);
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
  if (/\bbenchmark\b/.test(lower)) return "benchmark";
  if (/\bshallow\s*review\b/.test(lower)) return "shallowreview";
  if (/\bpattern\s*(only|analysis)\b/.test(lower)) return "shallowreview";
  if (/\bai[\s-]*(generated|review|code)\b/.test(lower)) return "aireview";
  if (/\b(copilot|chatgpt|cursor|llm)\s*(generated|code|output)\b/.test(lower)) return "aireview";
  if (/\bsecur/.test(lower)) return "security";
  if (/\bhelp\b/.test(lower)) return "help";
  // Recognize explicit "run judges" / "judges review" / "evaluate" / "check"
  if (/\b(run\s+judges|judges\s+review|evaluate|check)\b/.test(lower)) return "review";
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

/** Default max files to evaluate in a single workspace review to avoid timeouts. */
const DEFAULT_MAX_WORKSPACE_FILES = 50;

/** Read the configured max-files cap (falls back to DEFAULT_MAX_WORKSPACE_FILES). */
function getMaxWorkspaceFiles(): number {
  return vscode.workspace.getConfiguration("judges").get<number>("maxFiles", DEFAULT_MAX_WORKSPACE_FILES);
}

/** Build a VS Code exclude glob from judges.exclude patterns. */
function buildExcludeGlob(): string {
  const cfg = vscode.workspace.getConfiguration("judges");
  const excludes: string[] = cfg.get<string[]>("exclude", []);
  const base = "**/node_modules/**";
  if (excludes.length === 0) return base;
  return `{${base},${excludes.join(",")}}`;
}

/** Return the minimum confidence threshold for the configured tier. */
function getConfidenceThreshold(): number {
  const tier = vscode.workspace.getConfiguration("judges").get<string>("confidenceTier", "important");
  if (tier === "essential") return 0.8;
  if (tier === "supplementary") return 0;
  return 0.6; // important (default)
}

/**
 * Detect whether the user's prompt indicates a workspace-wide review
 * rather than a single-file review.
 */
function isWorkspaceIntent(prompt: string): boolean {
  return /\b(codebase|workspace|project|all\s+files|entire|whole|repo|repository|folder)\b/i.test(prompt);
}

// ─── /shallowreview Handler (pattern analysis only) ─────────────────────────

async function handleShallowReview(
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

  stream.progress("Running 45 judges on the active file…");

  const code = document.getText();
  if (!code.trim()) {
    stream.markdown("The file is empty — nothing to evaluate.");
    return;
  }

  try {
    const presetConfig = preset ? getPreset(preset)?.config : undefined;
    const verdict = evaluateWithTribunal(
      code,
      language,
      undefined,
      presetConfig ? { config: presetConfig } : undefined,
    );
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
        reviewCommand: preset === "security-only" ? "security" : "shallowreview",
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

  const maxFiles = getMaxWorkspaceFiles();
  const excludeGlob = buildExcludeGlob();
  const includes: string[] = vscode.workspace.getConfiguration("judges").get<string[]>("include", []);

  const uris = await vscode.workspace.findFiles(SUPPORTED_GLOB, excludeGlob, maxFiles + 1);

  if (token.isCancellationRequested) return;

  // Apply include-pattern filtering when configured
  let filteredUris = uris;
  if (includes.length > 0) {
    filteredUris = uris.filter((uri) => {
      const rel = vscode.workspace.asRelativePath(uri).replace(/\\/g, "/");
      return includes.some((pattern) => matchGlobPath(rel, pattern));
    });
  }

  if (filteredUris.length === 0) {
    stream.markdown("No supported source files found in the workspace.");
    return;
  }

  const capped = filteredUris.length > maxFiles;
  const filesToProcess = capped ? filteredUris.slice(0, maxFiles) : filteredUris;

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
      let allFindings = [...verdict.findings];

      // Apply preset / focus filters
      if (preset === "security-only") {
        allFindings = allFindings.filter((f) => /^(SEC|CYBER|AUTH|DATA|COMP)/i.test(f.ruleId));
      } else if (focusFilter) {
        allFindings = allFindings.filter((f) => focusFilter.test(f.ruleId));
      }

      // Apply confidence tier filtering
      const minConfidence = getConfidenceThreshold();
      if (minConfidence > 0) {
        allFindings = allFindings.filter((f) => (f.confidence ?? 0.5) >= minConfidence);
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
      (capped ? ` (capped at ${maxFiles})` : "") +
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

  // ── Cross-file pattern hotspots ──
  // Identify rules that fire across multiple files — these indicate
  // systemic patterns rather than one-off issues.
  const ruleToFiles = new Map<string, Set<string>>();
  for (const f of allFindings) {
    const existing = ruleToFiles.get(f.ruleId) ?? new Set<string>();
    existing.add(f.file);
    ruleToFiles.set(f.ruleId, existing);
  }
  const hotspots = [...ruleToFiles.entries()]
    .filter(([, files]) => files.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 10);

  if (hotspots.length > 0) {
    stream.markdown(`#### 🔥 Cross-File Pattern Hotspots\n\n`);
    stream.markdown(`These rules fire across multiple files — consider a systemic fix:\n\n`);
    stream.markdown(`| Rule | Files Affected | Files |\n|---|---|---|\n`);
    for (const [ruleId, files] of hotspots) {
      const fileList = [...files]
        .slice(0, 5)
        .map((p) => `\`${p}\``)
        .join(", ");
      const more = files.size > 5 ? ` +${files.size - 5} more` : "";
      stream.markdown(`| \`${ruleId}\` | ${files.size} | ${fileList}${more} |\n`);
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
 * 1. Runs all 45 deterministic evaluators (Layer 1)
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
  stream.progress("Layer 1 — Running 45 judges (deterministic analysis)…");

  const relativePath = vscode.workspace.asRelativePath(document.uri);
  let findings: Finding[];

  try {
    const verdict = evaluateWithTribunal(code, language);
    findings = verdict.findings;

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
  stream.progress("Layer 2 — Preparing AI deep review prompt…");

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

  // ── Resolve a usable model ─────────────────────────────────────────────
  // request.model is the user's pick in the Copilot Chat model selector.
  // When set to "auto" it may not have a real endpoint, so we fall back to
  // selectChatModels() if sending fails.
  async function resolveModel(): Promise<vscode.LanguageModelChat | undefined> {
    // First try request.model (user's explicit choice)
    if (request.model) {
      try {
        // Probe with an empty send — if this throws, the model isn't usable
        return request.model;
      } catch {
        // Fall through to selectChatModels
      }
    }
    const available = await vscode.lm.selectChatModels();
    return available[0];
  }

  try {
    stream.progress("Layer 2 — Selecting language model…");
    let model = await resolveModel();
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
    // The "auto" model selector may fail at send time, so catch and fall back
    stream.progress("Layer 2 — Sending request to AI model…");
    let response: vscode.LanguageModelChatResponse;
    try {
      response = await model.sendRequest(messages, {}, token);
    } catch (sendError) {
      // If request.model failed (e.g. "auto" pseudo-model), try selectChatModels
      stream.progress("Layer 2 — Trying alternative model…");
      const fallbackModels = await vscode.lm.selectChatModels();
      const fallback = fallbackModels.find((m) => m.id !== model!.id) ?? fallbackModels[0];
      if (!fallback) throw sendError; // re-throw if no fallback
      model = fallback;
      response = await model.sendRequest(messages, {}, token);
    }

    // ── Two-phase streaming with early refusal detection ──
    // Content-policy refusals are always < 300 chars (isContentPolicyRefusal
    // returns false for longer responses). Buffer the first 500 chars to
    // detect refusals, then stream remaining chunks in real-time so the user
    // sees progressive output instead of a blank screen for 30-60s.
    const REFUSAL_BUFFER_LIMIT = 500;
    let responseText = "";
    let bufferFlushed = false;
    let chunkCount = 0;

    stream.progress("Layer 2 — AI model is analyzing code…");

    for await (const chunk of response.text) {
      if (token.isCancellationRequested) return;
      responseText += chunk;
      chunkCount++;

      if (!bufferFlushed) {
        // Still buffering for refusal detection
        if (responseText.length >= REFUSAL_BUFFER_LIMIT) {
          // Past refusal threshold — this is a real response, flush buffer
          bufferFlushed = true;
          stream.progress("Layer 2 — Streaming AI review results…");
          stream.markdown(responseText);
        } else if (chunkCount % 5 === 0) {
          // Periodic progress during initial buffer phase
          stream.progress("Layer 2 — AI model is reasoning…");
        }
      } else {
        // Buffer flushed — stream in real-time
        stream.markdown(chunk);
      }
    }

    // Handle response based on refusal detection
    if (!bufferFlushed) {
      // Response was shorter than buffer limit — check for refusal
      if (!isContentPolicyRefusal(responseText)) {
        // Normal short response — stream it
        stream.markdown(responseText);
        stream.markdown("\n");
      } else {
        // ── Content-policy refusal detected — retry with simplified prompt ──
        stream.progress("Layer 2 — Content policy triggered, retrying with simplified prompt…");

        const simplifiedSection = buildSimplifiedDeepReviewSection(language, context);
        const retryPrompt = DEEP_REVIEW_PROMPT_INTRO + codeAndFindings + simplifiedSection;

        // Try a different model family for the retry
        const altModels = await vscode.lm.selectChatModels();
        const altModel = altModels.find((m) => m.id !== model.id) ?? model;

        const retryMessages = [identityMsg, vscode.LanguageModelChatMessage.User(retryPrompt)];

        stream.progress("Layer 2 — Sending simplified request…");
        const retryResponse = await altModel.sendRequest(retryMessages, {}, token);

        // Use same two-phase approach for retry
        let retryText = "";
        let retryFlushed = false;

        stream.progress("Layer 2 — AI model is re-analyzing…");
        for await (const chunk of retryResponse.text) {
          if (token.isCancellationRequested) return;
          retryText += chunk;

          if (!retryFlushed && retryText.length >= REFUSAL_BUFFER_LIMIT) {
            retryFlushed = true;
            stream.progress("Layer 2 — Streaming retry results…");
            stream.markdown(retryText);
          } else if (retryFlushed) {
            stream.markdown(chunk);
          }
        }

        if (!retryFlushed) {
          if (!isContentPolicyRefusal(retryText)) {
            stream.markdown(retryText);
          } else {
            stream.markdown(
              `The AI model declined this review. This can happen with code that combines ` +
                `privacy/security infrastructure (e.g., GDPR, PII handling) with security evaluation criteria. ` +
                `Layer 1 findings above are still valid.\n`,
            );
          }
        }
        stream.markdown("\n");
      }
    } else {
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

// ─── /benchmark Handler ──────────────────────────────────────────────────────

async function handleBenchmark(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult | void> {
  stream.progress("Initializing LLM benchmark…");

  if (!_extensionContext) {
    stream.markdown("**Error:** Extension context not initialized.");
    return;
  }

  const storageUri = _extensionContext.globalStorageUri;

  try {
    // Resolve the model from the chat context
    let chatModel: vscode.LanguageModelChat | undefined;
    try {
      const models = await vscode.lm.selectChatModels();
      chatModel = models[0];
    } catch {
      // will fall back inside runner
    }

    const result = await runLlmBenchmark(
      token,
      (p) => {
        stream.progress(`[${p.completed}/${p.total}] ${p.message}`);
      },
      storageUri,
      chatModel,
    );

    if (token.isCancellationRequested) {
      stream.markdown("### ⚠️ Benchmark Cancelled\n\nPartial results have been saved.\n");
      return;
    }

    // Stream the executive summary
    stream.markdown("### ✅ LLM Benchmark Complete\n\n");

    if (result.perJudge && result.tribunal) {
      const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
      stream.markdown(
        `| Mode | F1 | Precision | Recall | Detection Rate |\n` +
          `|------|----|-----------|--------|----------------|\n` +
          `| Per-Judge | ${pct(result.perJudge.f1Score)} | ${pct(result.perJudge.precision)} | ${pct(result.perJudge.recall)} | ${pct(result.perJudge.detectionRate)} |\n` +
          `| Tribunal | ${pct(result.tribunal.f1Score)} | ${pct(result.tribunal.precision)} | ${pct(result.tribunal.recall)} | ${pct(result.tribunal.detectionRate)} |\n\n`,
      );
    } else {
      const s = result.perJudge ?? result.tribunal;
      if (s) {
        const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
        stream.markdown(
          `**F1:** ${pct(s.f1Score)} · **Precision:** ${pct(s.precision)} · ` +
            `**Recall:** ${pct(s.recall)} · **Detection Rate:** ${pct(s.detectionRate)}\n\n`,
        );
      }
    }

    stream.markdown(
      "📄 Results saved to extension storage.\n\n" +
        "Use **Save to Workspace** to copy results to `benchmarks/` for committing.\n",
    );

    // Offer buttons
    stream.button({
      command: "judges.saveBenchmarkToWorkspace",
      title: "$(folder) Save to Workspace",
      arguments: [],
    });
  } catch (error) {
    if (error instanceof vscode.CancellationError) return;
    stream.markdown(`### ❌ Benchmark Failed\n\n` + `${error instanceof Error ? error.message : String(error)}\n`);
  }
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
      `| \`@judges\` | Deep review — Layer 1 (pattern analysis) + Layer 2 (AI contextual review) |\n` +
      `| \`@judges /review\` | Same as above |\n` +
      `| \`@judges /review review the codebase\` | Deep review all files in the workspace |\n` +
      `| \`@judges /deepreview\` | Same as \`/review\` (Layer 1 + Layer 2 deep review) |\n` +
      `| \`@judges /shallowreview\` | Pattern analysis only (Layer 1 — no AI deep review) |\n` +
      `| \`@judges /security\` | Security-focused pattern review only |\n` +
      `| \`@judges /aireview\` | AI-generated code review — optimized for Copilot/ChatGPT/Cursor output |\n` +
      `| \`@judges /fix\` | Auto-fix findings that have patches (not all findings are auto-fixable) |\n` +
      `| \`@judges /benchmark\` | Run LLM benchmark — evaluates all judges against test cases |\n` +
      `| \`@judges /help\` | Show this help |\n\n` +
      `### Verdict Bands\n\n` +
      `| Verdict | Score | Meaning |\n` +
      `|---|---|---|\n` +
      `| ✅ **PASS** | 80–100 | Code meets quality bar — safe to merge |\n` +
      `| ⚠️ **WARN** | 50–79 | Issues found — review before merging |\n` +
      `| 🛑 **FAIL** | 0–49 | Critical/high findings — fix before merging |\n\n` +
      `### Noise Control\n\n` +
      `Too many findings? Adjust these settings:\n` +
      `- **\`judges.minSeverity\`** — default is \`"high"\` (only critical + high). ` +
      `Lower to \`"medium"\` to see more, or raise to \`"critical"\` for fewer.\n` +
      `- **\`judges.confidenceTier\`** — default is \`"important"\` (≥ 0.6 confidence). ` +
      `Set to \`"essential"\` (≥ 0.8) for less noise.\n` +
      `- **\`judges.preset\`** — try \`"security-only"\` or \`"lenient"\` for lighter reviews.\n\n` +
      `### Examples\n\n` +
      `- *"@judges review this file for performance issues"*\n` +
      `- *"@judges review this AI-generated code"*\n` +
      `- *"@judges review the entire codebase"*\n` +
      `- *"@judges check security across the project"*\n` +
      `- *"@judges shallow review this file"*\n` +
      `- *"@judges fix this file"*\n` +
      `- *"@judges evaluate this code"*\n\n` +
      `**Workspace review** triggers automatically when you mention ` +
      `*codebase*, *workspace*, *project*, *all files*, *repo*, or *folder* ` +
      `in your prompt (up to ${getMaxWorkspaceFiles()} files).\n`,
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
