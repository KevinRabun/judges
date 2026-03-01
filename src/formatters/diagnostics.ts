/**
 * IDE Diagnostics Protocol — LSP-compatible diagnostic output
 *
 * Converts judges findings into LSP Diagnostic format for IDE integration.
 * Supports VS Code, Neovim, and any LSP-compatible editor.
 *
 * Output format follows the Language Server Protocol specification.
 */

import type { Finding } from "../types.js";

// ─── LSP-Compatible Types ────────────────────────────────────────────────────

export type DiagnosticSeverity = 1 | 2 | 3 | 4; // Error, Warning, Information, Hint
export interface Position {
  line: number;
  character: number;
}
export interface Range {
  start: Position;
  end: Position;
}

export interface DiagnosticRelatedInformation {
  location: { uri: string; range: Range };
  message: string;
}

export interface Diagnostic {
  range: Range;
  severity: DiagnosticSeverity;
  code?: string;
  codeDescription?: { href: string };
  source: string;
  message: string;
  tags?: number[];
  relatedInformation?: DiagnosticRelatedInformation[];
  data?: Record<string, unknown>;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

// ─── Severity Mapping ────────────────────────────────────────────────────────

const SEVERITY_MAP: Record<string, DiagnosticSeverity> = {
  critical: 1, // Error
  high: 1, // Error
  medium: 2, // Warning
  low: 3, // Information
  info: 4, // Hint
};

function mapSeverity(severity: string): DiagnosticSeverity {
  return SEVERITY_MAP[severity.toLowerCase()] || 2;
}

// ─── Diagnostic Tags ─────────────────────────────────────────────────────────

/** LSP DiagnosticTag.Unnecessary = 1, DiagnosticTag.Deprecated = 2 */
function getDiagnosticTags(finding: Finding): number[] | undefined {
  const tags: number[] = [];
  if (finding.ruleId?.includes("deprecated") || finding.title?.toLowerCase().includes("deprecated")) {
    tags.push(2); // Deprecated
  }
  if (finding.ruleId?.includes("unused") || finding.title?.toLowerCase().includes("unused")) {
    tags.push(1); // Unnecessary
  }
  return tags.length > 0 ? tags : undefined;
}

// ─── Core Conversion ─────────────────────────────────────────────────────────

/**
 * Convert a Finding to an LSP Diagnostic.
 */
export function findingToDiagnostic(finding: Finding, _fileUri?: string): Diagnostic {
  const startLine = finding.lineNumbers?.[0];
  const line = startLine && startLine > 0 ? startLine - 1 : 0; // LSP is 0-indexed
  const lastLine = finding.lineNumbers?.[finding.lineNumbers.length - 1];
  const endLine = lastLine && lastLine > 0 ? lastLine - 1 : line;

  const range: Range = {
    start: { line, character: 0 },
    end: { line: endLine, character: 999 },
  };

  const message = [
    finding.title || finding.ruleId || "Code issue",
    finding.description || "",
    finding.suggestedFix ? `Fix: ${finding.suggestedFix}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const diagnostic: Diagnostic = {
    range,
    severity: mapSeverity(finding.severity),
    code: finding.ruleId,
    source: "judges/tribunal",
    message,
    tags: getDiagnosticTags(finding),
    data: {
      confidence: finding.confidence,
      patch: finding.patch,
    },
  };

  return diagnostic;
}

/**
 * Convert an array of Findings into LSP PublishDiagnosticsParams.
 */
export function findingsToDiagnostics(findings: Finding[], fileUri: string): PublishDiagnosticsParams {
  return {
    uri: fileUri,
    diagnostics: findings.map((f) => findingToDiagnostic(f, fileUri)),
  };
}

// ─── Code Actions ────────────────────────────────────────────────────────────

export interface CodeAction {
  title: string;
  kind: string;
  diagnostics: Diagnostic[];
  isPreferred?: boolean;
  edit?: { changes: Record<string, TextEdit[]> };
}

export interface TextEdit {
  range: Range;
  newText: string;
}

/**
 * Generate code actions (quick fixes) from findings that have patches.
 */
export function findingsToCodeActions(findings: Finding[], fileUri: string): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const finding of findings) {
    if (!finding.patch) continue;

    const diagnostic = findingToDiagnostic(finding, fileUri);
    const action: CodeAction = {
      title: `Fix: ${finding.title || finding.ruleId || "issue"}`,
      kind: "quickfix",
      diagnostics: [diagnostic],
      isPreferred: finding.severity === "critical" || finding.severity === "high",
    };

    // If patch has enough info for a text edit
    if (finding.patch.newText !== undefined) {
      const line = (finding.patch.startLine || 1) - 1;
      const endLine = (finding.patch.endLine || finding.patch.startLine || 1) - 1;
      action.edit = {
        changes: {
          [fileUri]: [
            {
              range: {
                start: { line, character: 0 },
                end: { line: endLine + 1, character: 0 },
              },
              newText: finding.patch.newText + "\n",
            },
          ],
        },
      };
    }

    actions.push(action);
  }

  return actions;
}

// ─── JSON-RPC Output ─────────────────────────────────────────────────────────

/**
 * Format diagnostics as JSON-RPC notification (for piping to LSP clients).
 */
export function formatAsJsonRpc(params: PublishDiagnosticsParams): string {
  const notification = {
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params,
  };
  const content = JSON.stringify(notification);
  return `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n${content}`;
}

/**
 * Format multiple files' diagnostics as a stream of JSON-RPC notifications.
 */
export function formatDiagnosticsStream(fileFindings: Map<string, Finding[]>): string {
  const parts: string[] = [];
  for (const [uri, findings] of fileFindings) {
    const params = findingsToDiagnostics(findings, uri);
    parts.push(formatAsJsonRpc(params));
  }
  return parts.join("");
}

// ─── VS Code Problem Matcher ────────────────────────────────────────────────

/**
 * Format findings as VS Code problem matcher compatible output.
 * Pattern: file:line:column: severity: message [ruleId]
 */
export function formatForProblemMatcher(findings: Finding[], filePath: string): string {
  return findings
    .map((f) => {
      const line = f.lineNumbers?.[0] || 1;
      const col = 1;
      const sev = f.severity === "critical" || f.severity === "high" ? "error" : "warning";
      const msg = f.title || f.ruleId || "issue";
      const rule = f.ruleId ? ` [${f.ruleId}]` : "";
      return `${filePath}:${line}:${col}: ${sev}: ${msg}${rule}`;
    })
    .join("\n");
}
