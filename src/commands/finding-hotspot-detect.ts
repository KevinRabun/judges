import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Finding } from "../types.js";

/* ── finding-hotspot-detect ─────────────────────────────────────────
   Detect code hotspots — areas with recurring findings across
   multiple review runs — to help teams prioritize refactoring
   and focused quality improvement.
   ─────────────────────────────────────────────────────────────────── */

interface Hotspot {
  ruleId: string;
  occurrences: number;
  severity: string;
  avgConfidence: number;
  lineRanges: number[];
  recommendation: string;
}

function detectHotspots(allFindings: Finding[]): Hotspot[] {
  const ruleGroups = new Map<string, Finding[]>();

  for (const f of allFindings) {
    const group = ruleGroups.get(f.ruleId);
    if (group !== undefined) {
      group.push(f);
    } else {
      ruleGroups.set(f.ruleId, [f]);
    }
  }

  const hotspots: Hotspot[] = [];
  for (const [ruleId, findings] of ruleGroups) {
    if (findings.length < 2) continue;

    const lines: number[] = [];
    for (const f of findings) {
      if (f.lineNumbers !== undefined) {
        lines.push(...f.lineNumbers);
      }
    }

    const avgConf = findings.reduce((sum, f) => sum + (f.confidence ?? 0.5), 0) / findings.length;
    const uniqueLines = [...new Set(lines)].sort((a, b) => a - b);

    let recommendation: string;
    if (findings.length >= 5) {
      recommendation = "Critical hotspot — prioritize refactoring";
    } else if (findings.length >= 3) {
      recommendation = "Frequent issue — add targeted tests";
    } else {
      recommendation = "Recurring pattern — monitor";
    }

    hotspots.push({
      ruleId,
      occurrences: findings.length,
      severity: findings[0].severity,
      avgConfidence: avgConf,
      lineRanges: uniqueLines.slice(0, 20),
      recommendation,
    });
  }

  hotspots.sort((a, b) => b.occurrences - a.occurrences);
  return hotspots;
}

export function runFindingHotspotDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-hotspot-detect [options]

Detect code hotspots with recurring findings.

Options:
  --dir <path>       Directory with verdict JSON files
  --report <path>    Single verdict JSON file
  --min <n>          Minimum occurrences to report (default: 2)
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const minIdx = argv.indexOf("--min");
  const minOccurrences = minIdx !== -1 && argv[minIdx + 1] ? parseInt(argv[minIdx + 1], 10) : 2;

  const allFindings: Finding[] = [];

  const dirIdx = argv.indexOf("--dir");
  const dirPath =
    dirIdx !== -1 && argv[dirIdx + 1]
      ? join(process.cwd(), argv[dirIdx + 1])
      : join(process.cwd(), ".judges", "history");

  if (existsSync(dirPath)) {
    const files = (readdirSync(dirPath) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(dirPath, file), "utf-8"));
      if (data.findings !== undefined) {
        allFindings.push(...(data.findings as Finding[]));
      }
    }
  }

  const reportIdx = argv.indexOf("--report");
  if (reportIdx !== -1 && argv[reportIdx + 1]) {
    const rPath = join(process.cwd(), argv[reportIdx + 1]);
    if (existsSync(rPath)) {
      const data = JSON.parse(readFileSync(rPath, "utf-8"));
      if (data.findings !== undefined) {
        allFindings.push(...(data.findings as Finding[]));
      }
    }
  }

  if (allFindings.length === 0) {
    const defaultPath = join(process.cwd(), ".judges", "last-verdict.json");
    if (existsSync(defaultPath)) {
      const data = JSON.parse(readFileSync(defaultPath, "utf-8"));
      if (data.findings !== undefined) {
        allFindings.push(...(data.findings as Finding[]));
      }
    }
  }

  if (allFindings.length === 0) {
    console.log("No findings data found. Run reviews first.");
    return;
  }

  const hotspots = detectHotspots(allFindings).filter((h) => h.occurrences >= minOccurrences);

  if (format === "json") {
    console.log(JSON.stringify(hotspots, null, 2));
    return;
  }

  console.log("\n=== Code Hotspots ===\n");
  console.log(`Total findings analyzed: ${allFindings.length}`);
  console.log(`Hotspots found: ${hotspots.length}\n`);

  for (const h of hotspots) {
    console.log(`[${h.severity.toUpperCase()}] ${h.ruleId} — ${h.occurrences} occurrences`);
    console.log(`  Confidence: ${(h.avgConfidence * 100).toFixed(0)}%`);
    if (h.lineRanges.length > 0) {
      console.log(`  Lines: ${h.lineRanges.join(", ")}`);
    }
    console.log(`  → ${h.recommendation}`);
    console.log();
  }
}
