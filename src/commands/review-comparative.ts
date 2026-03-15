/**
 * Review-comparative — Compare two verdict reports side by side.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComparisonResult {
  metric: string;
  before: string | number;
  after: string | number;
  change: string;
}

interface DiffFinding {
  ruleId: string;
  title: string;
  status: "added" | "removed" | "unchanged";
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function compareVerdicts(
  before: TribunalVerdict,
  after: TribunalVerdict,
): { metrics: ComparisonResult[]; findings: DiffFinding[] } {
  const metrics: ComparisonResult[] = [];

  // overall verdict
  metrics.push({
    metric: "Overall Verdict",
    before: before.overallVerdict,
    after: after.overallVerdict,
    change: before.overallVerdict === after.overallVerdict ? "unchanged" : "changed",
  });

  // score
  const scoreDiff = after.overallScore - before.overallScore;
  metrics.push({
    metric: "Score",
    before: before.overallScore,
    after: after.overallScore,
    change: scoreDiff > 0 ? `+${scoreDiff}` : String(scoreDiff),
  });

  // finding counts
  metrics.push({
    metric: "Total Findings",
    before: before.findings.length,
    after: after.findings.length,
    change: String(after.findings.length - before.findings.length),
  });

  metrics.push({
    metric: "Critical",
    before: before.criticalCount,
    after: after.criticalCount,
    change: String(after.criticalCount - before.criticalCount),
  });

  metrics.push({
    metric: "High",
    before: before.highCount,
    after: after.highCount,
    change: String(after.highCount - before.highCount),
  });

  // finding diff
  const beforeRules = new Set(before.findings.map((f) => f.ruleId));
  const afterRules = new Set(after.findings.map((f) => f.ruleId));
  const findings: DiffFinding[] = [];

  for (const f of after.findings) {
    if (!beforeRules.has(f.ruleId)) {
      findings.push({ ruleId: f.ruleId, title: f.title, status: "added" });
    }
  }
  for (const f of before.findings) {
    if (!afterRules.has(f.ruleId)) {
      findings.push({ ruleId: f.ruleId, title: f.title, status: "removed" });
    }
  }
  for (const f of after.findings) {
    if (beforeRules.has(f.ruleId)) {
      findings.push({ ruleId: f.ruleId, title: f.title, status: "unchanged" });
    }
  }

  return { metrics, findings };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewComparative(argv: string[]): void {
  const beforeIdx = argv.indexOf("--before");
  const afterIdx = argv.indexOf("--after");
  const formatIdx = argv.indexOf("--format");
  const beforePath = beforeIdx >= 0 ? argv[beforeIdx + 1] : undefined;
  const afterPath = afterIdx >= 0 ? argv[afterIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-comparative — Compare two verdict reports

Usage:
  judges review-comparative --before <old.json> --after <new.json>
                            [--format table|json]

Options:
  --before <path>    Path to baseline verdict JSON (required)
  --after <path>     Path to new verdict JSON (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!beforePath || !afterPath) {
    console.error("Error: --before and --after required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(beforePath)) {
    console.error(`Error: not found: ${beforePath}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(afterPath)) {
    console.error(`Error: not found: ${afterPath}`);
    process.exitCode = 1;
    return;
  }

  let before: TribunalVerdict;
  let after: TribunalVerdict;
  try {
    before = JSON.parse(readFileSync(beforePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON in before file");
    process.exitCode = 1;
    return;
  }
  try {
    after = JSON.parse(readFileSync(afterPath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON in after file");
    process.exitCode = 1;
    return;
  }

  const result = compareVerdicts(before, after);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nComparative Review`);
  console.log("═".repeat(65));
  console.log(`${"Metric".padEnd(20)} ${"Before".padEnd(15)} ${"After".padEnd(15)} Change`);
  console.log("─".repeat(65));

  for (const m of result.metrics) {
    console.log(`${m.metric.padEnd(20)} ${String(m.before).padEnd(15)} ${String(m.after).padEnd(15)} ${m.change}`);
  }

  const added = result.findings.filter((f) => f.status === "added");
  const removed = result.findings.filter((f) => f.status === "removed");

  if (added.length > 0) {
    console.log(`\n  New findings (+${added.length}):`);
    for (const f of added) {
      const title = f.title.length > 40 ? f.title.slice(0, 40) + "…" : f.title;
      console.log(`    + ${f.ruleId.padEnd(18)} ${title}`);
    }
  }

  if (removed.length > 0) {
    console.log(`\n  Resolved findings (-${removed.length}):`);
    for (const f of removed) {
      const title = f.title.length > 40 ? f.title.slice(0, 40) + "…" : f.title;
      console.log(`    - ${f.ruleId.padEnd(18)} ${title}`);
    }
  }

  console.log("═".repeat(65));
}
