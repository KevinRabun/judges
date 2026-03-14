/**
 * `judges notify` — Webhook notification system for findings alerts.
 *
 * Sends evaluation results to configured webhook endpoints (Slack, Teams,
 * generic HTTP). Users configure their own endpoints — Judges never stores
 * or processes data on behalf of users.
 *
 * Usage:
 *   judges notify --file results.json --channel slack        # Send to Slack
 *   judges notify --file results.json --channel teams        # Send to Teams
 *   judges notify --file results.json --channel webhook      # Generic webhook
 *   judges eval src/app.ts --notify                          # Evaluate + notify
 *
 * Configuration in .judgesrc:
 * ```json
 * {
 *   "notifications": {
 *     "channels": [
 *       { "type": "slack",   "url": "https://hooks.slack.com/..." },
 *       { "type": "teams",   "url": "https://outlook.office.com/webhook/..." },
 *       { "type": "webhook", "url": "https://my-server.com/judges-hook",
 *         "headers": { "Authorization": "Bearer ..." } }
 *     ],
 *     "minSeverity": "medium",
 *     "onlyOnFailure": false
 *   }
 * }
 * ```
 */

import type { Finding, Severity, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotificationChannelType = "slack" | "teams" | "webhook";

export interface NotificationChannel {
  /** Channel type */
  type: NotificationChannelType;
  /** Webhook URL — provided and hosted by the user */
  url: string;
  /** Optional custom headers (e.g. auth tokens) */
  headers?: Record<string, string>;
  /** Optional display name for this channel */
  name?: string;
}

export interface NotificationConfig {
  /** Channels to send notifications to */
  channels: NotificationChannel[];
  /** Only notify for findings at or above this severity */
  minSeverity?: Severity;
  /** Only send when the verdict is "fail" */
  onlyOnFailure?: boolean;
}

export interface NotificationPayload {
  /** Project or file being evaluated */
  target: string;
  /** Overall verdict */
  verdict: "pass" | "fail" | "warning";
  /** Aggregate score (0-10) */
  score: number;
  /** Summary counts by severity */
  summary: Record<Severity, number>;
  /** Total finding count */
  totalFindings: number;
  /** Top findings (limited to 10 for brevity) */
  topFindings: Array<{
    ruleId: string;
    severity: Severity;
    title: string;
    line?: number;
  }>;
  /** Timestamp of evaluation */
  timestamp: string;
}

// ─── Severity Filtering ─────────────────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function meetsMinSeverity(findings: Finding[], minSeverity: Severity): Finding[] {
  const threshold = SEVERITY_RANK[minSeverity] ?? 4;
  return findings.filter((f) => (SEVERITY_RANK[f.severity] ?? 4) <= threshold);
}

// ─── Payload Construction ───────────────────────────────────────────────────

export function buildNotificationPayload(
  target: string,
  verdict: TribunalVerdict,
  filteredFindings: Finding[],
): NotificationPayload {
  const summary: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of filteredFindings) {
    summary[f.severity] = (summary[f.severity] || 0) + 1;
  }

  const topFindings = filteredFindings
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4))
    .slice(0, 10)
    .map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      line: f.lineNumbers?.[0],
    }));

  return {
    target,
    verdict: verdict.overallVerdict,
    score: verdict.overallScore,
    summary,
    totalFindings: filteredFindings.length,
    topFindings,
    timestamp: new Date().toISOString(),
  };
}

// ─── Channel Formatters ─────────────────────────────────────────────────────

function formatSlackPayload(payload: NotificationPayload): object {
  const emoji = payload.verdict === "pass" ? ":white_check_mark:" : payload.verdict === "fail" ? ":x:" : ":warning:";
  const color = payload.verdict === "pass" ? "#36a64f" : payload.verdict === "fail" ? "#e01e5a" : "#ecb22e";

  const findingLines = payload.topFindings
    .map((f) => `• \`${f.ruleId}\` [${f.severity.toUpperCase()}] ${f.title}${f.line ? ` (L${f.line})` : ""}`)
    .join("\n");

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *Judges Panel — ${payload.verdict.toUpperCase()}*\n*Target:* \`${payload.target}\`\n*Score:* ${payload.score}/10 | *Findings:* ${payload.totalFindings}`,
            },
          },
          ...(payload.totalFindings > 0
            ? [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*Summary:* ${Object.entries(payload.summary)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" | ")}`,
                  },
                },
              ]
            : []),
          ...(findingLines
            ? [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*Top Findings:*\n${findingLines}`,
                  },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function formatTeamsPayload(payload: NotificationPayload): object {
  const color = payload.verdict === "pass" ? "00FF00" : payload.verdict === "fail" ? "FF0000" : "FFAA00";
  const icon = payload.verdict === "pass" ? "✅" : payload.verdict === "fail" ? "❌" : "⚠️";

  const findingRows = payload.topFindings.map((f) => `| ${f.ruleId} | ${f.severity} | ${f.title} |`).join("\n");

  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: color,
    summary: `Judges Panel — ${payload.verdict.toUpperCase()}`,
    sections: [
      {
        activityTitle: `${icon} Judges Panel — ${payload.verdict.toUpperCase()}`,
        facts: [
          { name: "Target", value: payload.target },
          { name: "Score", value: `${payload.score}/10` },
          { name: "Findings", value: String(payload.totalFindings) },
          ...Object.entries(payload.summary)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: String(v) })),
        ],
        markdown: true,
        text:
          payload.topFindings.length > 0
            ? `**Top Findings:**\n\n| Rule | Severity | Title |\n|------|----------|-------|\n${findingRows}`
            : "",
      },
    ],
  };
}

function formatGenericWebhookPayload(payload: NotificationPayload): object {
  return payload;
}

// ─── Send Notification ──────────────────────────────────────────────────────

export async function sendNotification(
  channel: NotificationChannel,
  payload: NotificationPayload,
): Promise<{ success: boolean; error?: string }> {
  let body: object;
  switch (channel.type) {
    case "slack":
      body = formatSlackPayload(payload);
      break;
    case "teams":
      body = formatTeamsPayload(payload);
      break;
    case "webhook":
    default:
      body = formatGenericWebhookPayload(payload);
      break;
  }

  try {
    const response = await fetch(channel.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(channel.headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Notify All Channels ────────────────────────────────────────────────────

export async function notifyAllChannels(
  config: NotificationConfig,
  target: string,
  verdict: TribunalVerdict,
): Promise<void> {
  // Apply severity filter
  const filtered = config.minSeverity ? meetsMinSeverity(verdict.findings, config.minSeverity) : verdict.findings;

  // Skip if onlyOnFailure and verdict is pass
  if (config.onlyOnFailure && verdict.overallVerdict === "pass") {
    return;
  }

  // Skip if no findings after filtering and onlyOnFailure
  if (filtered.length === 0 && config.onlyOnFailure) {
    return;
  }

  const payload = buildNotificationPayload(target, verdict, filtered);

  const results = await Promise.allSettled(
    config.channels.map(async (ch) => {
      const result = await sendNotification(ch, payload);
      return { channel: ch.name || ch.type, ...result };
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.success) {
        console.log(`  ✓ Notification sent to ${r.value.channel}`);
      } else {
        console.error(`  ✗ Notification failed for ${r.value.channel}: ${r.value.error}`);
      }
    } else {
      console.error(`  ✗ Notification error: ${r.reason}`);
    }
  }
}

// ─── Config Parsing ─────────────────────────────────────────────────────────

const VALID_SEVERITIES = new Set<Severity>(["critical", "high", "medium", "low", "info"]);

export function parseNotificationConfig(obj: Record<string, unknown>): NotificationConfig | undefined {
  if (!obj.notifications) return undefined;

  const raw = obj.notifications as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;

  if (!Array.isArray(raw.channels)) return undefined;

  const channels: NotificationChannel[] = [];
  for (const ch of raw.channels as Array<Record<string, unknown>>) {
    if (typeof ch !== "object" || ch === null) continue;
    const type = ch.type as string;
    const url = ch.url as string;
    if (!type || !url || !["slack", "teams", "webhook"].includes(type)) continue;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;

    channels.push({
      type: type as NotificationChannelType,
      url,
      headers:
        typeof ch.headers === "object" && ch.headers !== null ? (ch.headers as Record<string, string>) : undefined,
      name: typeof ch.name === "string" ? ch.name : undefined,
    });
  }

  if (channels.length === 0) return undefined;

  return {
    channels,
    minSeverity:
      typeof raw.minSeverity === "string" && VALID_SEVERITIES.has(raw.minSeverity as Severity)
        ? (raw.minSeverity as Severity)
        : undefined,
    onlyOnFailure: typeof raw.onlyOnFailure === "boolean" ? raw.onlyOnFailure : false,
  };
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export async function runNotify(argv: string[]): Promise<void> {
  const file = argv.find((_a, i) => argv[i - 1] === "--file") || argv.find((_a, i) => argv[i - 1] === "-f");
  const channelType = argv.find((_a, i) => argv[i - 1] === "--channel") as NotificationChannelType | undefined;
  const url = argv.find((_a, i) => argv[i - 1] === "--url");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges notify — Send evaluation results to webhook channels

Usage:
  judges notify --file results.json                    Send to configured channels
  judges notify --file results.json --channel slack    Send to specific channel type
  judges notify --url https://hooks.slack.com/...      Send to ad-hoc webhook

Options:
  --file, -f     Path to a Judges JSON result file
  --channel      Channel type filter: slack | teams | webhook
  --url          Ad-hoc webhook URL (overrides config)
  --help, -h     Show this help
`);
    return;
  }

  // Load notification config from .judgesrc
  const { existsSync: exists, readFileSync: readFile } = await import("fs");
  let notifConfig: NotificationConfig | undefined;

  for (const name of [".judgesrc", ".judgesrc.json"]) {
    if (exists(name)) {
      try {
        const raw = JSON.parse(readFile(name, "utf-8")) as Record<string, unknown>;
        notifConfig = parseNotificationConfig(raw);
      } catch {
        // Skip invalid config
      }
      break;
    }
  }

  // Ad-hoc URL override
  if (url) {
    notifConfig = {
      channels: [{ type: channelType || "webhook", url }],
    };
  }

  if (!notifConfig || notifConfig.channels.length === 0) {
    console.error('Error: No notification channels configured. Add "notifications" to .judgesrc or use --url.');
    process.exit(1);
  }

  // Filter to specific channel type if requested
  if (channelType && !url) {
    notifConfig.channels = notifConfig.channels.filter((ch) => ch.type === channelType);
    if (notifConfig.channels.length === 0) {
      console.error(`Error: No ${channelType} channels configured.`);
      process.exit(1);
    }
  }

  if (!file) {
    console.error("Error: --file is required. Provide a Judges JSON result file.");
    process.exit(1);
  }

  if (!exists(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(readFile(file, "utf-8"));
    const verdict: TribunalVerdict = {
      overallVerdict: data.overallVerdict || data.verdict || "pass",
      overallScore: data.overallScore || data.score || 0,
      findings: data.findings || [],
      evaluations: data.evaluations || [],
      summary: data.summary || "",
      criticalCount: data.criticalCount || 0,
      highCount: data.highCount || 0,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    console.log(`Sending notifications for ${file}...`);
    await notifyAllChannels(notifConfig, file, verdict);
  } catch (err) {
    console.error(`Error reading results file: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
