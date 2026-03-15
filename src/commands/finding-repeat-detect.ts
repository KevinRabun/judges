import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-repeat-detect ──────────────────────────────────────────
   Detect findings that repeat across multiple reviews by comparing
   rule IDs across verdict history files. Recurring findings
   indicate unaddressed systemic issues.
   ─────────────────────────────────────────────────────────────────── */

interface RepeatEntry {
  ruleId: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  severity: string;
  sampleTitle: string;
}

interface RepeatReport {
  totalRepeats: number;
  uniqueRepeatingRules: number;
  entries: RepeatEntry[];
}

function detectRepeats(historyDir: string): RepeatReport {
  if (!existsSync(historyDir)) {
    return { totalRepeats: 0, uniqueRepeatingRules: 0, entries: [] };
  }

  const files = readdirSync(historyDir) as unknown as string[];
  const jsonFiles = files.filter((f) => String(f).endsWith(".json")).sort();

  const ruleData: Record<
    string,
    { occurrences: number; firstSeen: string; lastSeen: string; severity: string; title: string }
  > = {};

  for (const file of jsonFiles) {
    const raw = readFileSync(join(historyDir, String(file)), "utf-8");
    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(raw) as TribunalVerdict;
    } catch {
      continue;
    }

    const period = String(file).replace(/\.json$/, "");
    const seenInFile = new Set<string>();

    for (const f of verdict.findings ?? []) {
      if (seenInFile.has(f.ruleId)) continue;
      seenInFile.add(f.ruleId);

      if (!ruleData[f.ruleId]) {
        ruleData[f.ruleId] = {
          occurrences: 0,
          firstSeen: period,
          lastSeen: period,
          severity: f.severity,
          title: f.title,
        };
      }

      ruleData[f.ruleId].occurrences += 1;
      ruleData[f.ruleId].lastSeen = period;
    }
  }

  const entries: RepeatEntry[] = [];
  for (const [ruleId, data] of Object.entries(ruleData)) {
    if (data.occurrences > 1) {
      entries.push({
        ruleId,
        occurrences: data.occurrences,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        severity: data.severity,
        sampleTitle: data.title,
      });
    }
  }

  entries.sort((a, b) => b.occurrences - a.occurrences);

  return {
    totalRepeats: entries.reduce((sum, e) => sum + e.occurrences, 0),
    uniqueRepeatingRules: entries.length,
    entries,
  };
}

export function runFindingRepeatDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-repeat-detect [options]

Detect findings that repeat across multiple reviews.

Options:
  --history <dir>      Directory with verdict JSON files (default: .judges/history)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const histIdx = argv.indexOf("--history");
  const historyDir =
    histIdx !== -1 && argv[histIdx + 1]
      ? join(process.cwd(), argv[histIdx + 1])
      : join(process.cwd(), ".judges", "history");

  const report = detectRepeats(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `\n=== Repeat Detection (${report.uniqueRepeatingRules} repeating rules, ${report.totalRepeats} total occurrences) ===\n`,
  );

  if (report.entries.length === 0) {
    console.log("No repeating findings detected.");
    return;
  }

  for (const e of report.entries) {
    console.log(`  ${e.ruleId} — ${e.occurrences} occurrences [${e.severity}]`);
    console.log(`       First: ${e.firstSeen}  Last: ${e.lastSeen}`);
    console.log(`       ${e.sampleTitle}`);
    console.log();
  }
}
