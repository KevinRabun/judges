/**
 * Finding-hotspot-map — Identify code hotspots with the most findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Hotspot {
  lineRange: string;
  findingCount: number;
  severities: Record<string, number>;
  ruleIds: string[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function findHotspots(verdict: TribunalVerdict, bucketSize: number): Hotspot[] {
  const buckets = new Map<number, { findings: typeof verdict.findings }>();

  for (const f of verdict.findings) {
    const lines = f.lineNumbers || [];
    if (lines.length === 0) continue;

    const bucket = Math.floor(lines[0] / bucketSize) * bucketSize;
    const existing = buckets.get(bucket);
    if (existing) {
      existing.findings.push(f);
    } else {
      buckets.set(bucket, { findings: [f] });
    }
  }

  return [...buckets.entries()]
    .map(([start, data]) => {
      const severities: Record<string, number> = {};
      const ruleIds: string[] = [];

      for (const f of data.findings) {
        const sev = (f.severity || "medium").toLowerCase();
        severities[sev] = (severities[sev] || 0) + 1;
        if (!ruleIds.includes(f.ruleId)) {
          ruleIds.push(f.ruleId);
        }
      }

      return {
        lineRange: `${start + 1}-${start + bucketSize}`,
        findingCount: data.findings.length,
        severities,
        ruleIds,
      };
    })
    .sort((a, b) => b.findingCount - a.findingCount);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingHotspotMap(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const bucketIdx = argv.indexOf("--bucket");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const bucketSize = bucketIdx >= 0 ? parseInt(argv[bucketIdx + 1], 10) : 20;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-hotspot-map — Identify code hotspots

Usage:
  judges finding-hotspot-map --file <verdict.json> [--bucket <size>]
                             [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --bucket <size>    Line bucket size (default: 20)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
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

  const hotspots = findHotspots(verdict, bucketSize);

  if (format === "json") {
    console.log(JSON.stringify(hotspots, null, 2));
    return;
  }

  console.log(`\nCode Hotspot Map (bucket size: ${bucketSize} lines)`);
  console.log("═".repeat(70));
  console.log(`${"Line Range".padEnd(14)} ${"Findings".padEnd(10)} ${"Severities".padEnd(25)} Rules`);
  console.log("─".repeat(70));

  for (const h of hotspots.slice(0, 15)) {
    const sevStr = Object.entries(h.severities)
      .map(([s, c]) => `${s}:${c}`)
      .join(", ");
    const sevDisplay = sevStr.length > 23 ? sevStr.slice(0, 23) + "…" : sevStr;
    const ruleStr = h.ruleIds.slice(0, 3).join(", ");
    const ruleDisplay = ruleStr.length > 20 ? ruleStr.slice(0, 20) + "…" : ruleStr;
    console.log(
      `${h.lineRange.padEnd(14)} ${String(h.findingCount).padEnd(10)} ${sevDisplay.padEnd(25)} ${ruleDisplay}`,
    );
  }

  if (hotspots.length > 15) {
    console.log(`  ... +${hotspots.length - 15} more hotspots`);
  }
  console.log("═".repeat(70));
}
