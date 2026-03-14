/**
 * Finding-hotspot — Identify files and directories with highest finding density.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Hotspot {
  path: string;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  ruleIds: string[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeHotspots(verdicts: TribunalVerdict[]): Hotspot[] {
  const fileMap = new Map<string, { findings: number; criticals: number; highs: number; rules: Set<string> }>();

  for (const v of verdicts) {
    for (const f of v.findings || []) {
      // Use ruleId prefix as a proxy for file grouping since Finding has no file property
      const key = f.ruleId ? f.ruleId.split("-")[0] : "UNKNOWN";
      const entry = fileMap.get(key) || { findings: 0, criticals: 0, highs: 0, rules: new Set<string>() };
      entry.findings++;
      if (f.severity === "critical") entry.criticals++;
      if (f.severity === "high") entry.highs++;
      if (f.ruleId) entry.rules.add(f.ruleId);
      fileMap.set(key, entry);
    }
  }

  const hotspots: Hotspot[] = [];
  for (const [path, data] of fileMap) {
    hotspots.push({
      path,
      findingCount: data.findings,
      criticalCount: data.criticals,
      highCount: data.highs,
      ruleIds: [...data.rules],
    });
  }

  hotspots.sort((a, b) => b.findingCount - a.findingCount);
  return hotspots;
}

function analyzeFromFiles(files: string[]): Hotspot[] {
  const verdicts: TribunalVerdict[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      verdicts.push(JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict);
    } catch {
      /* skip invalid */
    }
  }
  return analyzeHotspots(verdicts);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingHotspot(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-hotspot — Identify areas with highest finding density

Usage:
  judges finding-hotspot --file verdict.json       Analyze single verdict
  judges finding-hotspot --files v1.json,v2.json   Analyze multiple verdicts
  judges finding-hotspot --file v.json --top 5     Show top N hotspots
  judges finding-hotspot --file v.json --critical  Show only critical hotspots

Options:
  --file <path>         Single verdict JSON file
  --files <paths>       Comma-separated verdict files
  --top <n>             Show top N hotspots (default: all)
  --critical            Only show areas with critical findings
  --format json         JSON output
  --help, -h            Show this help

Identifies rule categories and areas that consistently produce the most findings.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const topN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--top") || "0", 10);
  const criticalOnly = argv.includes("--critical");

  const singleFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const multiFiles = argv.find((_a: string, i: number) => argv[i - 1] === "--files");

  const files: string[] = [];
  if (singleFile) files.push(singleFile);
  if (multiFiles) files.push(...multiFiles.split(",").map((f) => f.trim()));

  if (files.length === 0) {
    console.error("Error: --file or --files is required.");
    process.exitCode = 1;
    return;
  }

  let hotspots = analyzeFromFiles(files);

  if (criticalOnly) {
    hotspots = hotspots.filter((h) => h.criticalCount > 0);
  }
  if (topN > 0) {
    hotspots = hotspots.slice(0, topN);
  }

  if (format === "json") {
    console.log(JSON.stringify(hotspots, null, 2));
    return;
  }

  if (hotspots.length === 0) {
    console.log("No hotspots found.");
    return;
  }

  console.log("\nFinding Hotspots:");
  console.log("─".repeat(70));
  console.log("  Category        Findings  Critical  High    Rules");
  console.log("─".repeat(70));
  for (const h of hotspots) {
    console.log(
      `  ${h.path.padEnd(16)} ${String(h.findingCount).padEnd(10)} ${String(h.criticalCount).padEnd(10)} ${String(h.highCount).padEnd(8)} ${h.ruleIds.slice(0, 3).join(", ")}${h.ruleIds.length > 3 ? ` +${h.ruleIds.length - 3}` : ""}`,
    );
  }
  console.log("─".repeat(70));
  const totalFindings = hotspots.reduce((s, h) => s + h.findingCount, 0);
  const totalCriticals = hotspots.reduce((s, h) => s + h.criticalCount, 0);
  console.log(`  Total: ${totalFindings} findings, ${totalCriticals} critical across ${hotspots.length} hotspot(s)`);
}
