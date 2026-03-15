import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-recurrence-check ───────────────────────────────────────
   Check how often findings recur across review history. Identifies
   persistent issues that keep appearing despite fixes.
   ─────────────────────────────────────────────────────────────────── */

interface RecurrenceEntry {
  ruleId: string;
  title: string;
  severity: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  status: string;
}

function checkRecurrence(historyDir: string, current: Finding[]): RecurrenceEntry[] {
  const ruleHistory = new Map<string, { dates: string[]; severity: string; title: string }>();

  // Scan history files
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir) as unknown as string[];
    for (const file of files) {
      if (typeof file === "string" && file.endsWith(".json")) {
        try {
          const data = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict;
          const date = data.timestamp ?? file.replace(".json", "");
          for (const f of data.findings ?? []) {
            const entry = ruleHistory.get(f.ruleId) ?? { dates: [], severity: f.severity, title: f.title };
            entry.dates.push(date);
            ruleHistory.set(f.ruleId, entry);
          }
        } catch {
          // Skip malformed files
        }
      }
    }
  }

  // Add current findings
  const now = new Date().toISOString().slice(0, 10);
  for (const f of current) {
    const entry = ruleHistory.get(f.ruleId) ?? { dates: [], severity: f.severity, title: f.title };
    entry.dates.push(now);
    ruleHistory.set(f.ruleId, entry);
  }

  // Build recurrence entries
  const entries: RecurrenceEntry[] = [];
  for (const [ruleId, data] of ruleHistory) {
    const uniqueDates = [...new Set(data.dates)].sort();
    let status: string;
    if (uniqueDates.length >= 5) status = "Chronic — needs architectural fix";
    else if (uniqueDates.length >= 3) status = "Recurring — needs attention";
    else if (uniqueDates.length >= 2) status = "Repeated — monitor";
    else status = "First occurrence";

    entries.push({
      ruleId,
      title: data.title,
      severity: data.severity,
      occurrences: uniqueDates.length,
      firstSeen: uniqueDates[0],
      lastSeen: uniqueDates[uniqueDates.length - 1],
      status,
    });
  }

  entries.sort((a, b) => b.occurrences - a.occurrences);
  return entries;
}

export function runFindingRecurrenceCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-recurrence-check [options]

Check finding recurrence across history.

Options:
  --report <path>      Path to current verdict JSON
  --history <path>     Path to history directory
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const histIdx = argv.indexOf("--history");
  const historyDir =
    histIdx !== -1 && argv[histIdx + 1]
      ? join(process.cwd(), argv[histIdx + 1])
      : join(process.cwd(), ".judges", "history");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const current = data.findings ?? [];
  const entries = checkRecurrence(historyDir, current);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  const recurring = entries.filter((e) => e.occurrences >= 2);
  console.log(`\n=== Recurrence Check (${recurring.length} recurring of ${entries.length} total) ===\n`);

  for (const e of entries.filter((e) => e.occurrences >= 2)) {
    console.log(`${e.ruleId}: ${e.title} (${e.occurrences}x)`);
    console.log(`  ${e.severity} | First: ${e.firstSeen} | Last: ${e.lastSeen}`);
    console.log(`  Status: ${e.status}`);
    console.log();
  }

  if (recurring.length === 0) {
    console.log("No recurring findings detected.");
  }
}
