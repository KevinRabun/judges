/**
 * Team trust — aggregate trust profiles across team members to
 * build collective trust profiles with per-team sensitivity.
 *
 * All data stored locally in `.judges-team-trust/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemberRecord {
  name: string;
  team: string;
  evaluations: number;
  passCount: number;
  failCount: number;
  falsePositives: number;
  truePositives: number;
  avgScore: number;
  lastUpdated: string;
}

interface TeamProfile {
  team: string;
  members: number;
  avgTrustScore: number;
  totalEvaluations: number;
  fpRate: number;
  tpRate: number;
  sensitivity: "relaxed" | "normal" | "strict";
  recommendation: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-team-trust";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadMembers(): MemberRecord[] {
  const file = join(DATA_DIR, "members.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveMembers(members: MemberRecord[]): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, "members.json"), JSON.stringify(members, null, 2));
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function computeTeamProfiles(members: MemberRecord[]): TeamProfile[] {
  const teams = new Map<string, MemberRecord[]>();
  for (const m of members) {
    const list = teams.get(m.team) || [];
    list.push(m);
    teams.set(m.team, list);
  }

  const profiles: TeamProfile[] = [];
  for (const [team, teamMembers] of teams) {
    const totalEvals = teamMembers.reduce((s, m) => s + m.evaluations, 0);
    const totalFP = teamMembers.reduce((s, m) => s + m.falsePositives, 0);
    const totalTP = teamMembers.reduce((s, m) => s + m.truePositives, 0);
    const avgScore =
      teamMembers.length > 0 ? Math.round(teamMembers.reduce((s, m) => s + m.avgScore, 0) / teamMembers.length) : 0;
    const fpRate = totalEvals > 0 ? Math.round((totalFP / totalEvals) * 100) : 0;
    const tpRate = totalEvals > 0 ? Math.round((totalTP / totalEvals) * 100) : 0;

    let sensitivity: "relaxed" | "normal" | "strict";
    let recommendation: string;

    if (avgScore >= 80 && fpRate > 30) {
      sensitivity = "relaxed";
      recommendation = "High FP rate suggests judges are too strict for this team — relax non-critical judges";
    } else if (avgScore < 60) {
      sensitivity = "strict";
      recommendation = "Low scores suggest team needs stricter evaluation and mentoring";
    } else {
      sensitivity = "normal";
      recommendation = "Team performing at expected level — maintain current settings";
    }

    profiles.push({
      team,
      members: teamMembers.length,
      avgTrustScore: avgScore,
      totalEvaluations: totalEvals,
      fpRate,
      tpRate,
      sensitivity,
      recommendation,
    });
  }

  return profiles.sort((a, b) => b.avgTrustScore - a.avgTrustScore);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTeamTrust(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges team-trust — Team-wide trust profile aggregation

Usage:
  judges team-trust --record --member "alice" --team "backend" --score 85 --tp
  judges team-trust --record --member "copilot" --team "ai" --score 60 --fp
  judges team-trust --show
  judges team-trust --team "backend"

Options:
  --record              Record feedback for a team member
  --member <name>       Member name
  --team <name>         Team name
  --score <n>           Evaluation score (0-100)
  --pass                Record pass
  --fail                Record fail
  --fp                  Record false positive
  --tp                  Record true positive
  --show                Show all team profiles
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isRecord = argv.includes("--record");
  const _isShow = argv.includes("--show");
  const memberName = argv.find((_a: string, i: number) => argv[i - 1] === "--member") || "";
  const teamName = argv.find((_a: string, i: number) => argv[i - 1] === "--team") || "";
  const scoreArg = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
  const isPass = argv.includes("--pass");
  const isFail = argv.includes("--fail");
  const isFp = argv.includes("--fp");
  const isTp = argv.includes("--tp");

  if (isRecord) {
    if (!memberName || !teamName) {
      console.error("  --member and --team are required");
      return;
    }

    const members = loadMembers();
    let rec = members.find((m) => m.name === memberName && m.team === teamName);
    if (!rec) {
      rec = {
        name: memberName,
        team: teamName,
        evaluations: 0,
        passCount: 0,
        failCount: 0,
        falsePositives: 0,
        truePositives: 0,
        avgScore: 0,
        lastUpdated: "",
      };
      members.push(rec);
    }

    rec.evaluations++;
    if (isPass) rec.passCount++;
    if (isFail) rec.failCount++;
    if (isFp) rec.falsePositives++;
    if (isTp) rec.truePositives++;
    rec.avgScore = Math.round((rec.avgScore * (rec.evaluations - 1) + scoreArg) / rec.evaluations);
    rec.lastUpdated = new Date().toISOString();

    saveMembers(members);
    console.log(`  ✅ Recorded for ${memberName}@${teamName}: eval #${rec.evaluations}`);
    return;
  }

  const members = loadMembers();
  if (members.length === 0) {
    console.log("  No team data yet. Use --record to add feedback.");
    return;
  }

  const profiles = computeTeamProfiles(members);

  // Filter by team if specified
  const filtered = teamName ? profiles.filter((p) => p.team === teamName) : profiles;

  if (format === "json") {
    console.log(
      JSON.stringify(
        { profiles: filtered, totalMembers: members.length, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `\n  Team Trust Profiles — ${profiles.length} team(s), ${members.length} member(s)\n  ──────────────────────────`,
    );

    for (const p of filtered) {
      const icon = p.avgTrustScore >= 80 ? "🟢" : p.avgTrustScore >= 60 ? "🟡" : "🔴";
      console.log(`\n    ${icon} ${p.team} (${p.members} members)`);
      console.log(
        `        Trust: ${p.avgTrustScore}/100 | Evals: ${p.totalEvaluations} | FP: ${p.fpRate}% | TP: ${p.tpRate}%`,
      );
      console.log(`        Sensitivity: ${p.sensitivity}`);
      console.log(`        💡 ${p.recommendation}`);

      // Show individual members
      const teamMembers = members.filter((m) => m.team === p.team).sort((a, b) => b.avgScore - a.avgScore);
      for (const m of teamMembers) {
        const mIcon = m.avgScore >= 80 ? "✓" : m.avgScore >= 60 ? "~" : "✗";
        console.log(
          `          ${mIcon} ${m.name.padEnd(20)} score: ${m.avgScore} | evals: ${m.evaluations} | FP: ${m.falsePositives}`,
        );
      }
    }
    console.log("");
  }
}
