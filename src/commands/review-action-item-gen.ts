import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-action-item-gen ─────────────────────────────────────────
   Generate actionable to-do items from findings, formatted for
   direct use in task trackers or checklists.
   ─────────────────────────────────────────────────────────────────── */

interface ActionItem {
  id: number;
  ruleId: string;
  title: string;
  severity: string;
  action: string;
  status: string;
}

function generateActionItems(findings: Finding[]): ActionItem[] {
  const items: ActionItem[] = [];

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    items.push({
      id: i + 1,
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      action: f.recommendation,
      status: "open",
    });
  }

  // Sort by severity priority
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  items.sort((a, b) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));

  // Re-number after sort
  for (let i = 0; i < items.length; i++) {
    items[i].id = i + 1;
  }

  return items;
}

export function runReviewActionItemGen(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-action-item-gen [options]

Generate action items from findings.

Options:
  --report <path>      Path to verdict JSON file
  --format <fmt>       Output format: table (default), json, or markdown
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

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings — no action items needed.");
    return;
  }

  const items = generateActionItems(findings);

  if (format === "json") {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (format === "markdown") {
    console.log("# Action Items\n");
    for (const item of items) {
      console.log(`- [ ] **${item.ruleId}** (${item.severity}): ${item.title}`);
      console.log(`  - ${item.action}`);
    }
    return;
  }

  console.log(`\n=== Action Items (${items.length}) ===\n`);
  for (const item of items) {
    console.log(`#${item.id} [${item.severity.toUpperCase()}] ${item.ruleId}: ${item.title}`);
    console.log(`   Action: ${item.action}`);
    console.log();
  }
}
