/**
 * Review-audit-log — Comprehensive local audit log for compliance tracking.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { userInfo } from "os";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  timestamp: string;
  action: string;
  command: string;
  user: string;
  details: Record<string, unknown>;
  result: string;
}

interface AuditLog {
  version: string;
  entries: AuditEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const LOG_FILE = join(".judges", "audit-log.json");

function loadLog(): AuditLog {
  if (!existsSync(LOG_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(LOG_FILE, "utf-8")) as AuditLog;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveLog(log: AuditLog): void {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAuditLog(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-audit-log — Comprehensive local audit log

Usage:
  judges review-audit-log show                     Show recent audit entries
  judges review-audit-log show --last 20           Show last N entries
  judges review-audit-log record --action review   Record an audit entry
  judges review-audit-log search --action suppress Search by action
  judges review-audit-log export --output log.csv  Export to CSV
  judges review-audit-log clear                    Clear audit log

Subcommands:
  show                  Show audit entries
  record                Record a new entry
  search                Search entries
  export                Export log
  clear                 Clear all entries

Options:
  --action <type>       Action type (review, suppress, approve, fix, configure, etc.)
  --command <cmd>       Command that was run
  --result <text>       Result description
  --last <n>            Show last N entries (default: 10)
  --output <path>       Export file path
  --format json         JSON output
  --help, -h            Show this help

Tracks all review actions locally for compliance and auditability.
Data stored in .judges/audit-log.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["show", "record", "search", "export", "clear"].includes(a)) || "show";
  const log = loadLog();

  if (subcommand === "record") {
    const action = argv.find((_a: string, i: number) => argv[i - 1] === "--action") || "unknown";
    const command = argv.find((_a: string, i: number) => argv[i - 1] === "--command") || "";
    const result = argv.find((_a: string, i: number) => argv[i - 1] === "--result") || "success";
    const user = userInfo().username || "unknown";

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      command,
      user,
      details: {},
      result,
    };

    log.entries.push(entry);
    saveLog(log);
    console.log(`Audit entry recorded: ${action} by ${user}`);
    return;
  }

  if (subcommand === "clear") {
    saveLog({ version: "1.0.0", entries: [] });
    console.log("Audit log cleared.");
    return;
  }

  if (subcommand === "search") {
    const action = argv.find((_a: string, i: number) => argv[i - 1] === "--action");
    const filtered = action ? log.entries.filter((e) => e.action === action) : log.entries;
    if (format === "json") {
      console.log(JSON.stringify(filtered, null, 2));
      return;
    }
    if (filtered.length === 0) {
      console.log(`No entries found${action ? ` for action "${action}"` : ""}.`);
      return;
    }
    console.log(`\nSearch Results (${filtered.length} entries):`);
    console.log("─".repeat(80));
    for (const e of filtered.slice(-20)) {
      console.log(`  ${e.timestamp}  [${e.action}]  ${e.command || "-"}  → ${e.result}  (${e.user})`);
    }
    console.log("─".repeat(80));
    return;
  }

  if (subcommand === "export") {
    const output = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
    if (!output) {
      console.error("Error: --output is required for export.");
      process.exitCode = 1;
      return;
    }
    const header = "timestamp,action,command,user,result\n";
    const rows = log.entries
      .map((e) => `"${e.timestamp}","${e.action}","${e.command}","${e.user}","${e.result}"`)
      .join("\n");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, header + rows, "utf-8");
    console.log(`Exported ${log.entries.length} entries to ${output}`);
    return;
  }

  // show
  const lastN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--last") || "10", 10);
  const entries = log.entries.slice(-lastN);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log("No audit entries recorded yet.");
    return;
  }

  console.log(`\nAudit Log (last ${entries.length} of ${log.entries.length}):`);
  console.log("─".repeat(80));
  console.log("  Timestamp                    Action       Command              Result");
  console.log("─".repeat(80));
  for (const e of entries) {
    const ts = e.timestamp.slice(0, 19).replace("T", " ");
    console.log(`  ${ts}  ${e.action.padEnd(12)} ${(e.command || "-").padEnd(20)} ${e.result}`);
  }
  console.log("─".repeat(80));
  console.log(`  Total entries: ${log.entries.length}`);
}
