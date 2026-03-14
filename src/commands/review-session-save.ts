/**
 * Review-session-save — Save and restore review sessions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  files: string[];
  verdictPaths: string[];
  notes: string;
  status: "in-progress" | "completed" | "paused";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sessionDir(): string {
  return ".judges/sessions";
}

function sessionPath(id: string): string {
  return `${sessionDir()}/${id}.json`;
}

function generateId(): string {
  const now = new Date();
  return `session-${now.toISOString().slice(0, 10)}-${now.getTime().toString(36)}`;
}

function loadSession(id: string): ReviewSession | null {
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function saveSession(session: ReviewSession): void {
  const dir = sessionDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  session.updatedAt = new Date().toISOString();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSessionSave(argv: string[]): void {
  const sub = argv[0];

  if (argv.includes("--help") || argv.includes("-h") || !sub) {
    console.log(`
judges review-session-save — Save and restore review sessions

Usage:
  judges review-session-save create [--note <text>]
  judges review-session-save add --id <session-id> --file <verdict.json>
  judges review-session-save show --id <session-id> [--format table|json]
  judges review-session-save complete --id <session-id>
  judges review-session-save pause --id <session-id>
  judges review-session-save resume --id <session-id>

Subcommands:
  create      Create a new review session
  add         Add a verdict file to a session
  show        Show session details
  complete    Mark session as completed
  pause       Mark session as paused
  resume      Resume a paused session

Options:
  --id <id>          Session ID
  --file <path>      Verdict file to add
  --note <text>      Session note
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const idIdx = argv.indexOf("--id");
  const fileIdx = argv.indexOf("--file");
  const noteIdx = argv.indexOf("--note");
  const formatIdx = argv.indexOf("--format");
  const id = idIdx >= 0 ? argv[idIdx + 1] : undefined;
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const note = noteIdx >= 0 ? argv[noteIdx + 1] : "";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (sub === "create") {
    const session: ReviewSession = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: [],
      verdictPaths: [],
      notes: note,
      status: "in-progress",
    };
    saveSession(session);
    console.log(`Created session: ${session.id}`);
    return;
  }

  if (!id) {
    console.error("Error: --id required");
    process.exitCode = 1;
    return;
  }

  if (sub === "add") {
    if (!filePath) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(filePath)) {
      console.error(`Error: not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    const session = loadSession(id);
    if (!session) {
      console.error(`Error: session not found: ${id}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }

    session.verdictPaths.push(filePath);
    session.files.push(`${filePath} (${verdict.findings.length} findings)`);
    saveSession(session);
    console.log(`Added ${filePath} to session ${id}`);
    return;
  }

  if (sub === "show") {
    const session = loadSession(id);
    if (!session) {
      console.error(`Error: session not found: ${id}`);
      process.exitCode = 1;
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(session, null, 2));
      return;
    }

    console.log(`\nReview Session: ${session.id}`);
    console.log("═".repeat(50));
    console.log(`  Status:    ${session.status}`);
    console.log(`  Created:   ${session.createdAt}`);
    console.log(`  Updated:   ${session.updatedAt}`);
    console.log(`  Verdicts:  ${session.verdictPaths.length}`);
    if (session.notes) console.log(`  Notes:     ${session.notes}`);
    console.log("═".repeat(50));

    if (session.files.length > 0) {
      console.log("\nFiles:");
      for (const f of session.files) {
        console.log(`  - ${f}`);
      }
    }
    return;
  }

  const statusMap: Record<string, "completed" | "paused" | "in-progress"> = {
    complete: "completed",
    pause: "paused",
    resume: "in-progress",
  };

  const newStatus = statusMap[sub];
  if (newStatus) {
    const session = loadSession(id);
    if (!session) {
      console.error(`Error: session not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    session.status = newStatus;
    saveSession(session);
    console.log(`Session ${id} marked as ${newStatus}`);
    return;
  }

  console.error(`Error: unknown subcommand: ${sub}`);
  process.exitCode = 1;
}
