/**
 * Review-session — Group reviews into named sessions for project phases.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionEntry {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  reviewCount: number;
  findingCount: number;
  status: "active" | "closed";
}

interface SessionStore {
  version: string;
  sessions: SessionEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const SESSION_FILE = ".judges/sessions.json";

function loadStore(): SessionStore {
  if (!existsSync(SESSION_FILE)) return { version: "1.0.0", sessions: [] };
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as SessionStore;
  } catch {
    return { version: "1.0.0", sessions: [] };
  }
}

function saveStore(store: SessionStore): void {
  mkdirSync(dirname(SESSION_FILE), { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `ses-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSession(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-session — Group reviews into named sessions

Usage:
  judges review-session start --name "sprint-42"
  judges review-session end
  judges review-session log --reviews 5 --findings 12
  judges review-session list
  judges review-session show --id <id>
  judges review-session clear

Subcommands:
  start                 Start a new session
  end                   End the active session
  log                   Log review activity to active session
  list                  List all sessions
  show                  Show session details
  clear                 Clear all sessions

Options:
  --name <text>         Session name
  --id <id>             Session ID
  --reviews <n>         Number of reviews to log
  --findings <n>        Number of findings to log
  --format json         JSON output
  --help, -h            Show this help

Sessions stored in .judges/sessions.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["start", "end", "log", "list", "show", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "start") {
    const name =
      argv.find((_a: string, i: number) => argv[i - 1] === "--name") || `session-${store.sessions.length + 1}`;

    // Close any active session
    for (const s of store.sessions) {
      if (s.status === "active") {
        s.status = "closed";
        s.endedAt = new Date().toISOString();
      }
    }

    const session: SessionEntry = {
      id: generateId(),
      name,
      startedAt: new Date().toISOString(),
      endedAt: "",
      reviewCount: 0,
      findingCount: 0,
      status: "active",
    };
    store.sessions.push(session);
    saveStore(store);
    console.log(`Session started: "${name}" (${session.id})`);
    return;
  }

  if (subcommand === "end") {
    const active = store.sessions.find((s) => s.status === "active");
    if (!active) {
      console.log("No active session.");
      return;
    }
    active.status = "closed";
    active.endedAt = new Date().toISOString();
    saveStore(store);
    console.log(`Session ended: "${active.name}" — ${active.reviewCount} reviews, ${active.findingCount} findings.`);
    return;
  }

  if (subcommand === "log") {
    const active = store.sessions.find((s) => s.status === "active");
    if (!active) {
      console.log("No active session. Start one with 'judges review-session start'.");
      return;
    }
    const reviews = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--reviews") || "1", 10);
    const findings = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0", 10);
    active.reviewCount += reviews;
    active.findingCount += findings;
    saveStore(store);
    console.log(`Logged to "${active.name}": +${reviews} reviews, +${findings} findings.`);
    return;
  }

  if (subcommand === "show") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const session = store.sessions.find((s) => s.id === id);
    if (!session) {
      console.log(`Session ${id} not found.`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(session, null, 2));
      return;
    }
    console.log(`\nSession: ${session.name} (${session.id})`);
    console.log(`  Status: ${session.status}`);
    console.log(`  Started: ${session.startedAt}`);
    console.log(`  Ended: ${session.endedAt || "(active)"}`);
    console.log(`  Reviews: ${session.reviewCount}  Findings: ${session.findingCount}`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", sessions: [] });
    console.log("Sessions cleared.");
    return;
  }

  // Default: list
  if (store.sessions.length === 0) {
    console.log("No sessions. Start one with 'judges review-session start'.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.sessions, null, 2));
    return;
  }
  console.log("\nReview Sessions:");
  console.log("─".repeat(60));
  for (const s of store.sessions) {
    const status = s.status === "active" ? "[ACTIVE]" : "[closed]";
    console.log(`  ${s.id}  ${status}  "${s.name}"  reviews=${s.reviewCount}  findings=${s.findingCount}`);
  }
  console.log("─".repeat(60));
}
