import * as vscode from "vscode";
import type { Finding } from "@kevinrabun/judges/api";

// ─── Severity Helpers ──────────────────────────────────────────────────────

const SEVERITY_ICON: Record<string, string> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "debug-hint",
  info: "comment",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

// ─── Tree Item Types ───────────────────────────────────────────────────────

export type PanelItem = FileGroupItem | JudgeGroupItem | FindingItem | SummaryItem;

export class FileGroupItem extends vscode.TreeItem {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly findings: Finding[],
  ) {
    const label = vscode.workspace.asRelativePath(uri);
    super(label, vscode.TreeItemCollapsibleState.Expanded);

    const counts = countBySeverity(findings);
    this.description = `${findings.length} finding${findings.length === 1 ? "" : "s"}`;
    this.tooltip = Object.entries(counts)
      .map(([s, n]) => `${SEVERITY_LABEL[s]}: ${n}`)
      .join(", ");

    const worst = findings.reduce(
      (w, f) => ((SEVERITY_ORDER[f.severity] ?? 4) < (SEVERITY_ORDER[w] ?? 4) ? f.severity : w),
      "info",
    );
    this.iconPath = new vscode.ThemeIcon(SEVERITY_ICON[worst] ?? "file", new vscode.ThemeColor(severityColor(worst)));
    this.contextValue = "fileGroup";
  }
}

export class JudgeGroupItem extends vscode.TreeItem {
  constructor(
    public readonly judgePrefix: string,
    public readonly findings: Finding[],
    public readonly fileUri: vscode.Uri,
  ) {
    super(`${judgePrefix} (${findings.length})`, vscode.TreeItemCollapsibleState.Expanded);
    const worst = findings.reduce(
      (w, f) => ((SEVERITY_ORDER[f.severity] ?? 4) < (SEVERITY_ORDER[w] ?? 4) ? f.severity : w),
      "info",
    );
    this.iconPath = new vscode.ThemeIcon(
      SEVERITY_ICON[worst] ?? "symbol-namespace",
      new vscode.ThemeColor(severityColor(worst)),
    );
    this.contextValue = "judgeGroup";
  }
}

export class FindingItem extends vscode.TreeItem {
  constructor(
    public readonly finding: Finding,
    public readonly fileUri: vscode.Uri,
  ) {
    const line = finding.lineNumbers?.[0] ?? 1;
    const label = `${finding.ruleId} — ${finding.title}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = `line ${line}`;
    this.tooltip = new vscode.MarkdownString(
      `**[${finding.severity.toUpperCase()}] ${finding.ruleId}** — ${finding.title}\n\n` +
        `${finding.description}\n\n` +
        (finding.suggestedFix ? `💡 **Fix:** ${finding.suggestedFix}\n\n` : "") +
        `Confidence: ${Math.round((finding.confidence ?? 0) * 100)}%  |  Line ${line}`,
    );

    this.iconPath = new vscode.ThemeIcon(
      SEVERITY_ICON[finding.severity] ?? "circle-outline",
      new vscode.ThemeColor(severityColor(finding.severity)),
    );

    // Clicking a finding jumps to the line in the editor
    const safeLine = Math.max(0, line - 1);
    this.command = {
      command: "vscode.open",
      title: "Go to finding",
      arguments: [
        fileUri,
        <vscode.TextDocumentShowOptions>{
          selection: new vscode.Range(safeLine, 0, safeLine, 0),
          preserveFocus: false,
        },
      ],
    };
    this.contextValue = "finding";
  }
}

export class SummaryItem extends vscode.TreeItem {
  constructor(totalFindings: number, fileCount: number, counts: Record<string, number>) {
    const parts: string[] = [];
    for (const s of ["critical", "high", "medium", "low", "info"]) {
      if (counts[s]) parts.push(`${counts[s]} ${SEVERITY_LABEL[s].toLowerCase()}`);
    }
    const label =
      totalFindings === 0
        ? "No findings — all clear ✓"
        : `${totalFindings} finding${totalFindings === 1 ? "" : "s"} in ${fileCount} file${fileCount === 1 ? "" : "s"}`;

    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = parts.join(", ");
    this.iconPath = new vscode.ThemeIcon(
      totalFindings === 0 ? "pass-filled" : "checklist",
      totalFindings === 0 ? new vscode.ThemeColor("testing.iconPassed") : undefined,
    );
    this.contextValue = "summary";
  }
}

// ─── Tree Data Provider ────────────────────────────────────────────────────

export type SortMode = "severity" | "file" | "rule" | "judge";
export type FilterSeverity = "all" | "critical" | "high" | "medium" | "low" | "info";

export class JudgesFindingsPanel implements vscode.TreeDataProvider<PanelItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PanelItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Map from file URI string → findings */
  private findingsMap = new Map<string, { uri: vscode.Uri; findings: Finding[] }>();
  private sortMode: SortMode = "severity";
  private filterSeverity: FilterSeverity = "all";

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /** Called by the diagnostic provider whenever findings change for a file. */
  updateFindings(uri: vscode.Uri, findings: Finding[]): void {
    const key = uri.toString();
    if (findings.length === 0) {
      this.findingsMap.delete(key);
    } else {
      this.findingsMap.set(key, { uri, findings });
    }
    this.refresh();
  }

  /** Clear all findings (mirrors diagnosticCollection.clear). */
  clearAll(): void {
    this.findingsMap.clear();
    this.refresh();
  }

  setSortMode(mode: SortMode): void {
    this.sortMode = mode;
    this.refresh();
  }

  setFilterSeverity(severity: FilterSeverity): void {
    this.filterSeverity = severity;
    this.refresh();
  }

  getSortMode(): SortMode {
    return this.sortMode;
  }

  getFilterSeverity(): FilterSeverity {
    return this.filterSeverity;
  }

  // ── TreeDataProvider Interface ──

  getTreeItem(element: PanelItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PanelItem): PanelItem[] {
    if (!element) {
      return this.getRootItems();
    }
    if (element instanceof FileGroupItem) {
      return this.getFileChildren(element);
    }
    if (element instanceof JudgeGroupItem) {
      return element.findings.map((f) => new FindingItem(f, element.fileUri));
    }
    return [];
  }

  private getRootItems(): PanelItem[] {
    const allEntries = [...this.findingsMap.values()];
    if (allEntries.length === 0) {
      return [new SummaryItem(0, 0, {})];
    }

    // Apply severity filter
    const filtered = allEntries
      .map(({ uri, findings }) => ({
        uri,
        findings: this.filterSeverity === "all" ? findings : findings.filter((f) => f.severity === this.filterSeverity),
      }))
      .filter((e) => e.findings.length > 0);

    if (filtered.length === 0) {
      return [new SummaryItem(0, 0, {})];
    }

    // Sort files by worst severity first, then by name
    const sorted = [...filtered].sort((a, b) => {
      const aWorst = Math.min(...a.findings.map((f) => SEVERITY_ORDER[f.severity] ?? 4));
      const bWorst = Math.min(...b.findings.map((f) => SEVERITY_ORDER[f.severity] ?? 4));
      if (aWorst !== bWorst) return aWorst - bWorst;
      return vscode.workspace.asRelativePath(a.uri).localeCompare(vscode.workspace.asRelativePath(b.uri));
    });

    const totalFindings = filtered.reduce((sum, e) => sum + e.findings.length, 0);
    const globalCounts = countBySeverity(filtered.flatMap((e) => e.findings));

    const items: PanelItem[] = [new SummaryItem(totalFindings, filtered.length, globalCounts)];
    for (const { uri, findings } of sorted) {
      items.push(new FileGroupItem(uri, findings));
    }
    return items;
  }

  private getFileChildren(group: FileGroupItem): (FindingItem | JudgeGroupItem)[] {
    // Judge sort mode: group by judge prefix (e.g. AUTH, CRYPTO, LOGIC)
    if (this.sortMode === "judge") {
      const byJudge = new Map<string, Finding[]>();
      for (const f of group.findings) {
        const prefix = f.ruleId.split("-")[0] ?? "UNKNOWN";
        const list = byJudge.get(prefix) ?? [];
        list.push(f);
        byJudge.set(prefix, list);
      }
      // Sort judge groups by worst severity
      const sortedGroups = [...byJudge.entries()].sort((a, b) => {
        const aWorst = Math.min(...a[1].map((f) => SEVERITY_ORDER[f.severity] ?? 4));
        const bWorst = Math.min(...b[1].map((f) => SEVERITY_ORDER[f.severity] ?? 4));
        return aWorst - bWorst;
      });
      return sortedGroups.map(([prefix, findings]) => new JudgeGroupItem(prefix, findings, group.uri));
    }

    const sorted = [...group.findings].sort((a, b) => {
      if (this.sortMode === "severity") {
        const diff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
        if (diff !== 0) return diff;
        return (a.lineNumbers?.[0] ?? 0) - (b.lineNumbers?.[0] ?? 0);
      }
      if (this.sortMode === "rule") {
        const cmp = a.ruleId.localeCompare(b.ruleId);
        if (cmp !== 0) return cmp;
        return (a.lineNumbers?.[0] ?? 0) - (b.lineNumbers?.[0] ?? 0);
      }
      // "file" sort = by line number
      return (a.lineNumbers?.[0] ?? 0) - (b.lineNumbers?.[0] ?? 0);
    });
    return sorted.map((f) => new FindingItem(f, group.uri));
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function countBySeverity(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "testing.iconFailed";
    case "high":
      return "editorWarning.foreground";
    case "medium":
      return "editorInfo.foreground";
    case "low":
      return "editorHint.foreground";
    default:
      return "foreground";
  }
}
