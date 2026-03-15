/**
 * Review-session-replay — Replay and inspect past review sessions.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionEntry {
  id: string;
  file: string;
  timestamp: string;
  verdict: string;
  score: number;
  findingCount: number;
  duration: number;
}

interface SessionStore {
  sessions: SessionEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSessionReplay(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-sessions.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const sessionIdx = argv.indexOf("--session");
  const sessionId = sessionIdx >= 0 ? argv[sessionIdx + 1] : "";
  const lastN = argv.indexOf("--last");
  const lastCount = lastN >= 0 ? parseInt(argv[lastN + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-session-replay — Replay past review sessions

Usage:
  judges review-session-replay [--store <path>] [--format table|json]
  judges review-session-replay --session <id> [--store <path>]
  judges review-session-replay --last <n> [--store <path>]

Options:
  --store <path>     Session store file (default: .judges-sessions.json)
  --session <id>     Show details for a specific session
  --last <n>         Show only the last N sessions
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No session store found at: ${storePath}`);
    console.log("Sessions are recorded automatically during reviews.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as SessionStore;

  if (sessionId) {
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      process.exitCode = 1;
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(session, null, 2));
      return;
    }

    console.log("\nSession Details");
    console.log("═".repeat(50));
    console.log(`  ID:        ${session.id}`);
    console.log(`  File:      ${session.file}`);
    console.log(`  Timestamp: ${session.timestamp}`);
    console.log(`  Verdict:   ${session.verdict}`);
    console.log(`  Score:     ${session.score}/100`);
    console.log(`  Findings:  ${session.findingCount}`);
    console.log(`  Duration:  ${session.duration}ms`);
    console.log("═".repeat(50));
    return;
  }

  let sessions = store.sessions;
  if (lastCount > 0) {
    sessions = sessions.slice(-lastCount);
  }

  if (format === "json") {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  console.log(`\nReview Sessions (${sessions.length})`);
  console.log("═".repeat(80));
  console.log(
    `  ${"ID".padEnd(15)} ${"File".padEnd(25)} ${"Verdict".padEnd(10)} ${"Score".padEnd(8)} ${"Findings".padEnd(10)} Date`,
  );
  console.log("  " + "─".repeat(75));

  for (const s of sessions) {
    const fileName = s.file.length > 23 ? "..." + s.file.slice(-20) : s.file;
    console.log(
      `  ${s.id.padEnd(15)} ${fileName.padEnd(25)} ${s.verdict.padEnd(10)} ${String(s.score).padEnd(8)} ${String(s.findingCount).padEnd(10)} ${s.timestamp.slice(0, 10)}`,
    );
  }

  const avgScore = sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.score, 0) / sessions.length) : 0;
  console.log(`\n  Total sessions: ${sessions.length} | Average score: ${avgScore}`);
  console.log("═".repeat(80));
}
