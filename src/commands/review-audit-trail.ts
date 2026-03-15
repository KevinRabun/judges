/**
 * Review-audit-trail — Maintain an audit trail of all reviews performed.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  timestamp: string;
  verdict: string;
  score: number;
  findingCount: number;
  criticalCount: number;
  summary: string;
}

interface AuditLog {
  version: number;
  entries: AuditEntry[];
}

// ─── Logic ──────────────────────────────────────────────────────────────────

function loadAuditLog(path: string): AuditLog {
  if (!existsSync(path)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { version: 1, entries: [] };
  }
}

function generateId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAuditTrail(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const logIdx = argv.indexOf("--log");
  const lastIdx = argv.indexOf("--last");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const logPath = logIdx >= 0 ? argv[logIdx + 1] : ".judges-audit.json";
  const lastN = lastIdx >= 0 ? parseInt(argv[lastIdx + 1], 10) : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-audit-trail — Maintain review audit trail

Usage:
  judges review-audit-trail [--file <verdict.json>] [--log <path>]
                            [--last <n>] [--format table|json]

Options:
  --file <path>      Add verdict to audit trail
  --log <path>       Audit log file (default: .judges-audit.json)
  --last <n>         Show last N entries
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const log = loadAuditLog(logPath);

  // Add mode
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`Error: not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }

    log.entries.push({
      id: generateId(),
      timestamp: new Date().toISOString(),
      verdict: verdict.overallVerdict,
      score: verdict.overallScore,
      findingCount: verdict.findings.length,
      criticalCount: verdict.criticalCount,
      summary: verdict.summary.slice(0, 200),
    });

    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`Added audit entry (${log.entries.length} total)`);
    return;
  }

  // View mode
  let entries = log.entries;
  if (lastN !== undefined) {
    entries = entries.slice(-lastN);
  }

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\nAudit Trail (${entries.length} entries)`);
  console.log("═".repeat(75));
  console.log(
    `${"Timestamp".padEnd(22)} ${"Verdict".padEnd(10)} ${"Score".padEnd(8)} ${"Findings".padEnd(10)} Summary`,
  );
  console.log("─".repeat(75));

  for (const e of entries) {
    const ts = e.timestamp.slice(0, 19).replace("T", " ");
    const summary = e.summary.length > 20 ? e.summary.slice(0, 20) + "…" : e.summary;
    console.log(
      `${ts.padEnd(22)} ${e.verdict.padEnd(10)} ${String(e.score).padEnd(8)} ${String(e.findingCount).padEnd(10)} ${summary}`,
    );
  }
  console.log("═".repeat(75));
}
