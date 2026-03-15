import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-readiness-check ─────────────────────────────────────────
   Assess whether a codebase is ready for review by checking
   prerequisite conditions: config exists, baseline available,
   recent history, and no stale suppressions. Outputs a readiness
   checklist with pass/fail for each criterion.
   ─────────────────────────────────────────────────────────────────── */

interface ReadinessItem {
  criterion: string;
  passed: boolean;
  detail: string;
}

interface ReadinessReport {
  ready: boolean;
  passCount: number;
  totalChecks: number;
  items: ReadinessItem[];
}

function checkReadiness(baseDir: string): ReadinessReport {
  const items: ReadinessItem[] = [];

  const configPath = join(baseDir, ".judgesrc.json");
  const configExists = existsSync(configPath);
  items.push({
    criterion: "Configuration file",
    passed: configExists,
    detail: configExists ? ".judgesrc.json found" : ".judgesrc.json not found — run judges init",
  });

  const baselinePath = join(baseDir, ".judges", "baseline.json");
  const baselineExists = existsSync(baselinePath);
  items.push({
    criterion: "Baseline available",
    passed: baselineExists,
    detail: baselineExists ? "Baseline found — suppressions will work" : "No baseline — run judges baseline first",
  });

  const historyDir = join(baseDir, ".judges", "history");
  let historyCount = 0;
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir) as unknown as string[];
    historyCount = files.filter((f) => String(f).endsWith(".json")).length;
  }
  items.push({
    criterion: "Review history",
    passed: historyCount >= 1,
    detail: historyCount >= 1 ? `${historyCount} prior reviews found` : "No review history — first-time setup",
  });

  const lastVerdictPath = join(baseDir, ".judges", "last-verdict.json");
  let lastVerdictFresh = false;
  if (existsSync(lastVerdictPath)) {
    try {
      const raw = readFileSync(lastVerdictPath, "utf-8");
      const verdict = JSON.parse(raw) as TribunalVerdict;
      if (verdict.timestamp) {
        const age = Date.now() - new Date(verdict.timestamp).getTime();
        lastVerdictFresh = age < 7 * 24 * 60 * 60 * 1000;
      }
    } catch {
      /* ignore parse errors */
    }
  }
  items.push({
    criterion: "Recent verdict",
    passed: lastVerdictFresh,
    detail: lastVerdictFresh ? "Last verdict is less than 7 days old" : "No recent verdict — run judges review",
  });

  const gitDir = join(baseDir, ".git");
  const gitExists = existsSync(gitDir);
  items.push({
    criterion: "Git repository",
    passed: gitExists,
    detail: gitExists ? "Git repo detected" : "Not a git repository — diff features limited",
  });

  const passCount = items.filter((i) => i.passed).length;
  return {
    ready: passCount === items.length,
    passCount,
    totalChecks: items.length,
    items,
  };
}

export function runReviewReadinessCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-readiness-check [options]

Assess whether a codebase is ready for review.

Options:
  --dir <path>         Project directory (default: cwd)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const dirIdx = argv.indexOf("--dir");
  const baseDir = dirIdx !== -1 && argv[dirIdx + 1] ? join(process.cwd(), argv[dirIdx + 1]) : process.cwd();

  const report = checkReadiness(baseDir);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Review Readiness Check (${report.passCount}/${report.totalChecks}) ===\n`);

  for (const item of report.items) {
    const icon = item.passed ? "✓" : "✗";
    console.log(`  ${icon} ${item.criterion.padEnd(24)} ${item.detail}`);
  }

  console.log();
  if (report.ready) {
    console.log("  All checks passed — ready for review.");
  } else {
    console.log("  Some checks failed — address issues above before review.");
  }
}
