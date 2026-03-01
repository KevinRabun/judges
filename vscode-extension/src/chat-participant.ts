import * as vscode from "vscode";
import { evaluateWithTribunal } from "@kevinrabun/judges/api";
import type { Finding } from "@kevinrabun/judges/api";

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
export function registerChatParticipant(context: vscode.ExtensionContext): void {
  try {
    if (!vscode.chat?.createChatParticipant) {
      console.warn(
        "Judges: vscode.chat.createChatParticipant API not available — skipping chat participant registration.",
      );
      return;
    }

    const participant = vscode.chat.createChatParticipant("judges-panel.judges", handleChatRequest);
    participant.iconPath = new vscode.ThemeIcon("shield");

    context.subscriptions.push(participant);
  } catch (error) {
    // Log the error so it's visible in Developer Tools, but don't crash the extension
    console.error("Judges: Failed to register chat participant:", error);
  }
}

// ─── Request Handler ─────────────────────────────────────────────────────────

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
  if (/\bsecur\b/.test(lower)) return "security";
  if (/\bhelp\b/.test(lower)) return "help";
  return "review";
}

// ─── /review Handler ─────────────────────────────────────────────────────────

async function handleReview(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  preset?: string,
): Promise<vscode.ChatResult | void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    stream.markdown("No file is open. Open a file and try again.");
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

    // Header
    stream.markdown(
      `### 🔍 Judges Panel Review — ${relativePath}\n\n` +
        `**Score:** ${verdict.overallScore}/100  |  ` +
        `**Findings:** ${findings.length}  |  ` +
        `**Judges run:** ${verdict.evaluations.length}\n\n`,
    );

    // Group by severity
    const bySeverity = groupBySeverity(findings);

    for (const [severity, group] of bySeverity) {
      if (token.isCancellationRequested) return;

      const icon = SEVERITY_ICON[severity] ?? "⚪";
      stream.markdown(`#### ${icon} ${capitalize(severity)} (${group.length})\n\n`);

      for (const f of group) {
        const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
        stream.markdown(`- **\`${f.ruleId}\`** ${f.title}${lineRef}\n` + `  ${f.description}\n`);
        if (f.suggestedFix) {
          stream.markdown(`  💡 *Fix:* ${f.suggestedFix}\n`);
        }
        stream.markdown("\n");
      }
    }

    // Footer with action buttons
    stream.button({
      command: "judges.fixFile",
      title: "$(wrench) Auto-Fix All",
    });
    stream.button({
      command: "judges.evaluateFile",
      title: "$(shield) Re-Evaluate",
    });
  } catch (error) {
    stream.markdown(`**Error** running evaluation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── /fix Handler ────────────────────────────────────────────────────────────

async function handleFix(
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult | void> {
  stream.markdown("Running auto-fix on the current file…\n\n");
  await vscode.commands.executeCommand("judges.fixFile");
  stream.markdown("Done. Check the editor for applied fixes, then re-evaluate.");
  stream.button({
    command: "judges.evaluateFile",
    title: "$(shield) Re-Evaluate",
  });
}

// ─── /help Handler ──────────────────────────────────────────────────────────

function handleHelp(stream: vscode.ChatResponseStream): vscode.ChatResult | void {
  stream.markdown(
    `### Judges Panel — Chat Commands\n\n` +
      `| Command | What it does |\n` +
      `|---|---|\n` +
      `| \`@judges\` | Review the active file with all 35 judges |\n` +
      `| \`@judges /review\` | Same as above |\n` +
      `| \`@judges /security\` | Security-focused review only |\n` +
      `| \`@judges /fix\` | Auto-fix all fixable findings |\n` +
      `| \`@judges /help\` | Show this help |\n\n` +
      `You can also ask naturally:\n` +
      `- *"@judges review this file for performance issues"*\n` +
      `- *"@judges check security"*\n` +
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
  if (/\breliab\b/.test(prompt)) return /^REL/i;
  if (/\bcost\b/.test(prompt)) return /^COST/i;
  if (/\bscal\b/.test(prompt)) return /^SCAL/i;
  if (/\bapi\b/.test(prompt)) return /^API/i;
  if (/\bdoc\b/.test(prompt)) return /^DOC/i;
  if (/\bcompli\b/.test(prompt)) return /^COMP/i;
  if (/\bobserv\b/.test(prompt)) return /^(OBS|LOG)/i;
  if (/\btest\b/.test(prompt)) return /^TEST/i;
  if (/\baccessib\b/.test(prompt)) return /^A11Y/i;
  if (/\bconcurren\b/.test(prompt)) return /^CONC/i;
  return null;
}
