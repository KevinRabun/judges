import * as vscode from "vscode";
import type { Finding } from "@kevinrabun/judges/api";

/**
 * CodeLens provider that shows finding counts above functions and classes.
 *
 * For each document symbol (function, method, class), shows a lens like:
 *   "⚠ 3 findings (1 critical, 2 high)" — clicking opens the findings panel.
 *
 * Also shows a file-level summary lens at the top of the document.
 */
export class JudgesCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  private findingsGetter: (uri: string) => Finding[];

  constructor(findingsGetter: (uri: string) => Finding[]) {
    this.findingsGetter = findingsGetter;
  }

  /** Notify VS Code that lenses should be recomputed (call after findings change). */
  refresh(): void {
    this._onDidChange.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    const findings = this.findingsGetter(document.uri.toString());
    if (findings.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];

    // ─── File-Level Summary Lens ───────────────────────────────────────
    const summary = buildSummary(findings);
    lenses.push(
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: `$(shield) ${summary}`,
        command: "judges.showPanel",
        tooltip: "Open Judges findings panel",
      }),
    );

    // ─── Per-Symbol Lenses ─────────────────────────────────────────────
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri,
    );

    if (symbols) {
      const flatSymbols = flattenSymbols(symbols).filter(
        (s) =>
          s.kind === vscode.SymbolKind.Function ||
          s.kind === vscode.SymbolKind.Method ||
          s.kind === vscode.SymbolKind.Class ||
          s.kind === vscode.SymbolKind.Constructor,
      );

      for (const sym of flatSymbols) {
        const startLine = sym.range.start.line + 1; // 1-based
        const endLine = sym.range.end.line + 1;

        const symbolFindings = findings.filter((f) => {
          const line = f.lineNumbers?.[0];
          return line !== undefined && line >= startLine && line <= endLine;
        });

        if (symbolFindings.length > 0) {
          const desc = buildSummary(symbolFindings);
          lenses.push(
            new vscode.CodeLens(sym.range, {
              title: `$(warning) ${desc}`,
              command: "judges.evaluateFile",
              tooltip: symbolFindings.map((f) => `${f.ruleId}: ${f.title}`).join("\n"),
            }),
          );
        }
      }
    }

    return lenses;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const result: vscode.DocumentSymbol[] = [];
  for (const s of symbols) {
    result.push(s);
    if (s.children.length > 0) {
      result.push(...flattenSymbols(s.children));
    }
  }
  return result;
}

function buildSummary(findings: Finding[]): string {
  const total = findings.length;
  const bySev: Record<string, number> = {};
  for (const f of findings) {
    bySev[f.severity] = (bySev[f.severity] || 0) + 1;
  }

  const parts: string[] = [];
  if (bySev.critical) parts.push(`${bySev.critical} critical`);
  if (bySev.high) parts.push(`${bySev.high} high`);
  if (bySev.medium) parts.push(`${bySev.medium} medium`);
  if (bySev.low) parts.push(`${bySev.low} low`);

  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `${total} finding${total === 1 ? "" : "s"}${detail}`;
}
