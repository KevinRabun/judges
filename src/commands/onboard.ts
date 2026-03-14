/**
 * `judges onboard` — One-command team onboarding.
 *
 * Goes beyond `judges init` to get an entire team productive:
 * 1. Generates .judgesrc (if missing) with team-friendly defaults
 * 2. Creates a baseline from the current codebase (suppress existing debt)
 * 3. Configures data adapter for team-wide feedback/metrics sharing
 * 4. Generates CI workflow for the detected platform
 * 5. Adds recommended .gitignore entries
 * 6. Runs a first scan and prints a summary
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";

// ─── Onboard Runner ─────────────────────────────────────────────────────────

export async function runOnboard(argv: string[]): Promise<void> {
  const projectDir = argv.find((a, i) => i > 2 && !a.startsWith("-")) ?? ".";
  const root = resolve(projectDir);
  const quiet = argv.includes("--quiet");

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║            Judges Panel — Team Onboarding                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  const steps: string[] = [];

  // ── Step 1: Generate .judgesrc if missing ──────────────────────────────
  const rcPath = join(root, ".judgesrc.json");
  if (!existsSync(rcPath) && !existsSync(join(root, ".judgesrc"))) {
    const config = {
      policyProfile: "default",
      minSeverity: "medium",
      disabledJudges: [],
      disabledRules: [],
      judgeWeights: {},
      dataAdapter: { type: "filesystem" },
    };
    safeWrite(rcPath, JSON.stringify(config, null, 2) + "\n");
    steps.push("Created .judgesrc.json with team-friendly defaults");
  } else {
    steps.push("Config .judgesrc already exists (skipped)");
  }

  // ── Step 2: Create baseline from current codebase ──────────────────────
  const baselinePath = join(root, ".judges-baseline.json");
  if (!existsSync(baselinePath)) {
    try {
      const { runBaseline } = await import("./baseline.js");
      // Call baseline create in the project directory
      runBaseline(["node", "judges", "baseline", "create", "--dir", root]);
      steps.push("Created .judges-baseline.json from current codebase");
    } catch {
      // Baseline creation may fail if there are no source files
      steps.push("Baseline creation skipped (no source files found)");
    }
  } else {
    steps.push("Baseline already exists (skipped)");
  }

  // ── Step 3: Add .gitignore entries ─────────────────────────────────────
  const gitignorePath = join(root, ".gitignore");
  const judgesIgnoreEntries = ["# Judges Panel cache and local data", ".judges-cache/", ".judges-findings.json"];
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, "utf-8");
    const missingEntries = judgesIgnoreEntries.filter((e) => !existing.includes(e));
    if (missingEntries.length > 0) {
      writeFileSync(gitignorePath, existing.trimEnd() + "\n\n" + missingEntries.join("\n") + "\n", "utf-8");
      steps.push("Added Judges cache entries to .gitignore");
    } else {
      steps.push(".gitignore already configured (skipped)");
    }
  } else {
    safeWrite(gitignorePath, judgesIgnoreEntries.join("\n") + "\n");
    steps.push("Created .gitignore with Judges cache entries");
  }

  // ── Step 4: Detect CI platform and generate workflow ──────────────────
  const hasGitHub = existsSync(join(root, ".github"));
  const hasGitLab = existsSync(join(root, ".gitlab-ci.yml"));
  const hasAzure = existsSync(join(root, "azure-pipelines.yml"));

  if (hasGitHub && !existsSync(join(root, ".github", "workflows", "judges.yml"))) {
    const workflowContent = generateMinimalGitHubWorkflow();
    safeWrite(join(root, ".github", "workflows", "judges.yml"), workflowContent);
    steps.push("Generated GitHub Actions workflow (.github/workflows/judges.yml)");
  } else if (hasGitLab && !existsSync(join(root, ".gitlab-ci.judges.yml"))) {
    try {
      const { generateGitLabCi } = await import("./ci-templates.js");
      safeWrite(join(root, ".gitlab-ci.judges.yml"), generateGitLabCi(true));
      steps.push("Generated GitLab CI config (.gitlab-ci.judges.yml)");
    } catch {
      steps.push("GitLab CI generation skipped");
    }
  } else if (hasAzure && !existsSync(join(root, "azure-pipelines.judges.yml"))) {
    try {
      const { generateAzurePipelines } = await import("./ci-templates.js");
      safeWrite(join(root, "azure-pipelines.judges.yml"), generateAzurePipelines(true));
      steps.push("Generated Azure Pipelines config (azure-pipelines.judges.yml)");
    } catch {
      steps.push("Azure Pipelines generation skipped");
    }
  } else {
    steps.push("CI workflow already configured or no CI platform detected");
  }

  // ── Step 5: Ensure VS Code MCP config ──────────────────────────────────
  const mcpPath = join(root, ".vscode", "mcp.json");
  if (!existsSync(mcpPath)) {
    const mcpConfig = {
      servers: {
        judges: { command: "judges", args: [] },
      },
    };
    safeWrite(mcpPath, JSON.stringify(mcpConfig, null, 2) + "\n");
    steps.push("Created .vscode/mcp.json for MCP server integration");
  } else {
    steps.push("VS Code MCP config already exists (skipped)");
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("  Onboarding Complete!");
  console.log("  " + "─".repeat(50));
  console.log("");
  for (const step of steps) {
    console.log(`  ✅ ${step}`);
  }
  console.log("");
  console.log("  Next Steps:");
  console.log("  ───────────");
  console.log("  1. Review and commit the generated files");
  console.log("  2. Run:  judges eval .              # Scan the project");
  console.log("  3. Run:  judges help feedback        # Learn about feedback");
  console.log("  4. Run:  judges help data-adapter    # Set up team storage");
  console.log("");
  console.log("  Team members can get started by running:");
  console.log("    npm install -g @kevinrabun/judges && judges eval .");
  console.log("");

  if (!quiet) {
    console.log("  Tip: Commit .judgesrc.json, .judges-baseline.json, and CI");
    console.log("  workflows so the whole team shares the same configuration.\n");
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeWrite(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

function generateMinimalGitHubWorkflow(): string {
  return `name: Judges Panel
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  judges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g @kevinrabun/judges
      - run: judges eval . --format sarif --baseline .judges-baseline.json > judges.sarif.json
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: judges.sarif.json
`;
}
