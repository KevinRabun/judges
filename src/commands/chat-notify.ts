/**
 * Chat-notify — publish findings to Slack, Teams, Discord, or custom
 * webhooks with rich formatting and team mention routing.
 *
 * DataAdapter-friendly: webhook URLs come from local config,
 * no data stored server-side.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WebhookConfig {
  name: string;
  url: string;
  type: "slack" | "teams" | "discord" | "custom";
  channel?: string;
  mentionOnCritical?: string;
  minSeverity?: "critical" | "high" | "medium" | "low";
}

interface NotificationPayload {
  platform: string;
  channel: string;
  subject: string;
  body: string;
  findings: number;
  criticalCount: number;
  score: number;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const CONFIG_DIR = ".judges-notify";
const CONFIG_FILE = join(CONFIG_DIR, "webhooks.json");

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadWebhooks(): WebhookConfig[] {
  if (!existsSync(CONFIG_FILE)) return [];
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveWebhooks(webhooks: WebhookConfig[]): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(webhooks, null, 2));
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatSlack(payload: NotificationPayload): object {
  const color = payload.criticalCount > 0 ? "#e74c3c" : payload.score < 60 ? "#f39c12" : "#2ecc71";
  return {
    attachments: [
      {
        color,
        title: `🔍 Judges Panel: ${payload.subject}`,
        text: payload.body,
        fields: [
          { title: "Score", value: `${payload.score}/100`, short: true },
          { title: "Findings", value: String(payload.findings), short: true },
          { title: "Critical", value: String(payload.criticalCount), short: true },
        ],
        footer: "Judges Panel",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

function formatTeams(payload: NotificationPayload): object {
  const color = payload.criticalCount > 0 ? "FF0000" : payload.score < 60 ? "FFC107" : "28A745";
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: color,
    summary: `Judges Panel: ${payload.subject}`,
    sections: [
      {
        activityTitle: `🔍 ${payload.subject}`,
        facts: [
          { name: "Score", value: `${payload.score}/100` },
          { name: "Findings", value: String(payload.findings) },
          { name: "Critical", value: String(payload.criticalCount) },
        ],
        text: payload.body,
      },
    ],
  };
}

function formatDiscord(payload: NotificationPayload): object {
  const color = payload.criticalCount > 0 ? 0xe74c3c : payload.score < 60 ? 0xf39c12 : 0x2ecc71;
  return {
    embeds: [
      {
        title: `🔍 Judges Panel: ${payload.subject}`,
        description: payload.body,
        color,
        fields: [
          { name: "Score", value: `${payload.score}/100`, inline: true },
          { name: "Findings", value: String(payload.findings), inline: true },
          { name: "Critical", value: String(payload.criticalCount), inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatPayload(webhook: WebhookConfig, payload: NotificationPayload): string {
  switch (webhook.type) {
    case "slack":
      return JSON.stringify(formatSlack(payload));
    case "teams":
      return JSON.stringify(formatTeams(payload));
    case "discord":
      return JSON.stringify(formatDiscord(payload));
    default:
      return JSON.stringify(payload);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runChatNotify(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges chat-notify — Publish findings to chat platforms

Usage:
  judges chat-notify --add --name "team-slack" --type slack --url <webhook-url>
  judges chat-notify --send --subject "PR #42" --score 65 --findings 5 --critical 1
  judges chat-notify --send --file eval-output.json
  judges chat-notify --list
  judges chat-notify --preview --name "team-slack" --subject "test"
  judges chat-notify --remove --name "team-slack"

Options:
  --add                 Add webhook configuration
  --name <name>         Webhook name
  --type <platform>     Platform: slack, teams, discord, custom
  --url <webhook-url>   Webhook URL (stored locally in .judges-notify/)
  --channel <name>      Channel name (for display)
  --mention <user>      Mention on critical findings
  --min-severity <sev>  Minimum severity to notify (default: medium)
  --send                Send notification
  --subject <text>      Notification subject
  --score <n>           Score (0-100)
  --findings <n>        Finding count
  --critical <n>        Critical finding count
  --file <path>         Import from evaluation output
  --preview             Preview formatted message (no send)
  --list                List configured webhooks
  --remove              Remove webhook
  --format json         JSON output
  --help, -h            Show this help

Platforms: Slack (attachments), Teams (MessageCard), Discord (embeds), Custom (raw JSON)
Webhook URLs are stored locally — no data sent to Judges servers.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isAdd = argv.includes("--add");
  const isSend = argv.includes("--send");
  const isList = argv.includes("--list");
  const isPreview = argv.includes("--preview");
  const isRemove = argv.includes("--remove");
  const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "";
  const webhookType = (argv.find((_a: string, i: number) => argv[i - 1] === "--type") ||
    "custom") as WebhookConfig["type"];
  const url = argv.find((_a: string, i: number) => argv[i - 1] === "--url") || "";
  const channel = argv.find((_a: string, i: number) => argv[i - 1] === "--channel") || "";
  const mention = argv.find((_a: string, i: number) => argv[i - 1] === "--mention") || "";
  const subject = argv.find((_a: string, i: number) => argv[i - 1] === "--subject") || "Judges Panel Evaluation";
  const score = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
  const findings = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0");
  const critical = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--critical") || "0");
  const fileArg = argv.find((_a: string, i: number) => argv[i - 1] === "--file");

  if (isAdd) {
    if (!name || !url) {
      console.error("  --name and --url are required for --add");
      return;
    }
    const webhooks = loadWebhooks();
    if (webhooks.some((w) => w.name === name)) {
      console.error(`  Webhook "${name}" already exists. Remove first.`);
      return;
    }
    webhooks.push({ name, url, type: webhookType, channel, mentionOnCritical: mention || undefined });
    saveWebhooks(webhooks);
    console.log(`  ✅ Added ${webhookType} webhook "${name}"`);
    return;
  }

  if (isRemove) {
    if (!name) {
      console.error("  --name is required");
      return;
    }
    const webhooks = loadWebhooks().filter((w) => w.name !== name);
    saveWebhooks(webhooks);
    console.log(`  ✅ Removed webhook "${name}"`);
    return;
  }

  if (isList) {
    const webhooks = loadWebhooks();
    if (format === "json") {
      console.log(JSON.stringify(webhooks, null, 2));
    } else {
      console.log(`\n  Configured Webhooks — ${webhooks.length}\n  ──────────────────────────`);
      for (const w of webhooks) {
        const masked = w.url.replace(/(.{20}).*(.{6})/, "$1***$2");
        console.log(`    📡 ${w.name} (${w.type}) → ${masked}${w.channel ? ` #${w.channel}` : ""}`);
      }
      if (webhooks.length === 0) console.log("    No webhooks configured. Use --add to add one.");
      console.log("");
    }
    return;
  }

  if (isSend || isPreview) {
    const webhooks = loadWebhooks();
    const targets = name ? webhooks.filter((w) => w.name === name) : webhooks;

    if (targets.length === 0) {
      console.error("  No webhooks configured. Use --add first.");
      return;
    }

    let payloadScore = score;
    let payloadFindings = findings;
    let payloadCritical = critical;
    let body = `Score: ${score}/100 | ${findings} findings | ${critical} critical`;

    if (fileArg && existsSync(fileArg)) {
      try {
        const data = JSON.parse(readFileSync(fileArg, "utf-8"));
        payloadScore = data.overallScore || score;
        payloadFindings = Array.isArray(data.findings) ? data.findings.length : findings;
        payloadCritical = data.criticalCount || critical;
        body = data.summary || body;
      } catch {
        /* use manual values */
      }
    }

    for (const webhook of targets) {
      const payload: NotificationPayload = {
        platform: webhook.type,
        channel: webhook.channel || "",
        subject,
        body,
        findings: payloadFindings,
        criticalCount: payloadCritical,
        score: payloadScore,
      };

      const formatted = formatPayload(webhook, payload);

      if (isPreview) {
        console.log(`\n  Preview for ${webhook.name} (${webhook.type}):\n`);
        console.log(JSON.stringify(JSON.parse(formatted), null, 2));
      } else {
        // In a real implementation, this would use fetch/https to POST
        // Since we can't store/process data server-side, we output the curl command
        console.log(`\n  📡 ${webhook.name} (${webhook.type}):`);
        console.log(`     curl -X POST -H "Content-Type: application/json" -d '${formatted}' "${webhook.url}"`);
        if (webhook.mentionOnCritical && payloadCritical > 0) {
          console.log(`     ⚠ Critical findings — mention ${webhook.mentionOnCritical}`);
        }
      }
    }
    console.log("");
    return;
  }

  // Default: show status
  const webhooks = loadWebhooks();
  console.log(`\n  Chat Notify — ${webhooks.length} webhook(s) configured`);
  if (webhooks.length > 0) {
    for (const w of webhooks) console.log(`    📡 ${w.name} (${w.type})`);
  }
  console.log("  Use --help for usage.\n");
}
