/**
 * Review-webhook-notify — Configure and test webhook notifications for reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WebhookConfig {
  version: number;
  webhooks: WebhookEntry[];
}

interface WebhookEntry {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
}

interface WebhookPayload {
  event: string;
  timestamp: string;
  summary: {
    score: number;
    verdict: string;
    findingCount: number;
    criticalCount: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadConfig(configPath: string): WebhookConfig {
  if (!existsSync(configPath)) {
    return { version: 1, webhooks: [] };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return { version: 1, webhooks: [] };
  }
}

function saveConfig(configPath: string, config: WebhookConfig): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function buildPayload(verdict: TribunalVerdict, event: string): WebhookPayload {
  return {
    event,
    timestamp: verdict.timestamp || new Date().toISOString(),
    summary: {
      score: verdict.overallScore,
      verdict: verdict.overallVerdict,
      findingCount: verdict.findings.length,
      criticalCount: verdict.criticalCount,
    },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewWebhookNotify(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const configIdx = argv.indexOf("--config");
  const fileIdx = argv.indexOf("--file");
  const nameIdx = argv.indexOf("--name");
  const urlIdx = argv.indexOf("--url");
  const formatIdx = argv.indexOf("--format");

  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "list";
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-webhooks.json";
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const name = nameIdx >= 0 ? argv[nameIdx + 1] : undefined;
  const url = urlIdx >= 0 ? argv[urlIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-webhook-notify — Configure webhook notifications

Usage:
  judges review-webhook-notify --action <action> [options]

Actions:
  list       List configured webhooks (default)
  add        Add a webhook (requires --name and --url)
  remove     Remove a webhook (requires --name)
  preview    Preview payload for a verdict (requires --file)

Options:
  --action <act>     Action: list, add, remove, preview
  --config <path>    Config file (default: .judges-webhooks.json)
  --file <path>      Verdict JSON file (for preview)
  --name <name>      Webhook name
  --url <url>        Webhook URL (for add)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const config = loadConfig(configPath);

  if (action === "add") {
    if (!name || !url) {
      console.error("Error: --name and --url required for add");
      process.exitCode = 1;
      return;
    }
    config.webhooks.push({
      id: `wh-${Date.now()}`,
      name,
      url,
      events: ["review-complete", "critical-found"],
      enabled: true,
    });
    saveConfig(configPath, config);
    console.log(`Webhook added: ${name}`);
    return;
  }

  if (action === "remove") {
    if (!name) {
      console.error("Error: --name required for remove");
      process.exitCode = 1;
      return;
    }
    const idx = config.webhooks.findIndex((w) => w.name === name);
    if (idx < 0) {
      console.error(`Error: webhook not found: ${name}`);
      process.exitCode = 1;
      return;
    }
    config.webhooks.splice(idx, 1);
    saveConfig(configPath, config);
    console.log(`Webhook removed: ${name}`);
    return;
  }

  if (action === "preview") {
    if (!filePath || !existsSync(filePath)) {
      console.error("Error: --file required for preview");
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
    const payload = buildPayload(verdict, "review-complete");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // list
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\nWebhook Notifications (${config.webhooks.length})`);
  console.log("═".repeat(70));
  console.log(`${"Name".padEnd(20)} ${"URL".padEnd(30)} ${"Events".padEnd(15)} Enabled`);
  console.log("─".repeat(70));

  for (const w of config.webhooks) {
    const urlStr = w.url.length > 28 ? w.url.slice(0, 28) + "…" : w.url;
    const events = w.events.join(",");
    const evStr = events.length > 13 ? events.slice(0, 13) + "…" : events;
    console.log(`${w.name.padEnd(20)} ${urlStr.padEnd(30)} ${evStr.padEnd(15)} ${w.enabled}`);
  }
  console.log("═".repeat(70));
}
