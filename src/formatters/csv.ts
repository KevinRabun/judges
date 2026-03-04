// ─── CSV Formatter ──────────────────────────────────────────────────────────
// Converts tribunal verdicts to CSV for spreadsheet / data-pipeline ingestion.
// ──────────────────────────────────────────────────────────────────────────────

import type { TribunalVerdict, Finding } from "../types.js";

const CSV_HEADER = "file,ruleId,severity,confidence,title,lines,reference";

/** Escape a CSV cell value. */
function escapeCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format a single verdict as CSV rows (without header).
 */
export function verdictToCsvRows(verdict: TribunalVerdict, filePath = "unknown"): string[] {
  return verdict.findings.map((f) =>
    [
      escapeCell(filePath),
      f.ruleId,
      f.severity,
      String(f.confidence ?? ""),
      escapeCell(f.title),
      f.lineNumbers?.join(";") ?? "",
      escapeCell(f.reference ?? ""),
    ].join(","),
  );
}

/**
 * Format one or more verdicts as a complete CSV string (with header).
 */
export function verdictsToCsv(verdicts: Array<{ filePath: string; verdict: TribunalVerdict }>): string {
  const rows = [CSV_HEADER];
  for (const { filePath, verdict } of verdicts) {
    rows.push(...verdictToCsvRows(verdict, filePath));
  }
  return rows.join("\n") + "\n";
}

/**
 * Format findings from any source as CSV.
 */
export function findingsToCsv(findings: Finding[], filePath = "unknown"): string {
  const rows = [CSV_HEADER];
  for (const f of findings) {
    rows.push(
      [
        escapeCell(filePath),
        f.ruleId,
        f.severity,
        String(f.confidence ?? ""),
        escapeCell(f.title),
        f.lineNumbers?.join(";") ?? "",
        escapeCell(f.reference ?? ""),
      ].join(","),
    );
  }
  return rows.join("\n") + "\n";
}
