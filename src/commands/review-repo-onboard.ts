/**
 * Review-repo-onboard — Onboard a repository to Judges code review.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRepoOnboard(argv: string[]): void {
  const repoIdx = argv.indexOf("--repo");
  const presetIdx = argv.indexOf("--preset");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const repo = repoIdx >= 0 ? argv[repoIdx + 1] : ".";
  const preset = presetIdx >= 0 ? argv[presetIdx + 1] : "default";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-repo-onboard — Onboard a repository to Judges

Usage:
  judges review-repo-onboard [--repo <path>] [--preset <name>]
                              [--format table|json]

Options:
  --repo <path>     Repository path (default: current directory)
  --preset <name>   Config preset: default, strict, security-only (default: default)
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help

Creates:
  .judgesrc                  Config file
  .judges-baseline.json      Empty baseline
  .judges/                   Data directory
  .github/workflows/judges.yml  CI integration (if .github exists)
`);
    return;
  }

  const steps: { name: string; status: "created" | "skipped" | "error"; detail: string }[] = [];

  // 1. Config file
  const rcPath = join(repo, ".judgesrc");
  if (!existsSync(rcPath)) {
    const config = {
      preset,
      disabledJudges: [] as string[],
      disabledRules: [] as string[],
      ruleOverrides: {},
      minSeverity: preset === "strict" ? "info" : "low",
    };
    writeFileSync(rcPath, JSON.stringify(config, null, 2));
    steps.push({ name: ".judgesrc", status: "created", detail: `preset: ${preset}` });
  } else {
    steps.push({ name: ".judgesrc", status: "skipped", detail: "already exists" });
  }

  // 2. Baseline
  const baselinePath = join(repo, ".judges-baseline.json");
  if (!existsSync(baselinePath)) {
    writeFileSync(baselinePath, JSON.stringify({ version: 1, findings: [] }, null, 2));
    steps.push({ name: ".judges-baseline.json", status: "created", detail: "empty baseline" });
  } else {
    steps.push({ name: ".judges-baseline.json", status: "skipped", detail: "already exists" });
  }

  // 3. Data directory
  const judgesDir = join(repo, ".judges");
  if (!existsSync(judgesDir)) {
    mkdirSync(judgesDir, { recursive: true });
    steps.push({ name: ".judges/", status: "created", detail: "data directory" });
  } else {
    steps.push({ name: ".judges/", status: "skipped", detail: "already exists" });
  }

  // 4. CI workflow (only if .github exists)
  const ghDir = join(repo, ".github", "workflows");
  if (existsSync(join(repo, ".github"))) {
    const workflowPath = join(ghDir, "judges.yml");
    if (!existsSync(workflowPath)) {
      if (!existsSync(ghDir)) {
        mkdirSync(ghDir, { recursive: true });
      }
      const workflow = `name: Judges Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @kevinrabun/judges-cli eval --format sarif --fail-on-findings
`;
      writeFileSync(workflowPath, workflow);
      steps.push({ name: ".github/workflows/judges.yml", status: "created", detail: "CI workflow" });
    } else {
      steps.push({ name: ".github/workflows/judges.yml", status: "skipped", detail: "already exists" });
    }
  }

  if (format === "json") {
    console.log(JSON.stringify({ repo, preset, steps }, null, 2));
    return;
  }

  console.log(`\nRepository Onboarding`);
  console.log("═".repeat(55));
  console.log(`  Repo: ${repo}`);
  console.log(`  Preset: ${preset}`);
  console.log("");

  for (const s of steps) {
    const icon = s.status === "created" ? "+" : "-";
    console.log(`  [${icon}] ${s.name.padEnd(35)} ${s.detail}`);
  }

  const created = steps.filter((s) => s.status === "created").length;
  console.log(`\n  ${created} file(s) created, ${steps.length - created} skipped.`);
  console.log("═".repeat(55));
}
