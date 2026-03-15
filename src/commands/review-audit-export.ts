/**
 * Review-audit-export — Export audit data for external compliance tools.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditRecord {
  timestamp: string;
  action: string;
  actor: string;
  detail: string;
  source: string;
}

interface AuditExport {
  exportedAt: string;
  records: AuditRecord[];
  summary: { total: number; byAction: Record<string, number> };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAuditExport(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : ".judges/audit";
  const outIdx = argv.indexOf("--out");
  const exportFormat = argv.indexOf("--export-format");
  const expFmt = exportFormat >= 0 ? argv[exportFormat + 1] : "json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-audit-export — Export audit data

Usage:
  judges review-audit-export [--dir <path>] [--out <path>]
                             [--export-format json|csv]
                             [--format table|json]

Options:
  --dir <path>           Audit data directory (default: .judges/audit)
  --out <path>           Write export to file
  --export-format <fmt>  Export format: json (default), csv
  --format <fmt>         Display format: table (default), json
  --help, -h             Show this help
`);
    return;
  }

  if (!existsSync(dir)) {
    console.log(`Audit directory not found: ${dir}`);
    console.log("No audit data to export.");
    return;
  }

  const files = (readdirSync(dir) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
  const records: AuditRecord[] = [];

  for (const file of files) {
    const content = JSON.parse(readFileSync(join(dir, file), "utf-8")) as AuditRecord | AuditRecord[];
    if (Array.isArray(content)) {
      records.push(...content);
    } else {
      records.push(content);
    }
  }

  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const byAction: Record<string, number> = {};
  for (const r of records) {
    byAction[r.action] = (byAction[r.action] ?? 0) + 1;
  }

  const auditExport: AuditExport = {
    exportedAt: new Date().toISOString(),
    records,
    summary: { total: records.length, byAction },
  };

  // Write to file
  if (outIdx >= 0) {
    const outPath = argv[outIdx + 1];
    if (expFmt === "csv") {
      const header = "timestamp,action,actor,detail,source";
      const rows = records.map((r) => `"${r.timestamp}","${r.action}","${r.actor}","${r.detail}","${r.source}"`);
      writeFileSync(outPath, [header, ...rows].join("\n"));
    } else {
      writeFileSync(outPath, JSON.stringify(auditExport, null, 2));
    }
    console.log(`Audit exported to: ${outPath} (${expFmt}, ${records.length} records)`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(auditExport, null, 2));
    return;
  }

  console.log(`\nAudit Export`);
  console.log("═".repeat(70));
  console.log(`  Records: ${records.length}`);

  if (Object.keys(byAction).length > 0) {
    console.log("  By action:");
    for (const [action, count] of Object.entries(byAction)) {
      console.log(`    ${action.padEnd(20)} ${count}`);
    }
  }

  if (records.length > 0) {
    console.log(`\n  Latest records:`);
    for (const r of records.slice(-5)) {
      console.log(`    ${r.timestamp.padEnd(22)} ${r.action.padEnd(15)} ${r.actor}`);
    }
  }

  console.log("═".repeat(70));
}
