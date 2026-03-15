/**
 * Review-rollout-plan — Generate a phased rollout plan for Judges adoption.
 */

import { writeFileSync } from "fs";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RolloutPhase {
  phase: number;
  name: string;
  duration: string;
  judges: string[];
  goals: string[];
  successCriteria: string[];
}

interface RolloutPlan {
  teamSize: number;
  phases: RolloutPhase[];
  generatedAt: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRolloutPlan(argv: string[]): void {
  const teamIdx = argv.indexOf("--team-size");
  const outIdx = argv.indexOf("--out");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const teamSize = teamIdx >= 0 ? parseInt(argv[teamIdx + 1], 10) : 5;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-rollout-plan — Generate a phased rollout plan

Usage:
  judges review-rollout-plan [--team-size <n>] [--out <path>]
                             [--format table|json]

Options:
  --team-size <n>  Team size for rollout planning (default: 5)
  --out <path>     Save plan to file
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  const allJudges = defaultRegistry.getJudges();
  const securityJudges = allJudges.filter((j) => j.domain === "security").map((j) => j.id);
  const qualityJudges = allJudges
    .filter((j) => j.domain === "quality" || j.domain === "best-practices")
    .map((j) => j.id);
  const otherJudges = allJudges
    .filter((j) => j.domain !== "security" && j.domain !== "quality" && j.domain !== "best-practices")
    .map((j) => j.id);

  const phases: RolloutPhase[] = [
    {
      phase: 1,
      name: "Pilot",
      duration: "1-2 weeks",
      judges: securityJudges.slice(0, 3),
      goals: [
        `Onboard ${Math.max(1, Math.floor(teamSize * 0.2))} pilot users`,
        "Run security judges on non-critical repos",
        "Collect feedback on finding quality",
      ],
      successCriteria: ["Pilot users complete 5+ reviews", "False positive rate < 15%", "Positive user feedback"],
    },
    {
      phase: 2,
      name: "Expand Security",
      duration: "2-3 weeks",
      judges: securityJudges,
      goals: [
        `Expand to ${Math.max(2, Math.floor(teamSize * 0.5))} users`,
        "Enable all security judges",
        "Integrate into CI pipeline",
      ],
      successCriteria: ["CI integration operational", "Review turnaround < 5 min", "Team adoption > 50%"],
    },
    {
      phase: 3,
      name: "Full Judge Suite",
      duration: "2-4 weeks",
      judges: [...securityJudges, ...qualityJudges.slice(0, 5)],
      goals: [
        `Expand to full team (${teamSize} users)`,
        "Enable quality and best-practice judges",
        "Establish baseline metrics",
      ],
      successCriteria: ["100% team adoption", "Baseline established", "Documented processes"],
    },
    {
      phase: 4,
      name: "Optimization",
      duration: "Ongoing",
      judges: [...securityJudges, ...qualityJudges, ...otherJudges],
      goals: [
        "Enable full judge suite",
        "Tune thresholds based on team feedback",
        "Automate fix application where safe",
      ],
      successCriteria: [
        "Finding resolution rate > 80%",
        "Average review score > 7/10",
        "Continuous improvement cycle active",
      ],
    },
  ];

  const plan: RolloutPlan = {
    teamSize,
    phases,
    generatedAt: new Date().toISOString().split("T")[0],
  };

  // Save if requested
  if (outIdx >= 0) {
    const outPath = argv[outIdx + 1];
    writeFileSync(outPath, JSON.stringify(plan, null, 2));
    console.log(`Rollout plan saved to: ${outPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(`\nRollout Plan (team size: ${teamSize})`);
  console.log("═".repeat(65));

  for (const p of phases) {
    console.log(`\n  Phase ${p.phase}: ${p.name} (${p.duration})`);
    console.log("  " + "─".repeat(55));
    console.log(
      `  Judges: ${p.judges.slice(0, 5).join(", ")}${p.judges.length > 5 ? ` (+${p.judges.length - 5} more)` : ""}`,
    );
    console.log("  Goals:");
    for (const g of p.goals) {
      console.log(`    • ${g}`);
    }
    console.log("  Success Criteria:");
    for (const s of p.successCriteria) {
      console.log(`    ✓ ${s}`);
    }
  }

  console.log("\n═".repeat(65));
}
