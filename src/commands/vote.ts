/**
 * Consensus voting — multi-developer voting on findings.
 * Aggregate team confidence in whether a finding is a true positive.
 *
 * Stored locally in .judges-votes.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Vote {
  voter: string;
  verdict: "agree" | "disagree" | "unsure";
  comment?: string;
  timestamp: string;
}

export interface VotedFinding {
  findingId: string;
  ruleId: string;
  title: string;
  votes: Vote[];
  consensus?: "true-positive" | "false-positive" | "disputed" | "pending";
  consensusScore: number; // -1.0 (all disagree) to +1.0 (all agree)
}

interface VoteDb {
  findings: VotedFinding[];
}

const VOTE_FILE = ".judges-votes.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(file = VOTE_FILE): VoteDb {
  if (!existsSync(file)) return { findings: [] };
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveDb(db: VoteDb, file = VOTE_FILE): void {
  writeFileSync(file, JSON.stringify(db, null, 2));
}

function computeConsensus(votes: Vote[]): { consensus: VotedFinding["consensus"]; score: number } {
  if (votes.length === 0) return { consensus: "pending", score: 0 };

  const weights = { agree: 1, disagree: -1, unsure: 0 };
  const totalWeight = votes.reduce((sum, v) => sum + weights[v.verdict], 0);
  const score = Math.round((totalWeight / votes.length) * 100) / 100;

  if (votes.length < 2) return { consensus: "pending", score };
  if (score > 0.5) return { consensus: "true-positive", score };
  if (score < -0.5) return { consensus: "false-positive", score };
  return { consensus: "disputed", score };
}

export function castVote(
  findingId: string,
  ruleId: string,
  title: string,
  voter: string,
  verdict: Vote["verdict"],
  comment?: string,
): VotedFinding {
  const db = loadDb();
  let finding = db.findings.find((f) => f.findingId === findingId);

  if (!finding) {
    finding = { findingId, ruleId, title, votes: [], consensusScore: 0 };
    db.findings.push(finding);
  }

  // Update or add vote
  const existing = finding.votes.findIndex((v) => v.voter === voter);
  const vote: Vote = { voter, verdict, comment, timestamp: new Date().toISOString() };
  if (existing >= 0) {
    finding.votes[existing] = vote;
  } else {
    finding.votes.push(vote);
  }

  const { consensus, score } = computeConsensus(finding.votes);
  finding.consensus = consensus;
  finding.consensusScore = score;

  saveDb(db);
  return finding;
}

export function getVoteStats(): {
  total: number;
  truePositive: number;
  falsePositive: number;
  disputed: number;
  pending: number;
  totalVotes: number;
  uniqueVoters: number;
} {
  const db = loadDb();
  const voters = new Set<string>();
  for (const f of db.findings) {
    for (const v of f.votes) voters.add(v.voter);
  }
  return {
    total: db.findings.length,
    truePositive: db.findings.filter((f) => f.consensus === "true-positive").length,
    falsePositive: db.findings.filter((f) => f.consensus === "false-positive").length,
    disputed: db.findings.filter((f) => f.consensus === "disputed").length,
    pending: db.findings.filter((f) => f.consensus === "pending").length,
    totalVotes: db.findings.reduce((s, f) => s + f.votes.length, 0),
    uniqueVoters: voters.size,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runVote(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges vote — Consensus voting on findings

Usage:
  judges vote --finding <id> --voter "Alice" --verdict agree
  judges vote --finding <id> --voter "Bob" --verdict disagree --comment "FP in test code"
  judges vote --list                     Show all voted findings
  judges vote --consensus                Show findings with consensus
  judges vote --disputed                 Show disputed findings
  judges vote --stats                    Voting statistics

Options:
  --finding <id>        Finding ID (ruleId:title format)
  --rule <id>           Rule ID for the finding
  --title <text>        Finding title
  --voter <name>        Voter name
  --verdict <v>         agree | disagree | unsure
  --comment <text>      Optional comment
  --list                List all voted findings
  --consensus           Show findings with clear consensus
  --disputed            Show disputed findings
  --stats               Show statistics
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Cast vote
  const findingId = argv.find((_a: string, i: number) => argv[i - 1] === "--finding");
  const voter = argv.find((_a: string, i: number) => argv[i - 1] === "--voter");
  const verdict = argv.find((_a: string, i: number) => argv[i - 1] === "--verdict") as Vote["verdict"] | undefined;

  if (findingId && voter && verdict) {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || findingId.split(":")[0];
    const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title") || findingId;
    const comment = argv.find((_a: string, i: number) => argv[i - 1] === "--comment");

    const result = castVote(findingId, ruleId, title, voter, verdict, comment);
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`  ✅ Vote recorded: ${voter} → ${verdict} on ${findingId}`);
      console.log(
        `     Consensus: ${result.consensus} (score: ${result.consensusScore}, ${result.votes.length} vote(s))`,
      );
    }
    return;
  }

  const db = loadDb();

  // List disputed
  if (argv.includes("--disputed")) {
    const disputed = db.findings.filter((f) => f.consensus === "disputed");
    if (format === "json") {
      console.log(JSON.stringify(disputed, null, 2));
    } else if (disputed.length === 0) {
      console.log("\n  No disputed findings.\n");
    } else {
      console.log(`\n  Disputed Findings (${disputed.length})\n  ──────────────────`);
      for (const f of disputed) {
        const agree = f.votes.filter((v) => v.verdict === "agree").length;
        const disagree = f.votes.filter((v) => v.verdict === "disagree").length;
        console.log(`    ${f.ruleId.padEnd(12)} ${f.title.slice(0, 40)} — ${agree} agree, ${disagree} disagree`);
      }
      console.log("");
    }
    return;
  }

  // Consensus view
  if (argv.includes("--consensus")) {
    const decided = db.findings.filter((f) => f.consensus === "true-positive" || f.consensus === "false-positive");
    if (format === "json") {
      console.log(JSON.stringify(decided, null, 2));
    } else {
      console.log(`\n  Consensus Findings (${decided.length})\n  ────────────────────`);
      for (const f of decided) {
        const icon = f.consensus === "true-positive" ? "✅" : "❌";
        console.log(
          `    ${icon} ${f.ruleId.padEnd(12)} ${f.consensus?.padEnd(16)} score: ${f.consensusScore} (${f.votes.length} votes)`,
        );
      }
      console.log("");
    }
    return;
  }

  // Stats
  if (argv.includes("--stats")) {
    const s = getVoteStats();
    if (format === "json") {
      console.log(JSON.stringify(s, null, 2));
    } else {
      console.log(`
  Voting Statistics
  ─────────────────
  Findings voted on: ${s.total}
  True positives:    ${s.truePositive}
  False positives:   ${s.falsePositive}
  Disputed:          ${s.disputed}
  Pending:           ${s.pending}
  Total votes cast:  ${s.totalVotes}
  Unique voters:     ${s.uniqueVoters}
`);
    }
    return;
  }

  // Default: list all
  if (db.findings.length === 0) {
    console.log("\n  No votes recorded. Use --finding and --voter to cast a vote.\n");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(db.findings, null, 2));
  } else {
    console.log(`\n  All Voted Findings (${db.findings.length})\n  ───────────────────────`);
    for (const f of db.findings) {
      const icon =
        f.consensus === "true-positive"
          ? "✅"
          : f.consensus === "false-positive"
            ? "❌"
            : f.consensus === "disputed"
              ? "⚠️"
              : "⏳";
      console.log(
        `    ${icon} ${f.ruleId.padEnd(12)} ${f.consensus?.padEnd(16) || "pending".padEnd(16)} ${f.votes.length} vote(s) — ${f.title.slice(0, 40)}`,
      );
    }
    console.log("");
  }
}
