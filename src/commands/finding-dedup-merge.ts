import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-dedup-merge ────────────────────────────────────────────
   Merge duplicate findings across multiple review runs. Identifies
   findings with the same ruleId appearing in different verdicts
   and produces a consolidated, deduplicated list.
   ─────────────────────────────────────────────────────────────────── */

interface MergedFinding {
  ruleId: string;
  title: string;
  severity: string;
  occurrences: number;
  sources: string[];
  recommendation: string;
}

function mergeFindings(paths: string[]): MergedFinding[] {
  const ruleMap = new Map<string, { title: string; severity: string; sources: string[]; recommendation: string }>();

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8")) as TribunalVerdict;
      const source = p.split(/[/\\]/).pop() ?? p;
      for (const f of data.findings ?? []) {
        const existing = ruleMap.get(f.ruleId);
        if (existing) {
          if (!existing.sources.includes(source)) existing.sources.push(source);
        } else {
          ruleMap.set(f.ruleId, {
            title: f.title,
            severity: f.severity,
            sources: [source],
            recommendation: f.recommendation,
          });
        }
      }
    } catch {
      // Skip malformed files
    }
  }

  const results: MergedFinding[] = [];
  for (const [ruleId, data] of ruleMap) {
    results.push({
      ruleId,
      title: data.title,
      severity: data.severity,
      occurrences: data.sources.length,
      sources: data.sources,
      recommendation: data.recommendation,
    });
  }

  results.sort((a, b) => b.occurrences - a.occurrences);
  return results;
}

function discoverPaths(dir: string): string[] {
  const paths: string[] = [];
  if (!existsSync(dir)) return paths;

  const files = readdirSync(dir) as unknown as string[];
  for (const file of files) {
    if (typeof file === "string" && file.endsWith(".json")) {
      paths.push(join(dir, file));
    }
  }
  return paths;
}

export function runFindingDedupMerge(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-dedup-merge [options]

Merge duplicate findings across review runs.

Options:
  --reports <paths>    Comma-separated list of verdict JSON paths
  --history <path>     Path to history directory (alternative to --reports)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportsIdx = argv.indexOf("--reports");
  const histIdx = argv.indexOf("--history");

  let paths: string[];
  if (reportsIdx !== -1 && argv[reportsIdx + 1]) {
    paths = argv[reportsIdx + 1].split(",").map((p) => join(process.cwd(), p.trim()));
  } else {
    const historyDir =
      histIdx !== -1 && argv[histIdx + 1]
        ? join(process.cwd(), argv[histIdx + 1])
        : join(process.cwd(), ".judges", "history");
    paths = discoverPaths(historyDir);
  }

  if (paths.length === 0) {
    console.log("No verdict files found. Provide --reports or --history.");
    return;
  }

  const merged = mergeFindings(paths);

  if (format === "json") {
    console.log(JSON.stringify(merged, null, 2));
    return;
  }

  const dupes = merged.filter((m) => m.occurrences > 1);
  console.log(`\n=== Dedup Merge (${merged.length} unique rules, ${dupes.length} duplicated across runs) ===\n`);

  if (merged.length === 0) {
    console.log("No findings to merge.");
    return;
  }

  console.log("  " + "Rule ID".padEnd(30) + "Severity".padEnd(10) + "Runs".padEnd(6) + "Title");
  console.log("  " + "-".repeat(75));

  for (const m of merged.slice(0, 30)) {
    console.log("  " + m.ruleId.padEnd(30) + m.severity.padEnd(10) + String(m.occurrences).padEnd(6) + m.title);
  }

  if (merged.length > 30) {
    console.log(`\n  ... and ${merged.length - 30} more`);
  }
}
