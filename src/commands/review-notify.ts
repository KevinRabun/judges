/**
 * Review-notify — Local notification configuration for review events.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotifyRule {
  id: string;
  event: string;
  condition: string;
  action: string;
  enabled: boolean;
  createdAt: string;
}

interface NotifyStore {
  version: string;
  rules: NotifyRule[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const NOTIFY_FILE = join(".judges", "notify-rules.json");

function loadNotifyStore(): NotifyStore {
  if (!existsSync(NOTIFY_FILE)) return { version: "1.0.0", rules: [] };
  try {
    return JSON.parse(readFileSync(NOTIFY_FILE, "utf-8")) as NotifyStore;
  } catch {
    return { version: "1.0.0", rules: [] };
  }
}

function saveNotifyStore(store: NotifyStore): void {
  mkdirSync(dirname(NOTIFY_FILE), { recursive: true });
  writeFileSync(NOTIFY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewNotify(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-notify — Configure notifications for review events

Usage:
  judges review-notify list                        List notification rules
  judges review-notify add --event fail --action log --condition "score<70"
  judges review-notify remove --id nfy-xxx         Remove a rule
  judges review-notify enable --id nfy-xxx         Enable a rule
  judges review-notify disable --id nfy-xxx        Disable a rule

Subcommands:
  list                 List all notification rules
  add                  Add a notification rule
  remove               Remove a notification rule
  enable               Enable a rule
  disable              Disable a rule

Events:
  fail                 Review verdict is fail
  critical             Critical finding detected
  score-drop           Score drops below threshold
  new-finding          New finding introduced

Actions:
  log                  Write to .judges/notifications.log
  console              Print to stderr
  file                 Write to specified file

Options:
  --event <name>        Event to trigger on
  --action <type>       Action to take
  --condition <expr>    Condition expression
  --id <id>             Rule ID
  --format json         JSON output
  --help, -h            Show this help

Notification rules are stored in .judges/notify-rules.json.
No data is sent externally — all notifications are local.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["list", "add", "remove", "enable", "disable"].includes(a)) || "list";
  const store = loadNotifyStore();

  if (subcommand === "add") {
    const event = argv.find((_a: string, i: number) => argv[i - 1] === "--event") || "fail";
    const action = argv.find((_a: string, i: number) => argv[i - 1] === "--action") || "log";
    const condition = argv.find((_a: string, i: number) => argv[i - 1] === "--condition") || "";

    const validEvents = ["fail", "critical", "score-drop", "new-finding"];
    if (!validEvents.includes(event)) {
      console.error(`Error: Unknown event '${event}'. Valid: ${validEvents.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    const validActions = ["log", "console", "file"];
    if (!validActions.includes(action)) {
      console.error(`Error: Unknown action '${action}'. Valid: ${validActions.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    const rule: NotifyRule = {
      id: `nfy-${Date.now().toString(36)}`,
      event,
      condition,
      action,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    store.rules.push(rule);
    saveNotifyStore(store);
    console.log(`Added notification rule '${rule.id}' — on ${event} → ${action}`);
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    store.rules = store.rules.filter((r) => r.id !== id);
    saveNotifyStore(store);
    console.log(`Removed notification rule '${id}'.`);
    return;
  }

  if (subcommand === "enable" || subcommand === "disable") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const rule = store.rules.find((r) => r.id === id);
    if (!rule) {
      console.error(`Error: Rule '${id}' not found.`);
      process.exitCode = 1;
      return;
    }
    rule.enabled = subcommand === "enable";
    saveNotifyStore(store);
    console.log(`Rule '${id}' ${subcommand}d.`);
    return;
  }

  // List
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\n  Notification Rules (${store.rules.length})\n  ═════════════════════════════`);

  if (store.rules.length === 0) {
    console.log("    No rules. Add one with: judges review-notify add --event fail --action log");
  }

  for (const rule of store.rules) {
    const status = rule.enabled ? "✅" : "⏸️";
    const cond = rule.condition ? ` when ${rule.condition}` : "";
    console.log(`    ${status} ${rule.id} — on ${rule.event}${cond} → ${rule.action}`);
  }

  console.log();
}
