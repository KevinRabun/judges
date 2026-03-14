/**
 * Review-integration-test — Validate review integration with CI/CD pipelines.
 */

import { existsSync, readFileSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IntegrationCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

function checkGitHubActions(): IntegrationCheck {
  const paths = [".github/workflows", ".github/workflows/judges.yml", ".github/workflows/judges.yaml"];
  for (const p of paths) {
    if (existsSync(p)) {
      if (p.endsWith(".yml") || p.endsWith(".yaml")) {
        try {
          const content = readFileSync(p, "utf-8");
          if (content.includes("judges")) {
            return { name: "GitHub Actions", status: "pass", detail: `Found judges integration in ${p}` };
          }
        } catch {
          /* ignore */
        }
      }
      return { name: "GitHub Actions", status: "warn", detail: `Workflows dir exists but no judges step found` };
    }
  }
  return { name: "GitHub Actions", status: "warn", detail: "No GitHub Actions workflow found" };
}

function checkGitLabCI(): IntegrationCheck {
  if (existsSync(".gitlab-ci.yml")) {
    try {
      const content = readFileSync(".gitlab-ci.yml", "utf-8");
      if (content.includes("judges")) {
        return { name: "GitLab CI", status: "pass", detail: "Found judges integration" };
      }
      return { name: "GitLab CI", status: "warn", detail: ".gitlab-ci.yml exists but no judges step" };
    } catch {
      /* ignore */
    }
  }
  return { name: "GitLab CI", status: "warn", detail: "No .gitlab-ci.yml found" };
}

function checkPreCommit(): IntegrationCheck {
  const hooks = [".husky/pre-commit", ".git/hooks/pre-commit"];
  for (const h of hooks) {
    if (existsSync(h)) {
      try {
        const content = readFileSync(h, "utf-8");
        if (content.includes("judges")) {
          return { name: "Pre-commit hook", status: "pass", detail: `Found judges in ${h}` };
        }
        return { name: "Pre-commit hook", status: "warn", detail: `Hook exists at ${h} but no judges integration` };
      } catch {
        /* ignore */
      }
    }
  }
  return { name: "Pre-commit hook", status: "warn", detail: "No pre-commit hook found" };
}

function checkPackageScripts(): IntegrationCheck {
  if (!existsSync("package.json")) {
    return { name: "npm scripts", status: "warn", detail: "No package.json found" };
  }
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const scripts = pkg.scripts || {};
    const judgesScripts = Object.entries(scripts).filter(([, v]) => String(v).includes("judges"));
    if (judgesScripts.length > 0) {
      return { name: "npm scripts", status: "pass", detail: `Found: ${judgesScripts.map(([k]) => k).join(", ")}` };
    }
    return { name: "npm scripts", status: "warn", detail: "No judges-related npm scripts" };
  } catch {
    return { name: "npm scripts", status: "warn", detail: "Could not parse package.json" };
  }
}

function checkOutputFormats(): IntegrationCheck {
  const sarifFiles = ["results.sarif", "results.sarif.json", ".judges/results.sarif"];
  for (const f of sarifFiles) {
    if (existsSync(f)) {
      return { name: "SARIF output", status: "pass", detail: `Found ${f}` };
    }
  }
  return {
    name: "SARIF output",
    status: "warn",
    detail: "No SARIF output found (use --format sarif for GitHub code scanning)",
  };
}

function checkBaselineFile(): IntegrationCheck {
  const candidates = [".judges-baseline.json", ".judges/baseline.json", "judges-baseline.json"];
  for (const c of candidates) {
    if (existsSync(c)) return { name: "Baseline file", status: "pass", detail: c };
  }
  return { name: "Baseline file", status: "warn", detail: "No baseline file (use 'judges baseline' to set one)" };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIntegrationTest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-integration-test — Validate CI/CD integration

Usage:
  judges review-integration-test [options]

Options:
  --strict          Fail on warnings
  --format json     JSON output
  --help, -h        Show this help

Checks: GitHub Actions, GitLab CI, pre-commit hooks, npm scripts, SARIF output, baseline.
`);
    return;
  }

  const strict = argv.includes("--strict");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const checks: IntegrationCheck[] = [
    checkGitHubActions(),
    checkGitLabCI(),
    checkPreCommit(),
    checkPackageScripts(),
    checkOutputFormats(),
    checkBaselineFile(),
  ];

  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");
  const passes = checks.filter((c) => c.status === "pass");
  const ok = failures.length === 0 && (!strict || warnings.length === 0);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { checks, ok, passes: passes.length, warnings: warnings.length, failures: failures.length },
        null,
        2,
      ),
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  console.log("\nCI/CD Integration Check:");
  console.log("═".repeat(65));
  for (const c of checks) {
    const icon = c.status === "pass" ? "PASS" : c.status === "warn" ? "WARN" : "FAIL";
    console.log(`  [${icon}] ${c.name.padEnd(20)} ${c.detail}`);
  }
  console.log("═".repeat(65));
  console.log(
    `  ${passes.length} pass, ${warnings.length} warn, ${failures.length} fail — ${ok ? "Ready" : "Issues found"}`,
  );

  if (!ok) process.exitCode = 1;
}
