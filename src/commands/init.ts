/**
 * `judges init` — Interactive project setup wizard.
 *
 * Generates:
 *   - .judgesrc.json           (project config)
 *   - .vscode/mcp.json         (VS Code MCP server config)
 *   - .github/workflows/judges.yml (CI workflow)
 *   - .husky/pre-commit hook   (optional)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { createInterface } from "readline";

// ─── Interactive Prompt Helper ──────────────────────────────────────────────

function createPromptInterface() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(
  rl: ReturnType<typeof createPromptInterface>,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  return new Promise((r) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      r(answer.trim() || defaultValue || "");
    });
  });
}

async function askYesNo(
  rl: ReturnType<typeof createPromptInterface>,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await ask(rl, `${question} [${hint}]`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

async function askChoice(
  rl: ReturnType<typeof createPromptInterface>,
  question: string,
  options: string[],
  defaultIndex = 0,
): Promise<string> {
  console.log(`  ${question}`);
  for (let i = 0; i < options.length; i++) {
    const marker = i === defaultIndex ? ">" : " ";
    console.log(`  ${marker} ${i + 1}. ${options[i]}`);
  }
  const answer = await ask(rl, "Choice", String(defaultIndex + 1));
  const idx = parseInt(answer, 10) - 1;
  return options[idx >= 0 && idx < options.length ? idx : defaultIndex];
}

// ─── File Generators ────────────────────────────────────────────────────────

interface InitOptions {
  policyProfile: string;
  minSeverity: string;
  disabledJudges: string[];
  generateGitHubAction: boolean;
  generateGitLabCi: boolean;
  generateAzurePipelines: boolean;
  generateMcpConfig: boolean;
  generatePreCommit: boolean;
  failOnFindings: boolean;
}

function generateJudgesRc(opts: InitOptions): string {
  const rc: Record<string, unknown> = {};
  if (opts.policyProfile !== "default") {
    rc.policyProfile = opts.policyProfile;
  }
  if (opts.minSeverity !== "low") {
    rc.minSeverity = opts.minSeverity;
  }
  if (opts.disabledJudges.length > 0) {
    rc.disabledJudges = opts.disabledJudges;
  }
  rc.disabledRules = [];
  rc.ruleOverrides = {};
  return JSON.stringify(rc, null, 2) + "\n";
}

function generateGitHubWorkflow(opts: InitOptions): string {
  return `name: Judges Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  security-events: write

jobs:
  judges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: KevinRabun/judges@main
        with:
          path: "."
          format: sarif
          upload-sarif: true
          fail-on-findings: ${opts.failOnFindings}
`;
}

function generateMcpConfig(): string {
  return (
    JSON.stringify(
      {
        servers: {
          judges: {
            command: "judges",
            args: [],
          },
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function generatePreCommitHook(): string {
  return `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run Judges on staged files
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(ts|tsx|js|jsx|py|go|rs|java|cs|cpp|cc|cxx)$')
if [ -n "$STAGED" ]; then
  echo "Running Judges on staged files..."
  for f in $STAGED; do
    judges eval "$f" --fail-on-findings 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "\\n  Judges found issues in $f. Commit blocked."
      echo "  Run 'judges eval $f' to see details, or 'judges fix $f' to auto-fix.\\n"
      exit 1
    fi
  done
fi
`;
}

// ─── Safe File Write ────────────────────────────────────────────────────────

function safeWriteFile(filePath: string, content: string, dryRun = false): boolean {
  const abs = resolve(filePath);
  if (existsSync(abs)) {
    console.log(`  ⏭  Skipped (already exists): ${filePath}`);
    return false;
  }
  if (dryRun) {
    console.log(`  📝 Would create: ${filePath}`);
    return true;
  }
  const dir = dirname(abs);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(abs, content, "utf-8");
  console.log(`  ✅ Created: ${filePath}`);
  return true;
}

// ─── Main Init Command ─────────────────────────────────────────────────────

export async function runInit(projectDir: string = "."): Promise<void> {
  const root = resolve(projectDir);
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Judges Panel — Project Setup Wizard            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  // Check if already initialized
  if (existsSync(join(root, ".judgesrc.json")) || existsSync(join(root, ".judgesrc"))) {
    console.log("  ℹ  This project already has a .judgesrc config.");
    console.log("  Run 'judges eval' to analyze your code.\n");
    return;
  }

  const rl = createPromptInterface();

  try {
    // 1. Policy profile
    console.log("  What kind of project is this?\n");
    const profile = await askChoice(rl, "", [
      "default — General-purpose application",
      "startup — Move fast, catch critical issues only",
      "regulated — Enterprise/government, strict compliance",
      "healthcare — HIPAA-aware, patient data focus",
      "fintech — PCI-DSS, financial data focus",
      "public-sector — FedRAMP/NIST-aligned",
    ]);
    const policyProfile = profile.split(" — ")[0];

    // 2. Minimum severity
    console.log("");
    const minSeverity = await askChoice(rl, "Minimum severity to report?", [
      "low — Show everything (recommended for new projects)",
      "medium — Hide low-severity hints",
      "high — Only critical and high",
    ]);
    const minSev = minSeverity.split(" — ")[0];

    // 3. Disable any judges?
    console.log("");
    const disableAny = await askYesNo(rl, "Skip any judges? (e.g., disable i18n for internal tools)", false);
    let disabledJudges: string[] = [];
    if (disableAny) {
      const ids = await ask(rl, "Judge IDs to disable (comma-separated)", "");
      disabledJudges = ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // 4. GitHub Actions
    console.log("");
    const generateGitHubAction = await askYesNo(rl, "Generate GitHub Actions workflow?", true);
    let failOnFindings = false;
    if (generateGitHubAction) {
      failOnFindings = await askYesNo(rl, "Fail CI on critical/high findings?", true);
    }

    // 4b. GitLab CI
    console.log("");
    const generateGitLabCi = await askYesNo(rl, "Generate GitLab CI pipeline (.gitlab-ci.yml)?", false);

    // 4c. Azure Pipelines
    console.log("");
    const generateAzurePipelines = await askYesNo(rl, "Generate Azure Pipelines config (azure-pipelines.yml)?", false);

    // Set failOnFindings from any CI setup
    if (!failOnFindings && (generateGitLabCi || generateAzurePipelines)) {
      failOnFindings = await askYesNo(rl, "Fail CI on critical/high findings?", true);
    }

    // 5. MCP config
    console.log("");
    const generateMcpConfigOpt = await askYesNo(rl, "Generate VS Code MCP config (.vscode/mcp.json)?", true);

    // 6. Pre-commit hook
    console.log("");
    const hasHusky = existsSync(join(root, ".husky"));
    const generatePreCommit = await askYesNo(
      rl,
      hasHusky ? "Add Judges to your Husky pre-commit hook?" : "Generate pre-commit hook (requires Husky)?",
      hasHusky,
    );

    rl.close();

    // ─── Generate Files ───────────────────────────────────────────────────

    const opts: InitOptions = {
      policyProfile,
      minSeverity: minSev,
      disabledJudges,
      generateGitHubAction,
      generateGitLabCi,
      generateAzurePipelines,
      generateMcpConfig: generateMcpConfigOpt,
      generatePreCommit,
      failOnFindings,
    };

    console.log("\n  Generating files...\n");

    // Always generate .judgesrc.json
    safeWriteFile(join(root, ".judgesrc.json"), generateJudgesRc(opts));

    if (opts.generateGitHubAction) {
      safeWriteFile(join(root, ".github", "workflows", "judges.yml"), generateGitHubWorkflow(opts));
    }

    if (opts.generateGitLabCi) {
      const { generateGitLabCi: genGitLab } = await import("./ci-templates.js");
      safeWriteFile(join(root, ".gitlab-ci.judges.yml"), genGitLab(opts.failOnFindings));
    }

    if (opts.generateAzurePipelines) {
      const { generateAzurePipelines: genAzure } = await import("./ci-templates.js");
      safeWriteFile(join(root, "azure-pipelines.judges.yml"), genAzure(opts.failOnFindings));
    }

    if (opts.generateMcpConfig) {
      const mcpPath = join(root, ".vscode", "mcp.json");
      if (existsSync(mcpPath)) {
        // Merge with existing MCP config
        try {
          const existing = JSON.parse(readFileSync(mcpPath, "utf-8"));
          if (!existing.servers?.judges) {
            existing.servers = existing.servers || {};
            existing.servers.judges = { command: "judges", args: [] };
            writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
            console.log(`  ✅ Added judges server to existing: .vscode/mcp.json`);
          } else {
            console.log(`  ⏭  Skipped (judges already configured): .vscode/mcp.json`);
          }
        } catch {
          safeWriteFile(mcpPath, generateMcpConfig());
        }
      } else {
        safeWriteFile(join(root, ".vscode", "mcp.json"), generateMcpConfig());
      }
    }

    if (opts.generatePreCommit) {
      safeWriteFile(join(root, ".husky", "pre-commit"), generatePreCommitHook());
    }

    // ─── Summary ────────────────────────────────────────────────────────

    console.log("\n  Done! Next steps:\n");
    console.log("  1. judges eval src/app.ts          # Evaluate a file");
    console.log("  2. judges eval .                   # Evaluate the whole project");
    console.log("  3. judges fix src/app.ts --apply   # Auto-fix findings");
    console.log("  4. judges watch src/               # Watch for changes");
    console.log("");
    console.log("  📖 Full docs: https://github.com/KevinRabun/judges#readme\n");
  } catch {
    rl.close();
    console.error("  Init cancelled.\n");
    process.exit(1);
  }
}
