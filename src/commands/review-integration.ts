/**
 * Review-integration — Verify CI/CD, IDE, and hook integrations are connected.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IntegrationCheck {
  name: string;
  category: string;
  status: "connected" | "missing" | "partial";
  details: string;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

function checkJudgesrc(): IntegrationCheck {
  if (existsSync(".judgesrc")) {
    try {
      JSON.parse(readFileSync(".judgesrc", "utf-8"));
      return {
        name: ".judgesrc",
        category: "config",
        status: "connected",
        details: "Configuration file found and valid",
      };
    } catch {
      return { name: ".judgesrc", category: "config", status: "partial", details: "File exists but has parse errors" };
    }
  }
  return {
    name: ".judgesrc",
    category: "config",
    status: "missing",
    details: "No .judgesrc found — run 'judges init'",
  };
}

function checkGitHooksDir(): IntegrationCheck {
  const huskyHook = join(".husky", "pre-commit");
  const gitHook = join(".git", "hooks", "pre-commit");
  if (existsSync(huskyHook)) {
    const content = readFileSync(huskyHook, "utf-8");
    if (content.includes("judges")) {
      return {
        name: "Git Pre-commit Hook",
        category: "hooks",
        status: "connected",
        details: "Husky pre-commit hook includes judges",
      };
    }
    return {
      name: "Git Pre-commit Hook",
      category: "hooks",
      status: "partial",
      details: "Husky hook exists but doesn't reference judges",
    };
  }
  if (existsSync(gitHook)) {
    const content = readFileSync(gitHook, "utf-8");
    if (content.includes("judges")) {
      return {
        name: "Git Pre-commit Hook",
        category: "hooks",
        status: "connected",
        details: "Git pre-commit hook includes judges",
      };
    }
    return {
      name: "Git Pre-commit Hook",
      category: "hooks",
      status: "partial",
      details: "Git hook exists but doesn't reference judges",
    };
  }
  return {
    name: "Git Pre-commit Hook",
    category: "hooks",
    status: "missing",
    details: "No pre-commit hook — run 'judges hook-install'",
  };
}

function checkGitHubActions(): IntegrationCheck {
  const workflowDir = join(".github", "workflows");
  if (!existsSync(workflowDir)) {
    return { name: "GitHub Actions", category: "ci", status: "missing", details: "No .github/workflows directory" };
  }
  try {
    const files = ["judges.yml", "judges.yaml", "review.yml", "review.yaml", "code-review.yml"];
    for (const f of files) {
      if (existsSync(join(workflowDir, f))) {
        return { name: "GitHub Actions", category: "ci", status: "connected", details: `Workflow file: ${f}` };
      }
    }
    // Check if any workflow references judges
    const commonFiles = ["ci.yml", "ci.yaml", "main.yml", "main.yaml", "push.yml", "build.yml"];
    for (const f of commonFiles) {
      const path = join(workflowDir, f);
      if (existsSync(path)) {
        const content = readFileSync(path, "utf-8");
        if (content.includes("judges")) {
          return { name: "GitHub Actions", category: "ci", status: "connected", details: `Judges referenced in ${f}` };
        }
      }
    }
    return {
      name: "GitHub Actions",
      category: "ci",
      status: "partial",
      details: "Workflows exist but no judges integration found",
    };
  } catch {
    return { name: "GitHub Actions", category: "ci", status: "missing", details: "Could not read workflows" };
  }
}

function checkVSCodeExtension(): IntegrationCheck {
  const vscodePath = join(".vscode", "extensions.json");
  if (existsSync(vscodePath)) {
    try {
      const content = readFileSync(vscodePath, "utf-8");
      if (content.includes("judges")) {
        return {
          name: "VS Code Extension",
          category: "ide",
          status: "connected",
          details: "Judges in recommended extensions",
        };
      }
    } catch {
      /* ignore */
    }
  }
  return {
    name: "VS Code Extension",
    category: "ide",
    status: "missing",
    details: "Add judges to .vscode/extensions.json recommendations",
  };
}

function checkPackageJson(): IntegrationCheck {
  if (!existsSync("package.json")) {
    return { name: "package.json scripts", category: "config", status: "missing", details: "No package.json found" };
  }
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as Record<string, unknown>;
    const scripts = (pkg.scripts || {}) as Record<string, string>;
    const judgesScripts = Object.entries(scripts).filter(([, v]) => v.includes("judges"));
    if (judgesScripts.length > 0) {
      return {
        name: "package.json scripts",
        category: "config",
        status: "connected",
        details: `Scripts: ${judgesScripts.map(([k]) => k).join(", ")}`,
      };
    }
    return {
      name: "package.json scripts",
      category: "config",
      status: "missing",
      details: "No judges scripts in package.json",
    };
  } catch {
    return {
      name: "package.json scripts",
      category: "config",
      status: "partial",
      details: "Could not parse package.json",
    };
  }
}

function checkLocalData(): IntegrationCheck {
  if (existsSync(".judges")) {
    return { name: "Local Data Dir", category: "data", status: "connected", details: ".judges/ directory exists" };
  }
  return {
    name: "Local Data Dir",
    category: "data",
    status: "missing",
    details: "No .judges/ directory — created on first use",
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIntegration(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-integration — Verify all integrations are connected

Usage:
  judges review-integration                        Run all checks
  judges review-integration --category ci          Check specific category
  judges review-integration --fix                  Show fix suggestions

Options:
  --category <cat>      Filter by category (config, ci, hooks, ide, data)
  --fix                 Show how to fix missing integrations
  --format json         JSON output
  --help, -h            Show this help

Verifies CI/CD, git hooks, IDE, and config integrations are properly set up.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const category = argv.find((_a: string, i: number) => argv[i - 1] === "--category");
  const showFix = argv.includes("--fix");

  let checks: IntegrationCheck[] = [
    checkJudgesrc(),
    checkPackageJson(),
    checkGitHooksDir(),
    checkGitHubActions(),
    checkVSCodeExtension(),
    checkLocalData(),
  ];

  if (category) {
    checks = checks.filter((c) => c.category === category);
  }

  if (format === "json") {
    console.log(JSON.stringify(checks, null, 2));
    return;
  }

  const connected = checks.filter((c) => c.status === "connected").length;
  const total = checks.length;

  console.log("\nIntegration Status:");
  console.log("─".repeat(70));
  for (const c of checks) {
    const icon = c.status === "connected" ? "[OK]" : c.status === "partial" ? "[!!]" : "[--]";
    console.log(`  ${icon} ${c.name.padEnd(25)} ${c.details}`);
  }
  console.log("─".repeat(70));
  console.log(`  ${connected}/${total} integrations connected`);

  if (showFix) {
    const missing = checks.filter((c) => c.status !== "connected");
    if (missing.length > 0) {
      console.log("\nSuggested Fixes:");
      console.log("─".repeat(70));
      for (const c of missing) {
        console.log(`  ${c.name}: ${c.details}`);
      }
      console.log("─".repeat(70));
    }
  }
  console.log();
}
