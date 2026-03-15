import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-sprint-plan ─────────────────────────────────────────────
   Organize findings into sprint-sized work batches based on
   severity and estimated effort. Helps teams plan remediation
   work across sprints.
   ─────────────────────────────────────────────────────────────────── */

interface SprintItem {
  ruleId: string;
  title: string;
  severity: string;
  effort: number;
}

interface Sprint {
  sprint: number;
  items: SprintItem[];
  totalEffort: number;
}

const EFFORT_POINTS: Record<string, number> = {
  critical: 8,
  high: 5,
  medium: 3,
  low: 1,
  info: 1,
};

function planSprints(findings: Finding[], capacity: number): Sprint[] {
  // Sort by severity priority
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sorted = [...findings].sort((a, b) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));

  const sprints: Sprint[] = [];
  let currentSprint: Sprint = { sprint: 1, items: [], totalEffort: 0 };

  for (const f of sorted) {
    const effort = EFFORT_POINTS[f.severity] ?? 1;

    if (currentSprint.totalEffort + effort > capacity && currentSprint.items.length > 0) {
      sprints.push(currentSprint);
      currentSprint = { sprint: sprints.length + 1, items: [], totalEffort: 0 };
    }

    currentSprint.items.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      effort,
    });
    currentSprint.totalEffort += effort;
  }

  if (currentSprint.items.length > 0) {
    sprints.push(currentSprint);
  }

  return sprints;
}

export function runReviewSprintPlan(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-sprint-plan [options]

Plan findings remediation across sprints.

Options:
  --report <path>      Path to verdict JSON file
  --capacity <n>       Sprint capacity in effort points (default: 20)
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

  const capIdx = argv.indexOf("--capacity");
  const capacity = capIdx !== -1 && argv[capIdx + 1] ? parseInt(argv[capIdx + 1], 10) : 20;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to plan.");
    return;
  }

  const sprints = planSprints(findings, capacity);

  if (format === "json") {
    console.log(JSON.stringify(sprints, null, 2));
    return;
  }

  console.log(`\n=== Sprint Plan (${sprints.length} sprints, capacity: ${capacity}pts) ===\n`);
  for (const s of sprints) {
    console.log(`Sprint ${s.sprint} (${s.totalEffort}/${capacity} pts):`);
    for (const item of s.items) {
      console.log(`  [${item.severity.toUpperCase()}] ${item.ruleId}: ${item.title} (${item.effort}pts)`);
    }
    console.log();
  }
}
