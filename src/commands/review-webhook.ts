/**
 * Review-webhook — Configure webhook notifications for review results.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WebhookConfig {
  version: string;
  webhooks: WebhookEntry[];
}

interface WebhookEntry {
  id: string;
  name: string;
  url: string;
  events: string[];
  format: string;
  enabled: boolean;
  headers: Record<string, string>;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const CONFIG_FILE = join(".judges", "webhooks.json");

function loadConfig(): WebhookConfig {
  if (!existsSync(CONFIG_FILE)) return { version: "1.0.0", webhooks: [] };
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as WebhookConfig;
  } catch {
    return { version: "1.0.0", webhooks: [] };
  }
}

function saveConfig(config: WebhookConfig): void {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewWebhook(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-webhook — Configure review webhook notifications

Usage:
  judges review-webhook list                              List webhooks
  judges review-webhook add --name ci --url <url>         Add webhook
  judges review-webhook remove --id <id>                  Remove webhook
  judges review-webhook test --id <id>                    Test webhook
  judges review-webhook --format json                     JSON output

Subcommands:
  list                 List configured webhooks
  add                  Add a new webhook
  remove               Remove a webhook
  test                 Send test payload

Options:
  --name <name>        Webhook display name
  --url <url>          Webhook endpoint URL
  --id <id>            Webhook ID
  --events <list>      Comma-separated events: review-complete, finding-critical, gate-fail
  --format json        JSON output
  --help, -h           Show this help

Webhook configs are stored locally in .judges/webhooks.json.
The actual HTTP dispatch is handled by the user's CI/CD pipeline.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["list", "add", "remove", "test"].includes(a)) || "list";
  const config = loadConfig();

  if (subcommand === "add") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "webhook";
    const url = argv.find((_a: string, i: number) => argv[i - 1] === "--url");
    const eventsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--events");

    if (!url) {
      console.error("Error: --url is required.");
      process.exitCode = 1;
      return;
    }

    const id = `wh-${Date.now().toString(36)}`;
    const events = eventsStr ? eventsStr.split(",").map((e) => e.trim()) : ["review-complete"];

    config.webhooks.push({
      id,
      name,
      url,
      events,
      format: "json",
      enabled: true,
      headers: { "Content-Type": "application/json" },
    });

    saveConfig(config);
    console.log(`Added webhook '${name}' (${id}) → ${url}`);
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }

    const idx = config.webhooks.findIndex((w) => w.id === id);
    if (idx < 0) {
      console.error(`Error: Webhook '${id}' not found.`);
      process.exitCode = 1;
      return;
    }

    config.webhooks.splice(idx, 1);
    saveConfig(config);
    console.log(`Removed webhook '${id}'.`);
    return;
  }

  if (subcommand === "test") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }

    const wh = config.webhooks.find((w) => w.id === id);
    if (!wh) {
      console.error(`Error: Webhook '${id}' not found.`);
      process.exitCode = 1;
      return;
    }

    const payload = {
      event: "test",
      timestamp: new Date().toISOString(),
      source: "judges-panel",
      message: "Webhook test from Judges Panel",
    };

    console.log(`Test payload for webhook '${wh.name}':`);
    console.log(`  URL: ${wh.url}`);
    console.log(`  Payload: ${JSON.stringify(payload, null, 2)}`);
    console.log(
      `\nTo send, use: curl -X POST -H "Content-Type: application/json" -d '${JSON.stringify(payload)}' ${wh.url}`,
    );
    return;
  }

  // List
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\n  Webhooks (${config.webhooks.length})\n  ─────────────────────────────`);

  if (config.webhooks.length === 0) {
    console.log("    No webhooks configured. Add one with: judges review-webhook add --name ci --url <url>");
  }

  for (const wh of config.webhooks) {
    const status = wh.enabled ? "✅" : "⬜";
    console.log(`    ${status} ${wh.id} — ${wh.name}`);
    console.log(`       URL: ${wh.url}`);
    console.log(`       Events: ${wh.events.join(", ")}`);
  }

  console.log();
}
