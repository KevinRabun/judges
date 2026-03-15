import { readFileSync, existsSync } from "fs";
import { join } from "path";

/* ── review-workload-balance ────────────────────────────────────────
   Balance review workload across team members by analyzing assignment
   counts, finding volumes, and review frequency. All data is read
   from local config — no external data processing.
   ─────────────────────────────────────────────────────────────────── */

interface ReviewerLoad {
  reviewer: string;
  assignedReviews: number;
  findingsHandled: number;
  lastActive: string;
  loadScore: number;
  recommendation: string;
}

interface TeamConfig {
  reviewers: Array<{
    name: string;
    assignedReviews?: number;
    findingsHandled?: number;
    lastActive?: string;
    capacity?: number;
  }>;
}

function computeWorkload(config: TeamConfig): ReviewerLoad[] {
  const loads: ReviewerLoad[] = [];

  for (const reviewer of config.reviewers) {
    const assigned = reviewer.assignedReviews ?? 0;
    const findings = reviewer.findingsHandled ?? 0;
    const capacity = reviewer.capacity ?? 10;
    const loadScore = capacity > 0 ? assigned / capacity : 1;

    let recommendation: string;
    if (loadScore > 0.9) {
      recommendation = "Overloaded — reassign pending reviews";
    } else if (loadScore > 0.7) {
      recommendation = "Heavy load — limit new assignments";
    } else if (loadScore < 0.3) {
      recommendation = "Available — can take more reviews";
    } else {
      recommendation = "Balanced";
    }

    loads.push({
      reviewer: reviewer.name,
      assignedReviews: assigned,
      findingsHandled: findings,
      lastActive: reviewer.lastActive ?? "unknown",
      loadScore,
      recommendation,
    });
  }

  loads.sort((a, b) => a.loadScore - b.loadScore);
  return loads;
}

export function runReviewWorkloadBalance(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-workload-balance [options]

Analyze and balance reviewer workload across team members.

Options:
  --config <path>    Path to team config JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const configIdx = argv.indexOf("--config");
  const configPath =
    configIdx !== -1 && argv[configIdx + 1]
      ? join(process.cwd(), argv[configIdx + 1])
      : join(process.cwd(), ".judges", "team-workload.json");

  if (!existsSync(configPath)) {
    console.log(`No team config found at: ${configPath}`);
    console.log("Create .judges/team-workload.json with reviewer data.");
    console.log("\nExample:");
    console.log(
      JSON.stringify(
        {
          reviewers: [
            { name: "alice", assignedReviews: 5, findingsHandled: 23, capacity: 10, lastActive: "2026-03-14" },
            { name: "bob", assignedReviews: 2, findingsHandled: 8, capacity: 8, lastActive: "2026-03-13" },
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8")) as TeamConfig;

  if (!config.reviewers || config.reviewers.length === 0) {
    console.log("No reviewers defined in config.");
    return;
  }

  const loads = computeWorkload(config);

  if (format === "json") {
    console.log(JSON.stringify(loads, null, 2));
    return;
  }

  console.log("\n=== Review Workload Balance ===\n");
  console.log(`Team size: ${loads.length}\n`);

  for (const load of loads) {
    const bar = "█".repeat(Math.round(load.loadScore * 10)) + "░".repeat(10 - Math.round(load.loadScore * 10));
    console.log(`${load.reviewer}`);
    console.log(`  Load: [${bar}] ${(load.loadScore * 100).toFixed(0)}%`);
    console.log(`  Reviews: ${load.assignedReviews} | Findings: ${load.findingsHandled}`);
    console.log(`  Last active: ${load.lastActive}`);
    console.log(`  → ${load.recommendation}`);
    console.log();
  }
}
