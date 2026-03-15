/**
 * Review-notification — Configure and display review notification settings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotificationRule {
  event: "critical-finding" | "score-drop" | "new-rule-violation" | "review-complete";
  channel: "console" | "file" | "webhook-url";
  threshold?: number;
  enabled: boolean;
}

interface NotificationConfig {
  version: number;
  rules: NotificationRule[];
  logFile?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadConfig(configPath: string): NotificationConfig {
  if (!existsSync(configPath)) {
    return {
      version: 1,
      rules: [
        { event: "critical-finding", channel: "console", enabled: true },
        { event: "score-drop", channel: "console", threshold: 10, enabled: true },
        { event: "review-complete", channel: "console", enabled: true },
      ],
    };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return { version: 1, rules: [] };
  }
}

function saveConfig(configPath: string, config: NotificationConfig): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewNotification(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const configIdx = argv.indexOf("--config");
  const eventIdx = argv.indexOf("--event");
  const channelIdx = argv.indexOf("--channel");
  const thresholdIdx = argv.indexOf("--threshold");
  const formatIdx = argv.indexOf("--format");

  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "list";
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-notifications.json";
  const event = eventIdx >= 0 ? argv[eventIdx + 1] : undefined;
  const channel = channelIdx >= 0 ? argv[channelIdx + 1] : "console";
  const threshold = thresholdIdx >= 0 ? parseInt(argv[thresholdIdx + 1], 10) : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-notification — Manage review notifications

Usage:
  judges review-notification --action <action> [options]

Actions:
  list       Show notification rules (default)
  add        Add a notification rule
  remove     Remove a notification rule
  init       Initialize default notification config

Options:
  --action <act>       Action: list, add, remove, init
  --config <path>      Config file (default: .judges-notifications.json)
  --event <type>       Event: critical-finding, score-drop, new-rule-violation, review-complete
  --channel <type>     Channel: console (default), file, webhook-url
  --threshold <n>      Threshold value (for score-drop events)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  const config = loadConfig(configPath);

  if (action === "init") {
    saveConfig(configPath, config);
    console.log(`Notification config initialized: ${configPath}`);
    return;
  }

  if (action === "add") {
    if (!event) {
      console.error("Error: --event required for add");
      process.exitCode = 1;
      return;
    }
    const newRule: NotificationRule = {
      event: event as NotificationRule["event"],
      channel: channel as NotificationRule["channel"],
      enabled: true,
    };
    if (threshold !== undefined) {
      newRule.threshold = threshold;
    }
    config.rules.push(newRule);
    saveConfig(configPath, config);
    console.log(`Added notification rule: ${event} → ${channel}`);
    return;
  }

  if (action === "remove") {
    if (!event) {
      console.error("Error: --event required for remove");
      process.exitCode = 1;
      return;
    }
    const idx = config.rules.findIndex((r) => r.event === event && r.channel === channel);
    if (idx < 0) {
      console.error(`Error: notification rule not found: ${event} → ${channel}`);
      process.exitCode = 1;
      return;
    }
    config.rules.splice(idx, 1);
    saveConfig(configPath, config);
    console.log(`Removed notification rule: ${event} → ${channel}`);
    return;
  }

  // default: list
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\nNotification Rules (${config.rules.length})`);
  console.log("═".repeat(65));
  console.log(`${"Event".padEnd(25)} ${"Channel".padEnd(15)} ${"Threshold".padEnd(12)} Enabled`);
  console.log("─".repeat(65));

  for (const r of config.rules) {
    const thresh = r.threshold !== undefined ? String(r.threshold) : "—";
    console.log(`${r.event.padEnd(25)} ${r.channel.padEnd(15)} ${thresh.padEnd(12)} ${r.enabled}`);
  }
  console.log("═".repeat(65));
}
