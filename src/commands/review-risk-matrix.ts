import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-risk-matrix ─────────────────────────────────────────────
   Generate a risk matrix from review findings, mapping severity
   against confidence to visualize which findings need immediate
   attention vs. further investigation.
   ─────────────────────────────────────────────────────────────────── */

interface RiskEntry {
  ruleId: string;
  severity: string;
  confidence: number;
  riskLevel: string;
  quadrant: string;
}

function buildRiskMatrix(findings: Finding[]): RiskEntry[] {
  const entries: RiskEntry[] = [];

  const severityScore: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };

  for (const f of findings) {
    const sevScore = severityScore[f.severity] ?? 1;
    const conf = f.confidence ?? 0.5;

    let quadrant: string;
    let riskLevel: string;

    if (sevScore >= 4 && conf >= 0.7) {
      quadrant = "Act Now";
      riskLevel = "critical";
    } else if (sevScore >= 4 && conf < 0.7) {
      quadrant = "Investigate";
      riskLevel = "high";
    } else if (sevScore < 4 && conf >= 0.7) {
      quadrant = "Plan Fix";
      riskLevel = "medium";
    } else {
      quadrant = "Monitor";
      riskLevel = "low";
    }

    entries.push({
      ruleId: f.ruleId,
      severity: f.severity,
      confidence: conf,
      riskLevel,
      quadrant,
    });
  }

  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  entries.sort((a, b) => (order[a.riskLevel] ?? 4) - (order[b.riskLevel] ?? 4));
  return entries;
}

export function runReviewRiskMatrix(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-risk-matrix [options]

Generate a risk matrix from review findings.

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
    console.log("No findings for risk matrix.");
    return;
  }

  const entries = buildRiskMatrix(findings);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log("\n=== Risk Matrix ===\n");
  const quadrants = new Map<string, RiskEntry[]>();
  for (const e of entries) {
    const q = quadrants.get(e.quadrant);
    if (q !== undefined) {
      q.push(e);
    } else {
      quadrants.set(e.quadrant, [e]);
    }
  }

  for (const [quadrant, items] of quadrants) {
    console.log(`[${quadrant}] — ${items.length} finding(s)`);
    for (const item of items) {
      console.log(`  ${item.ruleId} (${item.severity}, ${(item.confidence * 100).toFixed(0)}% conf)`);
    }
    console.log();
  }
}
