/**
 * Review-quickstart — Interactive quickstart guide for new users.
 */

import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { defaultRegistry } from "../judge-registry.js";

// ─── Steps ──────────────────────────────────────────────────────────────────

interface QuickstartStep {
  number: number;
  title: string;
  description: string;
  status: "done" | "pending" | "skipped";
}

function buildSteps(projectDir: string): QuickstartStep[] {
  const configPath = join(projectDir, ".judgesrc");
  const hasConfig = existsSync(configPath);
  const judges = defaultRegistry.getJudges();

  return [
    {
      number: 1,
      title: "Install Judges",
      description: "npm install -g @kevinrabun/judges",
      status: "done",
    },
    {
      number: 2,
      title: "Create Configuration",
      description: `Create .judgesrc in your project root (${judges.length} judges available)`,
      status: hasConfig ? "done" : "pending",
    },
    {
      number: 3,
      title: "Run First Review",
      description: "judges review <file> — run your first code review",
      status: "pending",
    },
    {
      number: 4,
      title: "Explore Judges",
      description: `judges list — browse ${judges.length} available judges across domains`,
      status: "pending",
    },
    {
      number: 5,
      title: "Configure Severity",
      description: "Set minSeverity in .judgesrc to filter noise (critical, high, medium, low, info)",
      status: "pending",
    },
    {
      number: 6,
      title: "Add CI Integration",
      description: "judges review-ci-gate — integrate into your CI/CD pipeline",
      status: "pending",
    },
    {
      number: 7,
      title: "Enable IDE Support",
      description: "Install Judges Panel for VS Code or configure JetBrains plugin",
      status: "pending",
    },
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewQuickstart(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const initFlag = argv.includes("--init");
  const projectDir = dirIdx >= 0 ? argv[dirIdx + 1] : process.cwd();
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-quickstart — Interactive quickstart guide

Usage:
  judges review-quickstart [--dir <path>] [--init] [--format table|json]

Options:
  --dir <path>     Project directory (default: cwd)
  --init           Generate default .judgesrc config
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (initFlag) {
    const configPath = join(projectDir, ".judgesrc");
    if (existsSync(configPath)) {
      console.log(`Config already exists: ${configPath}`);
      return;
    }
    const defaultConfig = {
      preset: "default",
      minSeverity: "medium",
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created default config: ${configPath}`);
    return;
  }

  const steps = buildSteps(projectDir);

  if (format === "json") {
    console.log(JSON.stringify(steps, null, 2));
    return;
  }

  const completed = steps.filter((s) => s.status === "done").length;
  console.log(`\nQuickstart Progress: ${completed}/${steps.length} steps completed`);
  console.log("═".repeat(65));
  for (const step of steps) {
    const icon = step.status === "done" ? "[✓]" : step.status === "skipped" ? "[-]" : "[ ]";
    console.log(`  ${icon} Step ${step.number}: ${step.title}`);
    console.log(`      ${step.description}`);
  }
  console.log("═".repeat(65));
  console.log(`\nRun with --init to generate a default .judgesrc config.`);
}
