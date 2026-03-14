/**
 * Audit trail — chain-of-custody tracking for findings,
 * recording who reviewed, voted, suppressed, or resolved each finding.
 *
 * All data stored locally in .judges-audit-trail/.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  findingId: string;
  action: "created" | "reviewed" | "suppressed" | "resolved" | "reopened" | "escalated" | "voted";
  actor: string;
  detail: string;
  timestamp: string;
}

interface AuditTrailStore {
  events: AuditEvent[];
  updatedAt: string;
}

const TRAIL_DIR = ".judges-audit-trail";
const TRAIL_FILE = join(TRAIL_DIR, "trail.json");

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(TRAIL_DIR)) mkdirSync(TRAIL_DIR, { recursive: true });
}

function loadStore(): AuditTrailStore {
  if (!existsSync(TRAIL_FILE)) return { events: [], updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(TRAIL_FILE, "utf-8"));
  } catch {
    return { events: [], updatedAt: new Date().toISOString() };
  }
}

function saveStore(store: AuditTrailStore): void {
  ensureDir();
  store.updatedAt = new Date().toISOString();
  writeFileSync(TRAIL_FILE, JSON.stringify(store, null, 2));
}

function generateId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function recordEvent(
  findingId: string,
  action: AuditEvent["action"],
  actor: string,
  detail: string,
): AuditEvent {
  const event: AuditEvent = {
    id: generateId(),
    findingId,
    action,
    actor,
    detail,
    timestamp: new Date().toISOString(),
  };

  const store = loadStore();
  store.events.push(event);
  if (store.events.length > 2000) store.events = store.events.slice(-2000);
  saveStore(store);

  return event;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAuditTrail(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges audit-trail — Finding chain-of-custody tracking

Usage:
  judges audit-trail --record --finding SEC-001 --action reviewed --actor "alice@co.com" --detail "Confirmed valid"
  judges audit-trail --finding SEC-001
  judges audit-trail --actor "alice@co.com"
  judges audit-trail --summary
  judges audit-trail --export

Options:
  --record                Record a new audit event
  --finding <id>          Filter by finding/rule ID
  --action <type>         Event type: created, reviewed, suppressed, resolved, reopened, escalated, voted
  --actor <name>          Who performed the action
  --detail <text>         Additional context
  --summary               Show audit trail summary
  --export                Export full audit trail
  --format json           JSON output
  --help, -h              Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Record event
  if (argv.includes("--record")) {
    const finding = argv.find((_a: string, i: number) => argv[i - 1] === "--finding") || "unknown";
    const action = (argv.find((_a: string, i: number) => argv[i - 1] === "--action") ||
      "reviewed") as AuditEvent["action"];
    const actor = argv.find((_a: string, i: number) => argv[i - 1] === "--actor") || "anonymous";
    const detail = argv.find((_a: string, i: number) => argv[i - 1] === "--detail") || "";

    const event = recordEvent(finding, action, actor, detail);
    if (format === "json") {
      console.log(JSON.stringify(event, null, 2));
    } else {
      console.log(`  ✅ Audit event recorded: ${event.id}`);
      console.log(`     ${event.action} ${event.findingId} by ${event.actor}`);
    }
    return;
  }

  // Summary
  if (argv.includes("--summary")) {
    const store = loadStore();
    const actionCounts = new Map<string, number>();
    const actorCounts = new Map<string, number>();
    for (const e of store.events) {
      actionCounts.set(e.action, (actionCounts.get(e.action) || 0) + 1);
      actorCounts.set(e.actor, (actorCounts.get(e.actor) || 0) + 1);
    }
    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            totalEvents: store.events.length,
            actions: Object.fromEntries(actionCounts),
            actors: Object.fromEntries(actorCounts),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Audit Trail Summary\n  ──────────────────────────`);
      console.log(`  Total events: ${store.events.length}`);
      if (actionCounts.size > 0) {
        console.log(`\n  By action:`);
        for (const [action, count] of actionCounts) {
          console.log(`    ${action.padEnd(15)} ${count}`);
        }
      }
      if (actorCounts.size > 0) {
        console.log(`\n  By actor:`);
        for (const [actor, count] of actorCounts) {
          console.log(`    ${actor.padEnd(25)} ${count} events`);
        }
      }
      console.log("");
    }
    return;
  }

  // Export
  if (argv.includes("--export")) {
    const store = loadStore();
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  // Filter by finding
  const findingFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--finding");
  const actorFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--actor");

  const store = loadStore();
  let events = store.events;
  if (findingFilter) events = events.filter((e) => e.findingId === findingFilter);
  if (actorFilter) events = events.filter((e) => e.actor === actorFilter);

  if (format === "json") {
    console.log(JSON.stringify(events, null, 2));
  } else {
    console.log(`\n  Audit Trail (${events.length} events)\n  ──────────────────────────`);
    for (const e of events.slice(-20)) {
      console.log(
        `    ${e.timestamp.slice(0, 16)}  ${e.action.padEnd(12)} ${e.findingId.padEnd(12)} ${e.actor} ${e.detail ? `— ${e.detail}` : ""}`,
      );
    }
    console.log("");
  }
}
