import { readFileSync, existsSync } from "fs";
import { join } from "path";

/* ── review-team-rotation ───────────────────────────────────────────
   Manage reviewer rotation schedules. Reads a local rotation config
   and determines who should review next based on the schedule.
   All data stays on the user's machine.
   ─────────────────────────────────────────────────────────────────── */

interface RotationMember {
  name: string;
  lastReviewDate: string;
  reviewCount: number;
  available: boolean;
}

interface RotationConfig {
  members: RotationMember[];
  strategy: "round-robin" | "least-recent" | "least-loaded";
}

const DEFAULT_CONFIG: RotationConfig = {
  members: [],
  strategy: "round-robin",
};

function loadConfig(configPath: string): RotationConfig {
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf-8")) as RotationConfig;
    } catch {
      console.log("Warning: could not parse rotation config, using defaults");
    }
  }
  return DEFAULT_CONFIG;
}

function selectNext(config: RotationConfig): RotationMember | undefined {
  const available = config.members.filter((m) => m.available);
  if (available.length === 0) return undefined;

  switch (config.strategy) {
    case "least-recent": {
      const sorted = [...available].sort((a, b) => {
        if (!a.lastReviewDate) return -1;
        if (!b.lastReviewDate) return 1;
        return a.lastReviewDate.localeCompare(b.lastReviewDate);
      });
      return sorted[0];
    }
    case "least-loaded": {
      const sorted = [...available].sort((a, b) => a.reviewCount - b.reviewCount);
      return sorted[0];
    }
    case "round-robin":
    default: {
      const sorted = [...available].sort((a, b) => {
        if (!a.lastReviewDate) return -1;
        if (!b.lastReviewDate) return 1;
        return a.lastReviewDate.localeCompare(b.lastReviewDate);
      });
      return sorted[0];
    }
  }
}

export function runReviewTeamRotation(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-team-rotation [options]

Manage reviewer rotation schedules.

Options:
  --config <path>      Path to rotation config JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message

Config file format:
{
  "strategy": "round-robin" | "least-recent" | "least-loaded",
  "members": [
    { "name": "Alice", "lastReviewDate": "2025-01-01", "reviewCount": 5, "available": true }
  ]
}`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const configIdx = argv.indexOf("--config");
  const configPath =
    configIdx !== -1 && argv[configIdx + 1]
      ? join(process.cwd(), argv[configIdx + 1])
      : join(process.cwd(), ".judges", "rotation.json");

  const config = loadConfig(configPath);

  if (config.members.length === 0) {
    console.log("No team members configured. Create a rotation config at .judges/rotation.json");
    return;
  }

  const next = selectNext(config);

  if (format === "json") {
    console.log(
      JSON.stringify({ strategy: config.strategy, nextReviewer: next?.name ?? null, members: config.members }, null, 2),
    );
    return;
  }

  console.log(`\n=== Team Rotation (strategy: ${config.strategy}) ===\n`);

  console.log("  " + "Name".padEnd(20) + "Reviews".padEnd(10) + "Last Review".padEnd(14) + "Available");
  console.log("  " + "-".repeat(55));

  for (const m of config.members) {
    const avail = m.available ? "Yes" : "No";
    console.log(
      "  " + m.name.padEnd(20) + String(m.reviewCount).padEnd(10) + (m.lastReviewDate || "never").padEnd(14) + avail,
    );
  }

  if (next) {
    console.log(`\n  → Next reviewer: ${next.name}`);
  } else {
    console.log("\n  No available reviewers.");
  }
}
