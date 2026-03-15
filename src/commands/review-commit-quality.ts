import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-commit-quality ──────────────────────────────────────────
   Score commit quality by analyzing verdict patterns, finding
   density, and review outcomes to identify commits that need
   more attention or coaching.
   ─────────────────────────────────────────────────────────────────── */

interface CommitQuality {
  file: string;
  score: number;
  grade: string;
  findingCount: number;
  criticalCount: number;
  verdict: string;
}

function scoreCommit(filename: string, verdict: TribunalVerdict): CommitQuality {
  const findings = verdict.findings ?? [];
  const critCount = verdict.criticalCount ?? 0;
  const highCount = verdict.highCount ?? 0;
  const overallScore = verdict.overallScore ?? 50;

  let score = overallScore;
  if (critCount > 0) score -= critCount * 15;
  if (highCount > 0) score -= highCount * 8;
  if (findings.length > 10) score -= 10;
  score = Math.max(0, Math.min(100, score));

  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return {
    file: filename,
    score,
    grade,
    findingCount: findings.length,
    criticalCount: critCount,
    verdict: verdict.overallVerdict ?? "unknown",
  };
}

export function runReviewCommitQuality(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-commit-quality [options]

Score commit quality from review verdicts.

Options:
  --dir <path>       Directory with verdict JSON files
  --report <path>    Single verdict JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const commits: CommitQuality[] = [];

  const dirIdx = argv.indexOf("--dir");
  const dirPath =
    dirIdx !== -1 && argv[dirIdx + 1]
      ? join(process.cwd(), argv[dirIdx + 1])
      : join(process.cwd(), ".judges", "history");

  if (existsSync(dirPath)) {
    const files = (readdirSync(dirPath) as unknown as string[]).filter((f: string) => f.endsWith(".json")).sort();
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(dirPath, file), "utf-8")) as TribunalVerdict;
      commits.push(scoreCommit(file, data));
    }
  }

  const reportIdx = argv.indexOf("--report");
  if (reportIdx !== -1 && argv[reportIdx + 1]) {
    const rPath = join(process.cwd(), argv[reportIdx + 1]);
    if (existsSync(rPath)) {
      const data = JSON.parse(readFileSync(rPath, "utf-8")) as TribunalVerdict;
      commits.push(scoreCommit(argv[reportIdx + 1], data));
    }
  }

  if (commits.length === 0) {
    const defaultPath = join(process.cwd(), ".judges", "last-verdict.json");
    if (existsSync(defaultPath)) {
      const data = JSON.parse(readFileSync(defaultPath, "utf-8")) as TribunalVerdict;
      commits.push(scoreCommit("last-verdict", data));
    }
  }

  if (commits.length === 0) {
    console.log("No verdict data found.");
    return;
  }

  commits.sort((a, b) => a.score - b.score);

  if (format === "json") {
    console.log(JSON.stringify(commits, null, 2));
    return;
  }

  console.log("\n=== Commit Quality ===\n");
  for (const c of commits) {
    console.log(`${c.grade} (${c.score}/100) ${c.file}`);
    console.log(`  Findings: ${c.findingCount} | Critical: ${c.criticalCount} | Verdict: ${c.verdict}`);
  }

  const avgScore = commits.reduce((s, c) => s + c.score, 0) / commits.length;
  console.log(`\nAverage: ${avgScore.toFixed(1)}/100`);
}
