/**
 * Review-ci-status — Check CI pipeline review status.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CICheck {
  name: string;
  status: "pass" | "fail" | "pending" | "unknown";
  detail: string;
  timestamp: string;
}

interface CIStatusReport {
  branch: string;
  commit: string;
  timestamp: string;
  checks: CICheck[];
  overall: "pass" | "fail" | "pending";
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STATUS_FILE = join(".judges", "ci-status.json");

function saveReport(report: CIStatusReport): void {
  mkdirSync(dirname(STATUS_FILE), { recursive: true });
  writeFileSync(STATUS_FILE, JSON.stringify(report, null, 2), "utf-8");
}

// ─── Git Helpers ────────────────────────────────────────────────────────────

function getGitInfo(): { branch: string; commit: string } {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    return { branch, commit };
  } catch {
    return { branch: "unknown", commit: "unknown" };
  }
}

function checkUncommittedChanges(): CICheck {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    return {
      name: "Uncommitted Changes",
      status: status.length === 0 ? "pass" : "fail",
      detail: status.length === 0 ? "Working tree clean" : `${status.split("\n").length} uncommitted change(s)`,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      name: "Uncommitted Changes",
      status: "unknown",
      detail: "Could not check",
      timestamp: new Date().toISOString(),
    };
  }
}

function checkPackageJson(): CICheck {
  if (!existsSync("package.json")) {
    return {
      name: "package.json",
      status: "unknown",
      detail: "No package.json found",
      timestamp: new Date().toISOString(),
    };
  }
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const hasTest = pkg.scripts?.test !== undefined;
    const hasBuild = pkg.scripts?.build !== undefined;
    const hasLint = pkg.scripts?.lint !== undefined;
    const detail = [
      hasTest ? "test ✓" : "test ✗",
      hasBuild ? "build ✓" : "build ✗",
      hasLint ? "lint ✓" : "lint ✗",
    ].join(", ");
    return { name: "CI Scripts", status: hasTest ? "pass" : "fail", detail, timestamp: new Date().toISOString() };
  } catch {
    return {
      name: "CI Scripts",
      status: "unknown",
      detail: "Could not parse package.json",
      timestamp: new Date().toISOString(),
    };
  }
}

function checkJudgesConfig(): CICheck {
  const configPaths = [".judgesrc", ".judgesrc.json", "judgesrc.json"];
  const found = configPaths.find(existsSync);
  if (found) {
    return { name: "Judges Config", status: "pass", detail: `Found ${found}`, timestamp: new Date().toISOString() };
  }
  return {
    name: "Judges Config",
    status: "pending",
    detail: "No .judgesrc found (optional)",
    timestamp: new Date().toISOString(),
  };
}

function checkGitHooks(): CICheck {
  const huskyDir = join(".husky");
  if (existsSync(huskyDir)) {
    return { name: "Git Hooks", status: "pass", detail: "Husky hooks configured", timestamp: new Date().toISOString() };
  }
  const gitHooksDir = join(".git", "hooks");
  if (existsSync(gitHooksDir)) {
    return {
      name: "Git Hooks",
      status: "pass",
      detail: "Git hooks directory exists",
      timestamp: new Date().toISOString(),
    };
  }
  return {
    name: "Git Hooks",
    status: "pending",
    detail: "No git hooks configured",
    timestamp: new Date().toISOString(),
  };
}

function checkCIConfig(): CICheck {
  const ciFiles = [
    ".github/workflows",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    ".circleci/config.yml",
    "azure-pipelines.yml",
    ".travis.yml",
  ];
  const found = ciFiles.filter(existsSync);
  if (found.length > 0) {
    return {
      name: "CI Configuration",
      status: "pass",
      detail: `Found: ${found.join(", ")}`,
      timestamp: new Date().toISOString(),
    };
  }
  return {
    name: "CI Configuration",
    status: "fail",
    detail: "No CI configuration found",
    timestamp: new Date().toISOString(),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCiStatus(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-ci-status — Check CI pipeline review status

Usage:
  judges review-ci-status
  judges review-ci-status --format json

Options:
  --format json         JSON output
  --help, -h            Show this help

Checks:
  • Uncommitted changes
  • CI scripts (test, build, lint)
  • Judges configuration
  • Git hooks
  • CI configuration files

Report saved to .judges/ci-status.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const { branch, commit } = getGitInfo();

  const checks: CICheck[] = [
    checkUncommittedChanges(),
    checkPackageJson(),
    checkJudgesConfig(),
    checkGitHooks(),
    checkCIConfig(),
  ];

  const hasFail = checks.some((c) => c.status === "fail");
  const hasPending = checks.some((c) => c.status === "pending");
  const overall: "pass" | "fail" | "pending" = hasFail ? "fail" : hasPending ? "pending" : "pass";

  const report: CIStatusReport = {
    branch,
    commit,
    timestamp: new Date().toISOString(),
    checks,
    overall,
  };

  saveReport(report);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const statusIcon = (s: string): string => {
    if (s === "pass") return "✓";
    if (s === "fail") return "✗";
    if (s === "pending") return "○";
    return "?";
  };

  console.log("\nCI Status Report:");
  console.log("═".repeat(60));
  console.log(`  Branch: ${branch}  Commit: ${commit}`);
  console.log(`  Overall: ${overall.toUpperCase()} ${statusIcon(overall)}`);
  console.log("═".repeat(60));

  for (const c of checks) {
    console.log(`  ${statusIcon(c.status)} ${c.name.padEnd(25)} ${c.detail}`);
  }

  console.log("═".repeat(60));
  console.log(`  Report saved to ${STATUS_FILE}`);
}
