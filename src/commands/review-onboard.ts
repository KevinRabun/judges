/**
 * Review-onboard — Guided onboarding for new team members adopting Judges.
 */

import { existsSync } from "fs";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OnboardStep {
  step: number;
  title: string;
  status: "done" | "pending" | "skipped";
  detail: string;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

function checkPackageInstalled(): OnboardStep {
  const hasPackageJson = existsSync("package.json");
  if (!hasPackageJson) {
    return {
      step: 1,
      title: "Project Setup",
      status: "pending",
      detail: "No package.json found. Run 'npm init' first.",
    };
  }
  return { step: 1, title: "Project Setup", status: "done", detail: "package.json found." };
}

function checkJudgesConfig(): OnboardStep {
  const configs = [".judgesrc", ".judgesrc.json", "judgesrc.json"];
  const found = configs.find(existsSync);
  if (found) {
    return { step: 2, title: "Judges Configuration", status: "done", detail: `Config found: ${found}` };
  }
  return {
    step: 2,
    title: "Judges Configuration",
    status: "pending",
    detail: "No .judgesrc found. Run 'judges setup-wizard' to create one.",
  };
}

function checkGitSetup(): OnboardStep {
  if (existsSync(".git")) {
    return { step: 3, title: "Git Repository", status: "done", detail: "Git repository initialized." };
  }
  return { step: 3, title: "Git Repository", status: "pending", detail: "No .git directory. Run 'git init' to start." };
}

function checkCISetup(): OnboardStep {
  const ciFiles = [".github/workflows", ".gitlab-ci.yml", "Jenkinsfile", "azure-pipelines.yml"];
  const found = ciFiles.find(existsSync);
  if (found) {
    return { step: 4, title: "CI Integration", status: "done", detail: `CI found: ${found}` };
  }
  return {
    step: 4,
    title: "CI Integration",
    status: "pending",
    detail: "No CI config found. Consider adding Judges to your CI pipeline.",
  };
}

function checkJudgesAvailable(): OnboardStep {
  const judges = defaultRegistry.getJudges();
  if (judges.length > 0) {
    return { step: 5, title: "Available Judges", status: "done", detail: `${judges.length} judge(s) registered.` };
  }
  return { step: 5, title: "Available Judges", status: "pending", detail: "No judges registered." };
}

function checkBaselineSetup(): OnboardStep {
  if (existsSync(".judges/baseline.json") || existsSync("baseline.json")) {
    return { step: 6, title: "Baseline Configuration", status: "done", detail: "Baseline file found." };
  }
  return {
    step: 6,
    title: "Baseline Configuration",
    status: "pending",
    detail: "No baseline. Run 'judges baseline' to establish one.",
  };
}

function checkHooksSetup(): OnboardStep {
  if (existsSync(".husky") || existsSync(".git/hooks/pre-commit")) {
    return { step: 7, title: "Git Hooks", status: "done", detail: "Pre-commit hooks configured." };
  }
  return {
    step: 7,
    title: "Git Hooks",
    status: "pending",
    detail: "No pre-commit hooks. Consider adding Judges to pre-commit.",
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOnboard(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-onboard — Guided onboarding for new team members

Usage:
  judges review-onboard
  judges review-onboard --format json

Options:
  --format json         JSON output
  --help, -h            Show this help

Walks through onboarding steps and checks project readiness:
  1. Project setup (package.json)
  2. Judges configuration (.judgesrc)
  3. Git repository
  4. CI integration
  5. Available judges
  6. Baseline configuration
  7. Git hooks

Shows which steps are complete and what to do next.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const steps: OnboardStep[] = [
    checkPackageInstalled(),
    checkJudgesConfig(),
    checkGitSetup(),
    checkCISetup(),
    checkJudgesAvailable(),
    checkBaselineSetup(),
    checkHooksSetup(),
  ];

  const doneCount = steps.filter((s) => s.status === "done").length;
  const totalSteps = steps.length;
  const completionPct = (doneCount / totalSteps) * 100;

  if (format === "json") {
    console.log(JSON.stringify({ steps, doneCount, totalSteps, completionPct }, null, 2));
    return;
  }

  console.log("\nJudges Onboarding Checklist:");
  console.log("═".repeat(60));
  console.log(`  Progress: ${doneCount}/${totalSteps} steps complete (${completionPct.toFixed(0)}%)`);

  const bar = (pct: number): string => {
    const filled = Math.round(pct / 5);
    return "█".repeat(filled) + "░".repeat(20 - filled);
  };
  console.log(`  [${bar(completionPct)}]`);
  console.log("═".repeat(60));

  for (const step of steps) {
    const icon = step.status === "done" ? "✓" : step.status === "skipped" ? "─" : "○";
    console.log(`\n  ${icon} Step ${step.step}: ${step.title}`);
    console.log(`    ${step.detail}`);
  }

  console.log("\n" + "═".repeat(60));

  if (doneCount === totalSteps) {
    console.log("  All steps complete! You're ready to use Judges.");
  } else {
    const nextStep = steps.find((s) => s.status === "pending");
    if (nextStep) {
      console.log(`  Next: Step ${nextStep.step} — ${nextStep.title}`);
      console.log(`  ${nextStep.detail}`);
    }
  }

  console.log("\n  Quick start commands:");
  console.log("    judges eval --file <path>           Run a review");
  console.log("    judges setup-wizard                 Configure Judges");
  console.log("    judges list                         See available judges");
  console.log("    judges baseline                     Create a baseline");
}
