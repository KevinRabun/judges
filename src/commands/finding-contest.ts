/**
 * Finding contest — gamified challenge mode where developers compete
 * to fix the most findings in a codebase within a time window.
 *
 * Results stored locally in `.judges-contests/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContestEntry {
  participant: string;
  fixCount: number;
  sevPoints: number;
  startedAt: string;
  fixes: Array<{ ruleId: string; severity: string; fixedAt: string }>;
}

interface Contest {
  id: string;
  durationMinutes: number;
  startedAt: string;
  endsAt: string;
  status: "active" | "completed";
  initialFindings: number;
  entries: ContestEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-contests";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadContest(id: string): Contest | null {
  const file = join(DATA_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function saveContest(contest: Contest): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, `${contest.id}.json`), JSON.stringify(contest, null, 2));
}

function getActiveContest(): Contest | null {
  ensureDir();
  const indexFile = join(DATA_DIR, "active.json");
  if (!existsSync(indexFile)) return null;
  try {
    const data = JSON.parse(readFileSync(indexFile, "utf-8"));
    return loadContest(data.id);
  } catch {
    return null;
  }
}

function setActiveContest(id: string | null): void {
  ensureDir();
  const indexFile = join(DATA_DIR, "active.json");
  if (id) writeFileSync(indexFile, JSON.stringify({ id }));
  else if (existsSync(indexFile)) writeFileSync(indexFile, "{}");
}

// ─── Scoring ────────────────────────────────────────────────────────────────

const SEVERITY_POINTS: Record<string, number> = { critical: 10, high: 5, medium: 3, low: 1 };

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingContest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-contest — Gamified fix challenge

Usage:
  judges finding-contest --start --duration 60 --findings 25
  judges finding-contest --fix --participant "alice" --rule SEC-001 --severity high
  judges finding-contest --leaderboard
  judges finding-contest --end

Options:
  --start               Start a new contest
  --duration <min>      Contest duration in minutes (default: 60)
  --findings <n>        Initial finding count (default: 20)
  --fix                 Record a fix
  --participant <name>  Participant name
  --rule <id>           Rule ID that was fixed
  --severity <level>    Severity of the fixed finding
  --leaderboard         Show current leaderboard
  --end                 End active contest and show final results
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isStart = argv.includes("--start");
  const isFix = argv.includes("--fix");
  const isLeaderboard = argv.includes("--leaderboard");
  const isEnd = argv.includes("--end");

  if (isStart) {
    const duration = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--duration") || "60");
    const findings = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "20");

    const now = new Date();
    const contest: Contest = {
      id: `contest-${Date.now()}`,
      durationMinutes: duration,
      startedAt: now.toISOString(),
      endsAt: new Date(now.getTime() + duration * 60000).toISOString(),
      status: "active",
      initialFindings: findings,
      entries: [],
    };

    saveContest(contest);
    setActiveContest(contest.id);

    console.log(`\n  🏁 Contest Started!`);
    console.log(`  ──────────────────────────`);
    console.log(`    ID: ${contest.id}`);
    console.log(`    Duration: ${duration} minutes`);
    console.log(`    Findings to fix: ${findings}`);
    console.log(`    Ends at: ${contest.endsAt}`);
    console.log(`\n    Use: judges finding-contest --fix --participant "name" --rule RULE-ID --severity level\n`);
    return;
  }

  if (isFix) {
    const contest = getActiveContest();
    if (!contest || contest.status !== "active") {
      console.error("  No active contest. Use --start to begin one.");
      return;
    }

    // Check if contest has expired
    if (new Date() > new Date(contest.endsAt)) {
      contest.status = "completed";
      saveContest(contest);
      setActiveContest(null);
      console.log("  ⏰ Contest has ended! Use --leaderboard to see results.");
      return;
    }

    const participant = argv.find((_a: string, i: number) => argv[i - 1] === "--participant") || "";
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "unknown";
    const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "medium";

    if (!participant) {
      console.error("  --participant is required");
      return;
    }

    let entry = contest.entries.find((e) => e.participant === participant);
    if (!entry) {
      entry = { participant, fixCount: 0, sevPoints: 0, startedAt: new Date().toISOString(), fixes: [] };
      contest.entries.push(entry);
    }

    const points = SEVERITY_POINTS[severity] || 3;
    entry.fixCount++;
    entry.sevPoints += points;
    entry.fixes.push({ ruleId, severity, fixedAt: new Date().toISOString() });

    saveContest(contest);
    console.log(`  ✅ ${participant} fixed ${ruleId} [${severity}] — +${points} points (total: ${entry.sevPoints})`);
    return;
  }

  if (isLeaderboard || isEnd) {
    const contest =
      getActiveContest() ||
      (() => {
        // Try to find latest completed contest
        ensureDir();
        return null;
      })();

    if (!contest) {
      console.error("  No contest found. Use --start to begin one.");
      return;
    }

    if (isEnd && contest.status === "active") {
      contest.status = "completed";
      saveContest(contest);
      setActiveContest(null);
    }

    const sorted = [...contest.entries].sort((a, b) => b.sevPoints - a.sevPoints);
    const totalFixed = sorted.reduce((s, e) => s + e.fixCount, 0);

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            contest: { id: contest.id, status: contest.status, duration: contest.durationMinutes },
            leaderboard: sorted,
            totalFixed,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } else {
      const statusIcon = contest.status === "active" ? "🟢 ACTIVE" : "🏁 COMPLETED";
      console.log(`\n  Finding Contest ${statusIcon}\n  ──────────────────────────`);
      console.log(
        `  ID: ${contest.id} | Duration: ${contest.durationMinutes}m | Findings: ${contest.initialFindings} → ${contest.initialFindings - totalFixed}\n`,
      );

      if (sorted.length === 0) {
        console.log("    No fixes recorded yet!");
      } else {
        for (let i = 0; i < sorted.length; i++) {
          const e = sorted[i];
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
          console.log(
            `    ${medal} ${e.participant.padEnd(20)} ${String(e.sevPoints).padStart(5)} pts | ${e.fixCount} fixes`,
          );
        }
      }

      if (contest.status === "active") {
        const remaining = Math.max(0, Math.floor((new Date(contest.endsAt).getTime() - Date.now()) / 60000));
        console.log(`\n    ⏱️ ${remaining} minutes remaining`);
      }
      console.log("");
    }
    return;
  }

  console.log("  Use --start, --fix, --leaderboard, or --end. See --help for details.");
}
