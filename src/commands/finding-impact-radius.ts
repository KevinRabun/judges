import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-impact-radius ──────────────────────────────────────────
   Measure the blast radius of findings — how many related areas
   of the codebase might be affected by each finding, helping
   prioritize fixes with the widest positive impact.
   ─────────────────────────────────────────────────────────────────── */

interface ImpactEntry {
  ruleId: string;
  severity: string;
  title: string;
  impactRadius: string;
  affectedAreas: string[];
  fixPriority: number;
}

function measureImpact(findings: Finding[]): ImpactEntry[] {
  const entries: ImpactEntry[] = [];
  const ruleOccurrences = new Map<string, number>();

  for (const f of findings) {
    ruleOccurrences.set(f.ruleId, (ruleOccurrences.get(f.ruleId) ?? 0) + 1);
  }

  for (const f of findings) {
    const occurrences = ruleOccurrences.get(f.ruleId) ?? 1;
    const affectedAreas: string[] = [];

    if (f.ruleId.startsWith("SEC") || f.ruleId.startsWith("INJ") || f.ruleId.startsWith("AUTH")) {
      affectedAreas.push("Security posture");
      affectedAreas.push("Compliance");
    }
    if (f.severity === "critical" || f.severity === "high") {
      affectedAreas.push("Production stability");
    }
    if (occurrences > 2) {
      affectedAreas.push("Code patterns");
    }
    if (f.lineNumbers !== undefined && f.lineNumbers.length > 3) {
      affectedAreas.push("Multiple code locations");
    }
    if (affectedAreas.length === 0) {
      affectedAreas.push("Local scope");
    }

    let impactRadius: string;
    let fixPriority: number;

    if (affectedAreas.length >= 3) {
      impactRadius = "wide";
      fixPriority = 1;
    } else if (affectedAreas.length >= 2) {
      impactRadius = "moderate";
      fixPriority = 2;
    } else {
      impactRadius = "narrow";
      fixPriority = 3;
    }

    entries.push({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      impactRadius,
      affectedAreas,
      fixPriority,
    });
  }

  entries.sort((a, b) => a.fixPriority - b.fixPriority);
  return entries;
}

export function runFindingImpactRadius(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-impact-radius [options]

Measure blast radius of findings.

Options:
  --report <path>    Path to verdict JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to analyze.");
    return;
  }

  const entries = measureImpact(findings);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log("\n=== Finding Impact Radius ===\n");
  for (const e of entries) {
    console.log(`[P${e.fixPriority}] ${e.ruleId} (${e.severity}) — ${e.impactRadius} impact`);
    console.log(`  ${e.title}`);
    console.log(`  Affected: ${e.affectedAreas.join(", ")}`);
    console.log();
  }
}
