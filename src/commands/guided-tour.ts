/**
 * Guided tour — interactive onboarding tutorial for new Judges users.
 * Step-by-step walkthrough: first evaluation, understanding output,
 * suppression/baseline workflows, building .judgesrc by example.
 *
 * All data local.
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TourStep {
  id: string;
  title: string;
  description: string;
  command?: string;
  example?: string;
  tips?: string[];
}

interface TourTrack {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
}

// ─── Tour content ───────────────────────────────────────────────────────────

const TOUR_TRACKS: TourTrack[] = [
  {
    id: "quickstart",
    name: "Quick Start",
    description: "Get your first code review in under 5 minutes",
    steps: [
      {
        id: "install",
        title: "Step 1: Installation",
        description: "Install Judges globally or as a dev dependency.",
        command: "npm install -g @kevinrabun/judges",
        example: "# Or as a dev dependency:\nnpm install --save-dev @kevinrabun/judges",
        tips: [
          "Use --save-dev for project-specific installations",
          "Global install lets you run 'judges' from anywhere",
        ],
      },
      {
        id: "first-review",
        title: "Step 2: Run Your First Review",
        description: "Point Judges at any source file to get an instant security review.",
        command: "judges review src/app.ts",
        example:
          "# Review an entire directory:\njudges review src/\n\n# Review with a specific preset:\njudges review src/ --preset strict",
        tips: [
          "Start with a single file to learn the output format",
          "Use --preset lenient for fewer false positives initially",
        ],
      },
      {
        id: "understand-output",
        title: "Step 3: Understanding the Output",
        description: "Judges outputs findings with severity, confidence, and actionable recommendations.",
        example: `Finding output explained:
─────────────────────────
  [HIGH] sql-injection-risk
    Title: Potential SQL injection in query builder
    Line: 42
    Confidence: 0.92 (high tier)
    Recommendation: Use parameterized queries instead of string concatenation

  Fields:
    severity   — critical / high / medium / low
    confidence — 0.0–1.0 score (how certain the judge is)
    ruleId     — unique identifier for the finding type
    title      — human-readable description
    recommendation — how to fix the issue`,
        tips: [
          "High confidence + high severity = fix immediately",
          "Low confidence findings may be false positives — review carefully",
        ],
      },
      {
        id: "suppress",
        title: "Step 4: Suppressing False Positives",
        description: "Mark findings as acknowledged or false positives so they don't appear again.",
        command: "judges baseline create --output .judges-baseline.json",
        example: `# Create a baseline from current findings:
judges baseline create --output .judges-baseline.json

# Run review with baseline (only new findings shown):
judges review src/ --baseline .judges-baseline.json

# Suppress a specific rule:
# Add to .judgesrc: { "disabledRules": ["rule-id-here"] }`,
        tips: [
          "Baselines capture current state — only new issues surface",
          "Commit .judges-baseline.json to share with your team",
        ],
      },
      {
        id: "configure",
        title: "Step 5: Create Your .judgesrc",
        description: "Customize Judges behavior with a configuration file.",
        example: `// .judgesrc (JSON format)
{
  "preset": "recommended",
  "minSeverity": "medium",
  "disabledRules": [],
  "disabledJudges": [],
  "ruleOverrides": {
    "some-noisy-rule": { "severity": "low" }
  }
}`,
        tips: [
          "Start with 'recommended' preset",
          "Use minSeverity to filter out low-priority findings",
          "Override specific rules without disabling them entirely",
        ],
      },
    ],
  },
  {
    id: "ci-integration",
    name: "CI/CD Integration",
    description: "Add Judges to your continuous integration pipeline",
    steps: [
      {
        id: "github-actions",
        title: "Step 1: GitHub Actions Setup",
        description: "Add Judges as a review step in your GitHub Actions workflow.",
        example: `# .github/workflows/judges.yml
name: Judges Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g @kevinrabun/judges
      - run: judges review src/ --format sarif --output results.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif`,
      },
      {
        id: "quality-gate",
        title: "Step 2: Quality Gate",
        description: "Block PRs that introduce critical or high-severity findings.",
        command: "judges gate --max-critical 0 --max-high 3",
        example:
          "# In CI:\njudges review src/ --format json | judges gate --max-critical 0 --max-high 3\n# Exit code 1 = gate failed, PR should not merge",
        tips: ["Start lenient (allow some highs) and tighten over time", "Always block on critical findings"],
      },
      {
        id: "diff-review",
        title: "Step 3: Diff-Only Review",
        description: "Review only changed files in a PR for faster feedback.",
        command: "judges diff-review --base main",
        tips: ["Diff review is much faster than full review", "Combine with baseline for minimal noise"],
      },
    ],
  },
  {
    id: "team-adoption",
    name: "Team Adoption",
    description: "Roll out Judges across your development team",
    steps: [
      {
        id: "shared-config",
        title: "Step 1: Shared Configuration",
        description: "Create a team-wide .judgesrc and commit it to your repository.",
        example: `// Recommended team .judgesrc
{
  "preset": "recommended",
  "minSeverity": "medium",
  "disabledRules": []
}`,
        tips: ["Start with recommended preset for team consensus", "Document why rules are disabled"],
      },
      {
        id: "baseline-workflow",
        title: "Step 2: Baseline Workflow",
        description: "Establish a baseline then only review new findings going forward.",
        command: "judges baseline create --output .judges-baseline.json",
        tips: ["Create baseline on main branch", "Each team member starts from the shared baseline"],
      },
      {
        id: "metrics",
        title: "Step 3: Track Metrics",
        description: "Monitor your team's security posture over time.",
        command: "judges trend --days 30",
        tips: ["Track findings-per-PR to measure improvement", "Celebrate declining finding counts"],
      },
    ],
  },
];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runGuidedTour(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges guided-tour — Interactive onboarding tutorials

Usage:
  judges guided-tour                      List available tour tracks
  judges guided-tour quickstart           Start the quick start tour
  judges guided-tour ci-integration       CI/CD integration guide
  judges guided-tour team-adoption        Team rollout guide
  judges guided-tour --init               Generate starter .judgesrc
  judges guided-tour --all                Show all tour content

Options:
  --init          Generate a starter .judgesrc file
  --all           Show all tracks at once
  --format json   JSON output
  --step <n>      Jump to specific step number
  --help, -h      Show this help

Available tracks: ${TOUR_TRACKS.map((t) => t.id).join(", ")}
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Generate starter config
  if (argv.includes("--init")) {
    const rcPath = join(".", ".judgesrc");
    if (existsSync(rcPath)) {
      console.log("  .judgesrc already exists — skipping");
      return;
    }
    const config = {
      preset: "recommended",
      minSeverity: "medium",
      disabledRules: [],
      disabledJudges: [],
      ruleOverrides: {},
    };
    writeFileSync(rcPath, JSON.stringify(config, null, 2) + "\n");
    console.log("  ✅ Created .judgesrc with recommended defaults");
    return;
  }

  const trackId = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--"));
  const stepNum = argv.find((_a: string, i: number) => argv[i - 1] === "--step");
  const showAll = argv.includes("--all");

  if (format === "json") {
    const data = trackId
      ? TOUR_TRACKS.find((t) => t.id === trackId) || TOUR_TRACKS
      : showAll
        ? TOUR_TRACKS
        : TOUR_TRACKS.map(({ steps: _s, ...rest }) => rest);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // List tracks
  if (!trackId && !showAll) {
    console.log(`\n  📚 Judges Guided Tour\n  ──────────────────────────`);
    for (const track of TOUR_TRACKS) {
      console.log(`\n    ${track.name} (${track.id})`);
      console.log(`      ${track.description}`);
      console.log(`      Steps: ${track.steps.length}`);
      console.log(`      Run: judges guided-tour ${track.id}`);
    }
    console.log(`\n    💡 Quick setup: judges guided-tour --init\n`);
    return;
  }

  // Show track(s)
  const tracks = showAll ? TOUR_TRACKS : [TOUR_TRACKS.find((t) => t.id === trackId)!];
  if (!tracks[0]) {
    console.error(`  Unknown track: ${trackId}\n  Available: ${TOUR_TRACKS.map((t) => t.id).join(", ")}`);
    return;
  }

  for (const track of tracks) {
    console.log(`\n  ═══════════════════════════════════════`);
    console.log(`  📚 ${track.name}`);
    console.log(`  ${track.description}`);
    console.log(`  ═══════════════════════════════════════`);

    const steps = stepNum ? [track.steps[parseInt(stepNum) - 1]].filter(Boolean) : track.steps;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const num = stepNum ? parseInt(stepNum) : i + 1;
      console.log(`\n  ─── ${num}/${track.steps.length} ──────────────────────────`);
      console.log(`  ${step.title}`);
      console.log(`  ${step.description}`);

      if (step.command) {
        console.log(`\n    $ ${step.command}`);
      }

      if (step.example) {
        console.log(
          `\n${step.example
            .split("\n")
            .map((l) => "    " + l)
            .join("\n")}`,
        );
      }

      if (step.tips && step.tips.length > 0) {
        console.log("");
        for (const tip of step.tips) {
          console.log(`    💡 ${tip}`);
        }
      }
    }
    console.log("");
  }

  // Generate .judgesrc directory for tour progress
  const tourDir = join(".", ".judges-tour");
  if (!existsSync(tourDir)) mkdirSync(tourDir, { recursive: true });
}
