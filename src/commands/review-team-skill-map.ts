import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-team-skill-map ──────────────────────────────────────────
   Build a team skill map from review history. Identifies which
   rule domains each contributor has expertise in (low finding
   rates) versus areas needing growth. Useful for assigning
   reviewers or planning training.
   ─────────────────────────────────────────────────────────────────── */

interface SkillEntry {
  domain: string;
  level: string;
  findingRate: number;
  reviewCount: number;
}

interface MemberSkillMap {
  member: string;
  skills: SkillEntry[];
  strongestDomain: string;
  weakestDomain: string;
}

function extractDomain(ruleId: string): string {
  const parts = ruleId.split("/");
  return parts.length > 1 ? parts[0] : "general";
}

function buildSkillMaps(historyDir: string): MemberSkillMap[] {
  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir) as unknown as string[];
  const jsonFiles = files.filter((f) => String(f).endsWith(".json"));

  const memberData: Record<string, Record<string, { reviews: number; findings: number }>> = {};

  for (const file of jsonFiles) {
    const member = String(file)
      .replace(/\.json$/, "")
      .replace(/[-_]\d+$/, "");
    const raw = readFileSync(join(historyDir, String(file)), "utf-8");

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(raw) as TribunalVerdict;
    } catch {
      continue;
    }

    if (!memberData[member]) memberData[member] = {};

    const domainCounts: Record<string, number> = {};
    for (const f of verdict.findings ?? []) {
      const domain = extractDomain(f.ruleId);
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
    }

    const allDomains = new Set(Object.keys(domainCounts));
    if (allDomains.size === 0) allDomains.add("general");

    for (const domain of allDomains) {
      if (!memberData[member][domain]) {
        memberData[member][domain] = { reviews: 0, findings: 0 };
      }
      memberData[member][domain].reviews += 1;
      memberData[member][domain].findings += domainCounts[domain] ?? 0;
    }
  }

  const maps: MemberSkillMap[] = [];

  for (const [member, domains] of Object.entries(memberData)) {
    const skills: SkillEntry[] = [];

    for (const [domain, stats] of Object.entries(domains)) {
      const rate = stats.reviews > 0 ? stats.findings / stats.reviews : 0;

      let level: string;
      if (rate <= 0.5) level = "expert";
      else if (rate <= 1.5) level = "proficient";
      else if (rate <= 3) level = "developing";
      else level = "beginner";

      skills.push({ domain, level, findingRate: Math.round(rate * 10) / 10, reviewCount: stats.reviews });
    }

    skills.sort((a, b) => a.findingRate - b.findingRate);

    const strongest = skills.length > 0 ? skills[0].domain : "none";
    const weakest = skills.length > 0 ? skills[skills.length - 1].domain : "none";

    maps.push({ member, skills, strongestDomain: strongest, weakestDomain: weakest });
  }

  return maps;
}

export function runReviewTeamSkillMap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-team-skill-map [options]

Build a team skill map from review history.

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

  const maps = buildSkillMaps(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(maps, null, 2));
    return;
  }

  console.log(`\n=== Team Skill Map (${maps.length} members) ===\n`);

  if (maps.length === 0) {
    console.log("No review history found. Run some reviews first.");
    return;
  }

  for (const m of maps) {
    console.log(`  ${m.member}`);
    console.log(`    Strongest: ${m.strongestDomain}  |  Weakest: ${m.weakestDomain}`);
    for (const s of m.skills) {
      console.log(
        `    ${s.domain.padEnd(20)} ${s.level.padEnd(12)} (rate: ${s.findingRate}, reviews: ${s.reviewCount})`,
      );
    }
    console.log();
  }
}
