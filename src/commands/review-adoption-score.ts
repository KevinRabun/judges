import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-adoption-score ──────────────────────────────────────────
   Calculate a project's Judges adoption readiness score by checking
   configuration completeness, usage patterns, and feature utilization.
   All analysis runs locally using workspace files.
   ─────────────────────────────────────────────────────────────────── */

interface AdoptionCheck {
  category: string;
  check: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  detail: string;
}

function runChecks(projectDir: string): AdoptionCheck[] {
  const checks: AdoptionCheck[] = [];

  // 1) Configuration exists
  const configPaths = [".judgesrc", ".judgesrc.json", "judges.config.json"];
  const hasConfig = configPaths.some((p) => existsSync(join(projectDir, p)));
  checks.push({
    category: "Configuration",
    check: "Config file present",
    passed: hasConfig,
    points: hasConfig ? 15 : 0,
    maxPoints: 15,
    detail: hasConfig ? "Configuration file found" : "No .judgesrc or judges.config.json found",
  });

  // 2) CI integration
  const ciPaths = [".github/workflows", ".gitlab-ci.yml", "Jenkinsfile", ".circleci"];
  const hasCI = ciPaths.some((p) => existsSync(join(projectDir, p)));
  checks.push({
    category: "CI Integration",
    check: "CI pipeline detected",
    passed: hasCI,
    points: hasCI ? 15 : 0,
    maxPoints: 15,
    detail: hasCI ? "CI pipeline configuration found" : "No CI pipeline detected",
  });

  // 3) Review history
  const historyDir = join(projectDir, ".judges", "history");
  let historyCount = 0;
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir) as unknown as string[];
    historyCount = files.filter((f) => typeof f === "string" && f.endsWith(".json")).length;
  }
  const historyScore = Math.min(historyCount * 2, 15);
  checks.push({
    category: "Usage",
    check: "Review history depth",
    passed: historyCount >= 3,
    points: historyScore,
    maxPoints: 15,
    detail: `${historyCount} historical reviews found`,
  });

  // 4) Last verdict exists
  const lastVerdict = join(projectDir, ".judges", "last-verdict.json");
  const hasLastVerdict = existsSync(lastVerdict);
  checks.push({
    category: "Usage",
    check: "Recent review available",
    passed: hasLastVerdict,
    points: hasLastVerdict ? 10 : 0,
    maxPoints: 10,
    detail: hasLastVerdict ? "Last verdict file present" : "No recent review verdict found",
  });

  // 5) Baseline configured
  const baselinePath = join(projectDir, ".judges", "baseline.json");
  const hasBaseline = existsSync(baselinePath);
  checks.push({
    category: "Configuration",
    check: "Baseline configured",
    passed: hasBaseline,
    points: hasBaseline ? 10 : 0,
    maxPoints: 10,
    detail: hasBaseline ? "Baseline file found" : "No baseline — run `judges baseline` to create one",
  });

  // 6) Custom rules or overrides
  let hasOverrides = false;
  if (hasConfig) {
    try {
      const configPath = configPaths.find((p) => existsSync(join(projectDir, p)));
      if (configPath) {
        const raw = readFileSync(join(projectDir, configPath), "utf-8");
        const cfg = JSON.parse(raw) as Record<string, unknown>;
        hasOverrides = Boolean(cfg["ruleOverrides"]) || Boolean(cfg["disabledRules"]);
      }
    } catch {
      // Ignore parse errors
    }
  }
  checks.push({
    category: "Customization",
    check: "Custom rules/overrides",
    passed: hasOverrides,
    points: hasOverrides ? 10 : 0,
    maxPoints: 10,
    detail: hasOverrides ? "Rule customization detected" : "No rule overrides configured yet",
  });

  // 7) Quality trend (improving scores)
  let trendPositive = false;
  if (historyCount >= 2 && existsSync(historyDir)) {
    try {
      const files = (readdirSync(historyDir) as unknown as string[])
        .filter((f) => typeof f === "string" && f.endsWith(".json"))
        .sort();
      const recent = files.slice(-3);
      const scores: number[] = [];
      for (const file of recent) {
        const data = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict;
        scores.push(data.overallScore ?? 0);
      }
      trendPositive = scores.length >= 2 && scores[scores.length - 1] >= scores[0];
    } catch {
      // Skip
    }
  }
  checks.push({
    category: "Quality",
    check: "Score trend improving",
    passed: trendPositive,
    points: trendPositive ? 10 : 0,
    maxPoints: 10,
    detail: trendPositive ? "Quality scores are improving" : "Not enough data or scores declining",
  });

  // 8) Git hooks
  const hookPaths = [".husky", ".git/hooks/pre-commit"];
  const hasHooks = hookPaths.some((p) => existsSync(join(projectDir, p)));
  checks.push({
    category: "Integration",
    check: "Git hooks installed",
    passed: hasHooks,
    points: hasHooks ? 10 : 0,
    maxPoints: 10,
    detail: hasHooks ? "Git hooks detected" : "No git hooks — run `judges hook-install` to set up",
  });

  // 9) Documentation
  const docPaths = ["docs/judges.md", "docs/code-review.md", ".judges/README.md"];
  const hasDocs = docPaths.some((p) => existsSync(join(projectDir, p)));
  checks.push({
    category: "Documentation",
    check: "Review documentation",
    passed: hasDocs,
    points: hasDocs ? 5 : 0,
    maxPoints: 5,
    detail: hasDocs ? "Review documentation found" : "Consider adding review docs for your team",
  });

  return checks;
}

export function runReviewAdoptionScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-adoption-score [options]

Calculate adoption readiness score for the project.

Options:
  --dir <path>         Project directory (default: current)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const dirIdx = argv.indexOf("--dir");
  const projectDir = dirIdx !== -1 && argv[dirIdx + 1] ? join(process.cwd(), argv[dirIdx + 1]) : process.cwd();

  const checks = runChecks(projectDir);
  const totalPoints = checks.reduce((s, c) => s + c.points, 0);
  const maxPoints = checks.reduce((s, c) => s + c.maxPoints, 0);
  const scorePercent = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  if (format === "json") {
    console.log(JSON.stringify({ score: scorePercent, totalPoints, maxPoints, checks }, null, 2));
    return;
  }

  let grade: string;
  if (scorePercent >= 90) grade = "A — Fully Adopted";
  else if (scorePercent >= 70) grade = "B — Well Integrated";
  else if (scorePercent >= 50) grade = "C — Getting Started";
  else if (scorePercent >= 30) grade = "D — Early Stage";
  else grade = "F — Not Yet Adopted";

  console.log(`\n=== Adoption Score: ${scorePercent}% (${grade}) ===\n`);

  for (const c of checks) {
    const icon = c.passed ? "✓" : "✗";
    console.log(`  ${icon} [${c.points}/${c.maxPoints}] ${c.check}`);
    console.log(`           ${c.detail}`);
  }

  console.log(`\n  Total: ${totalPoints}/${maxPoints} points`);
}
