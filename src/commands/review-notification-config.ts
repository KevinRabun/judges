/**
 * Review-notification-config — Configure notification preferences for review results.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotificationConfig {
  channels: Array<{
    type: string;
    enabled: boolean;
    minSeverity: string;
    template?: string;
  }>;
  quietHours?: { start: string; end: string };
  digest: boolean;
  digestFrequency: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewNotificationConfig(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const enableIdx = argv.indexOf("--enable");
  const disableIdx = argv.indexOf("--disable");
  const severityIdx = argv.indexOf("--severity");
  const digestIdx = argv.indexOf("--digest");
  const formatIdx = argv.indexOf("--format");
  const configPath = fileIdx >= 0 ? argv[fileIdx + 1] : ".judges-notifications.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-notification-config — Configure notification preferences

Usage:
  judges review-notification-config [--file <config>] [--enable <channel>]
                                    [--disable <channel>] [--severity <level>]
                                    [--digest daily|weekly] [--format table|json]

Options:
  --file <path>        Config file (default: .judges-notifications.json)
  --enable <channel>   Enable: console, file, slack, email
  --disable <channel>  Disable a channel
  --severity <level>   Set min severity for notifications
  --digest <freq>      Enable digest: daily, weekly
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  // Load or init config
  let config: NotificationConfig;
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, "utf-8")) as NotificationConfig;
  } else {
    config = {
      channels: [
        { type: "console", enabled: true, minSeverity: "medium" },
        { type: "file", enabled: false, minSeverity: "low" },
        { type: "slack", enabled: false, minSeverity: "high" },
        { type: "email", enabled: false, minSeverity: "critical" },
      ],
      digest: false,
      digestFrequency: "daily",
    };
  }

  let changed = false;

  // Enable channel
  if (enableIdx >= 0) {
    const channel = argv[enableIdx + 1];
    const ch = config.channels.find((c) => c.type === channel);
    if (ch) {
      ch.enabled = true;
      changed = true;
      console.log(`Enabled ${channel} notifications.`);
    } else {
      config.channels.push({ type: channel, enabled: true, minSeverity: "medium" });
      changed = true;
      console.log(`Added and enabled ${channel} notifications.`);
    }
  }

  // Disable channel
  if (disableIdx >= 0) {
    const channel = argv[disableIdx + 1];
    const ch = config.channels.find((c) => c.type === channel);
    if (ch) {
      ch.enabled = false;
      changed = true;
      console.log(`Disabled ${channel} notifications.`);
    } else {
      console.error(`Channel not found: ${channel}`);
    }
  }

  // Set severity
  if (severityIdx >= 0) {
    const sev = argv[severityIdx + 1];
    for (const ch of config.channels) {
      if (ch.enabled) {
        ch.minSeverity = sev;
      }
    }
    changed = true;
    console.log(`Set min severity to ${sev} for enabled channels.`);
  }

  // Digest
  if (digestIdx >= 0) {
    const freq = argv[digestIdx + 1];
    config.digest = true;
    config.digestFrequency = freq;
    changed = true;
    console.log(`Enabled ${freq} digest.`);
  }

  if (changed) {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Config saved to ${configPath}`);
    return;
  }

  // Display current config
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\nNotification Configuration`);
  console.log("═".repeat(55));
  console.log(`  Digest: ${config.digest ? `enabled (${config.digestFrequency})` : "disabled"}`);
  console.log(`\n  Channels:`);
  for (const ch of config.channels) {
    const status = ch.enabled ? "ON " : "OFF";
    console.log(`    [${status}] ${ch.type.padEnd(10)} min: ${ch.minSeverity}`);
  }
  if (config.quietHours) {
    console.log(`\n  Quiet Hours: ${config.quietHours.start} – ${config.quietHours.end}`);
  }
  console.log("═".repeat(55));
}
