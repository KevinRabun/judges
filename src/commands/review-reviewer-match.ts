import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-reviewer-match ──────────────────────────────────────────
   Match reviewers to changes based on expertise, finding domains,
   and historical review patterns. Uses local team config — no
   external data processing.
   ─────────────────────────────────────────────────────────────────── */

interface ReviewerProfile {
  name: string;
  expertise: string[];
  maxLoad: number;
  currentLoad: number;
}

interface ReviewerMatch {
  reviewer: string;
  matchScore: number;
  matchedDomains: string[];
  available: boolean;
  recommendation: string;
}

function matchReviewers(findings: Finding[], reviewers: ReviewerProfile[]): ReviewerMatch[] {
  const findingDomains = new Set<string>();
  for (const f of findings) {
    const domain = f.ruleId.split("-")[0].toLowerCase();
    findingDomains.add(domain);
    if (f.severity === "critical" || f.severity === "high") {
      findingDomains.add("security");
    }
  }

  const matches: ReviewerMatch[] = [];
  for (const reviewer of reviewers) {
    const matched: string[] = [];
    for (const exp of reviewer.expertise) {
      if (findingDomains.has(exp.toLowerCase())) {
        matched.push(exp);
      }
    }

    const available = reviewer.currentLoad < reviewer.maxLoad;
    const matchScore = reviewer.expertise.length > 0 ? (matched.length / reviewer.expertise.length) * 100 : 0;

    let recommendation: string;
    if (!available) {
      recommendation = "Currently at capacity";
    } else if (matched.length >= 2) {
      recommendation = "Strong match — assign as primary reviewer";
    } else if (matched.length === 1) {
      recommendation = "Partial match — assign as secondary reviewer";
    } else {
      recommendation = "No domain match — skip unless needed";
    }

    matches.push({
      reviewer: reviewer.name,
      matchScore: Math.round(matchScore),
      matchedDomains: matched,
      available,
      recommendation,
    });
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches;
}

export function runReviewReviewerMatch(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-reviewer-match [options]

Match reviewers to changes based on expertise.

Options:
  --report <path>      Path to verdict JSON file
  --team <path>        Path to team profiles JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const teamIdx = argv.indexOf("--team");
  const teamPath =
    teamIdx !== -1 && argv[teamIdx + 1]
      ? join(process.cwd(), argv[teamIdx + 1])
      : join(process.cwd(), ".judges", "team-profiles.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  if (!existsSync(teamPath)) {
    console.log(`No team profiles found at: ${teamPath}`);
    console.log("Create .judges/team-profiles.json with reviewer expertise data.");
    console.log("\nExample:");
    console.log(
      JSON.stringify(
        {
          reviewers: [
            { name: "alice", expertise: ["SEC", "AUTH", "security"], maxLoad: 5, currentLoad: 2 },
            { name: "bob", expertise: ["PERF", "OPT", "performance"], maxLoad: 4, currentLoad: 1 },
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  const teamData = JSON.parse(readFileSync(teamPath, "utf-8"));
  const reviewers: ReviewerProfile[] = teamData.reviewers ?? [];

  if (findings.length === 0) {
    console.log("No findings — any reviewer can handle this.");
    return;
  }

  const matches = matchReviewers(findings, reviewers);

  if (format === "json") {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  console.log("\n=== Reviewer Matching ===\n");
  for (const m of matches) {
    const status = m.available ? "Available" : "At capacity";
    console.log(`${m.reviewer} (${m.matchScore}% match) — ${status}`);
    if (m.matchedDomains.length > 0) {
      console.log(`  Domains: ${m.matchedDomains.join(", ")}`);
    }
    console.log(`  → ${m.recommendation}`);
    console.log();
  }
}
