import * as vscode from "vscode";
import { evaluateWithTribunal } from "@kevinrabun/judges/api";

// ─── LM Tool Registration ───────────────────────────────────────────────────

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
  powershell: "powershell",
};

/** Input schema for the judges_evaluate tool. */
interface JudgesEvaluateInput {
  code?: string;
  language?: string;
}

/**
 * Register Language Model tools so Copilot can auto-discover
 * and invoke Judges evaluation without the `@judges` prefix.
 *
 * When a user asks Copilot something like "evaluate this code for
 * security issues using judges", Copilot's tool selection may
 * invoke `judges_evaluate` automatically.
 */
export function registerLmTools(context: vscode.ExtensionContext): void {
  try {
    if (!vscode.lm?.registerTool) {
      return; // API not available — skip silently
    }

    const tool: vscode.LanguageModelTool<JudgesEvaluateInput> = {
      invoke: handleEvaluateInvoke,
    };

    context.subscriptions.push(vscode.lm.registerTool("judges_evaluate", tool));
  } catch {
    // Graceful degradation
  }
}

// ─── Tool Invoke Handler ─────────────────────────────────────────────────────

async function handleEvaluateInvoke(
  options: vscode.LanguageModelToolInvocationOptions<JudgesEvaluateInput>,
  token: vscode.CancellationToken,
): Promise<vscode.LanguageModelToolResult> {
  const input = options.input ?? {};

  // Resolve code + language from input or active editor
  let code = input.code;
  let language = input.language;

  if (!code) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("No code provided and no file is open in the editor."),
      ]);
    }
    code = editor.document.getText();
    language = language ?? LANG_MAP[editor.document.languageId];
  }

  if (!language) {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        "Unable to determine the language. Please specify a language or open a supported file.",
      ),
    ]);
  }

  if (!code.trim()) {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart("The file is empty — nothing to evaluate."),
    ]);
  }

  if (token.isCancellationRequested) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("Evaluation cancelled.")]);
  }

  try {
    const verdict = evaluateWithTribunal(code, language);
    const findings = verdict.evaluations.flatMap((e) => e.findings);

    if (findings.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Judges Panel evaluation complete. Score: ${verdict.overallScore}/100. ` +
            `No findings — all ${verdict.evaluations.length} judges passed.`,
        ),
      ]);
    }

    // Build structured result for the LLM
    const lines: string[] = [
      `Judges Panel evaluation complete.`,
      `Score: ${verdict.overallScore}/100`,
      `Findings: ${findings.length}`,
      `Judges run: ${verdict.evaluations.length}`,
      "",
    ];

    for (const f of findings) {
      const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
      lines.push(`[${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}${lineRef}`);
      lines.push(`  ${f.description}`);
      if (f.suggestedFix) {
        lines.push(`  Fix: ${f.suggestedFix}`);
      }
      lines.push("");
    }

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(lines.join("\n"))]);
  } catch (error) {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `Error running Judges evaluation: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ]);
  }
}
