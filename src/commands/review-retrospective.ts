import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-retrospective ───────────────────────────────────────────
   Generate review retrospective summaries: what went well, what
   needs improvement, action items. Uses local history to surface
   patterns and trends without external data.
   ─────────────────────────────────────────────────────────────────── */

interface RetroSection {
  category: string;
  items: string[];
}

interface Retrospective {
  period: string;
  reviewCount: number;
  sections: RetroSection[];
}

function generateRetro(historyDir: string): Retrospective {
  const empty: Retrospective = {
    period: "No data",
    reviewCount: 0,
    sections: [],
  };

  if (!existsSync(historyDir)) return empty;

  const files = (readdirSync(historyDir) as unknown as string[])
    .filter((f) => typeof f === "string" && f.endsWith(".json"))
    .sort();

  if (files.length === 0) return empty;

  const verdicts: TribunalVerdict[] = [];
  for (const file of files) {
    try {
      verdicts.push(JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict);
    } catch {
      // Skip
    }
  }

  if (verdicts.length === 0) return empty;

  const scores = verdicts.map((v) => v.overallScore ?? 0);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passes = verdicts.filter((v) => v.overallVerdict === "pass").length;
  const passRate = Math.round((passes / verdicts.length) * 100);

  // Score trend
  const mid = Math.floor(scores.length / 2) || 1;
  const firstAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
  const improving = secondAvg >= firstAvg;

  // Most common rules
  const ruleFreq = new Map<string, number>();
  for (const v of verdicts) {
    for (const f of v.findings ?? []) {
      ruleFreq.set(f.ruleId, (ruleFreq.get(f.ruleId) ?? 0) + 1);
    }
  }
  const topRules = [...ruleFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Build sections
  const wentWell: string[] = [];
  const needsImprovement: string[] = [];
  const actionItems: string[] = [];

  if (passRate >= 80) wentWell.push(`High pass rate: ${passRate}%`);
  else needsImprovement.push(`Pass rate below threshold: ${passRate}%`);

  if (improving) wentWell.push(`Scores trending upward (${Math.round(firstAvg)} → ${Math.round(secondAvg)})`);
  else needsImprovement.push(`Scores trending downward (${Math.round(firstAvg)} → ${Math.round(secondAvg)})`);

  if (avgScore >= 70) wentWell.push(`Good average score: ${avgScore}/100`);
  else needsImprovement.push(`Average score needs work: ${avgScore}/100`);

  if (topRules.length > 0) {
    needsImprovement.push(`Most recurring rules: ${topRules.map(([r, c]) => `${r} (${c}x)`).join(", ")}`);
    actionItems.push(`Address top recurring rule: ${topRules[0][0]}`);
  }

  if (!improving) actionItems.push("Investigate declining score trend");
  if (passRate < 80) actionItems.push("Focus on reducing critical/high findings to improve pass rate");
  actionItems.push("Review and update severity thresholds if too noisy");

  const sections: RetroSection[] = [
    { category: "What Went Well", items: wentWell },
    { category: "Needs Improvement", items: needsImprovement },
    { category: "Action Items", items: actionItems },
  ];

  const firstDate = verdicts[0].timestamp ?? "unknown";
  const lastDate = verdicts[verdicts.length - 1].timestamp ?? "unknown";

  return {
    period: `${firstDate.slice(0, 10)} to ${lastDate.slice(0, 10)}`,
    reviewCount: verdicts.length,
    sections,
  };
}

export function runReviewRetrospective(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-retrospective [options]

Generate review retrospective summary.

Options:
  --history <path>     Path to review history directory
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

  const retro = generateRetro(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(retro, null, 2));
    return;
  }

  console.log(`\n=== Review Retrospective ===`);
  console.log(`  Period: ${retro.period}`);
  console.log(`  Reviews: ${retro.reviewCount}\n`);

  for (const section of retro.sections) {
    console.log(`  ${section.category}:`);
    if (section.items.length === 0) {
      console.log("    (none)");
    }
    for (const item of section.items) {
      console.log(`    • ${item}`);
    }
    console.log();
  }
}
