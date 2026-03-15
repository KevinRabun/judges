import { readFileSync, existsSync } from "fs";
import { join } from "path";

/* ── review-onboarding-check ────────────────────────────────────────
   Verify that a project has the basic Judges configuration and
   integrations needed for effective code review.  Helps new teams
   onboard quickly.
   ─────────────────────────────────────────────────────────────────── */

interface OnboardingCheck {
  item: string;
  status: string;
  detail: string;
}

function runChecks(cwd: string): OnboardingCheck[] {
  const checks: OnboardingCheck[] = [];

  // Check for judgesrc config
  const rcPath = join(cwd, ".judgesrc");
  const rcJsonPath = join(cwd, ".judgesrc.json");
  if (existsSync(rcPath) || existsSync(rcJsonPath)) {
    checks.push({ item: "Config file", status: "OK", detail: "Found .judgesrc" });
  } else {
    checks.push({ item: "Config file", status: "MISSING", detail: "Create .judgesrc or .judgesrc.json" });
  }

  // Check for .judges directory
  const judgesDir = join(cwd, ".judges");
  if (existsSync(judgesDir)) {
    checks.push({ item: ".judges directory", status: "OK", detail: "Found .judges/" });
  } else {
    checks.push({ item: ".judges directory", status: "MISSING", detail: "Create .judges/ for local data" });
  }

  // Check for baseline
  const baselinePath = join(cwd, ".judges", "baseline.json");
  if (existsSync(baselinePath)) {
    checks.push({ item: "Baseline", status: "OK", detail: "Baseline configured" });
  } else {
    checks.push({ item: "Baseline", status: "MISSING", detail: "Run judges baseline to set up" });
  }

  // Check for CI integration
  const ghWorkflow = join(cwd, ".github", "workflows");
  if (existsSync(ghWorkflow)) {
    checks.push({ item: "CI workflows", status: "OK", detail: "GitHub Actions detected" });
  } else {
    checks.push({ item: "CI workflows", status: "MISSING", detail: "Set up CI integration" });
  }

  // Check for last verdict
  const verdictPath = join(cwd, ".judges", "last-verdict.json");
  if (existsSync(verdictPath)) {
    checks.push({ item: "Last verdict", status: "OK", detail: "Previous review found" });
  } else {
    checks.push({ item: "Last verdict", status: "MISSING", detail: "Run a review first" });
  }

  // Check for .gitignore entry
  const gitignorePath = join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(".judges")) {
      checks.push({ item: ".gitignore", status: "OK", detail: ".judges/ is gitignored" });
    } else {
      checks.push({ item: ".gitignore", status: "WARNING", detail: "Consider adding .judges/ to .gitignore" });
    }
  }

  return checks;
}

export function runReviewOnboardingCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-onboarding-check [options]

Check onboarding status for Judges integration.

Options:
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const checks = runChecks(process.cwd());

  if (format === "json") {
    console.log(JSON.stringify(checks, null, 2));
    return;
  }

  console.log("\n=== Onboarding Checklist ===\n");
  let okCount = 0;
  for (const c of checks) {
    const icon = c.status === "OK" ? "OK" : c.status === "WARNING" ? "WARN" : "MISS";
    console.log(`  [${icon}] ${c.item}: ${c.detail}`);
    if (c.status === "OK") okCount++;
  }

  const pct = Math.round((okCount / checks.length) * 100);
  console.log(`\nOnboarding progress: ${pct}% (${okCount}/${checks.length})`);

  if (pct === 100) {
    console.log("All checks passed — setup is complete!");
  } else {
    console.log("Address the MISSING items to complete setup.");
  }
}
