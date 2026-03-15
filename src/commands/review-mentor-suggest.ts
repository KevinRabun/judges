import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-mentor-suggest ──────────────────────────────────────────
   Suggest mentor pairings by analysing which rule domains appear
   frequently in findings, then matching reviewers who have
   demonstrated expertise (low finding rates) with those who haven't.
   All data comes from local verdict history files.
   ─────────────────────────────────────────────────────────────────── */

interface ReviewerProfile {
  reviewer: string;
  strengths: string[];
  weaknesses: string[];
}

interface MentorPairing {
  mentee: string;
  mentor: string;
  domain: string;
  reason: string;
}

function extractDomain(ruleId: string): string {
  const parts = ruleId.split("/");
  return parts.length > 1 ? parts[0] : "general";
}

function buildProfiles(historyDir: string): ReviewerProfile[] {
  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir) as unknown as string[];
  const jsonFiles = files.filter((f) => String(f).endsWith(".json"));

  const domainScores: Record<string, Record<string, { total: number; findings: number }>> = {};

  for (const file of jsonFiles) {
    const raw = readFileSync(join(historyDir, String(file)), "utf-8");
    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(raw) as TribunalVerdict;
    } catch {
      continue;
    }

    const reviewer = String(file)
      .replace(/\.json$/, "")
      .replace(/[-_]\d+$/, "");

    if (!domainScores[reviewer]) domainScores[reviewer] = {};

    const domainCounts: Record<string, number> = {};
    for (const f of verdict.findings ?? []) {
      const domain = extractDomain(f.ruleId);
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
    }

    for (const domain of Object.keys(domainCounts)) {
      if (!domainScores[reviewer][domain]) {
        domainScores[reviewer][domain] = { total: 0, findings: 0 };
      }
      domainScores[reviewer][domain].total += 1;
      domainScores[reviewer][domain].findings += domainCounts[domain];
    }
  }

  const profiles: ReviewerProfile[] = [];
  for (const [reviewer, domains] of Object.entries(domainScores)) {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const [domain, stats] of Object.entries(domains)) {
      const avgFindings = stats.findings / stats.total;
      if (avgFindings <= 1) {
        strengths.push(domain);
      } else if (avgFindings >= 3) {
        weaknesses.push(domain);
      }
    }

    profiles.push({ reviewer, strengths, weaknesses });
  }

  return profiles;
}

function suggestPairings(profiles: ReviewerProfile[]): MentorPairing[] {
  const pairings: MentorPairing[] = [];

  for (const mentee of profiles) {
    for (const weakness of mentee.weaknesses) {
      const mentor = profiles.find((p) => p.reviewer !== mentee.reviewer && p.strengths.includes(weakness));
      if (mentor) {
        pairings.push({
          mentee: mentee.reviewer,
          mentor: mentor.reviewer,
          domain: weakness,
          reason: `${mentor.reviewer} shows strength in "${weakness}" where ${mentee.reviewer} has frequent findings`,
        });
      }
    }
  }

  return pairings;
}

export function runReviewMentorSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-mentor-suggest [options]

Suggest mentor pairings based on expertise gaps in review history.

Options:
  --history <dir>      Directory with verdict JSON files (default: .judges/history)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const histIdx = argv.indexOf("--history");
  const historyDir =
    histIdx !== -1 && argv[histIdx + 1]
      ? join(process.cwd(), argv[histIdx + 1])
      : join(process.cwd(), ".judges", "history");

  const profiles = buildProfiles(historyDir);

  if (profiles.length === 0) {
    console.log("No reviewer profiles found. Run some reviews first.");
    return;
  }

  const pairings = suggestPairings(profiles);

  if (format === "json") {
    console.log(JSON.stringify({ profiles, pairings }, null, 2));
    return;
  }

  console.log(`\n=== Mentor Suggestions (${pairings.length} pairings) ===\n`);

  if (pairings.length === 0) {
    console.log("No clear mentor pairings identified — team expertise is well-distributed.");
    return;
  }

  for (const p of pairings) {
    console.log(`  ${p.mentee}  <--  ${p.mentor}  (domain: ${p.domain})`);
    console.log(`           ${p.reason}`);
    console.log();
  }
}
