/**
 * Review-webhook-dispatch — Configure webhook endpoints for review events.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  headers?: Record<string, string>;
}

interface WebhookStore {
  webhooks: WebhookConfig[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewWebhookDispatch(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-webhooks.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-webhook-dispatch — Configure webhook dispatch for review events

Usage:
  judges review-webhook-dispatch [--store <path>] [--add <json>]
                                 [--remove <id>] [--test <id>]
                                 [--format table|json]

Options:
  --store <path>   Webhook config file (default: .judges-webhooks.json)
  --add <json>     Add webhook config (JSON)
  --remove <id>    Remove webhook by id
  --test <id>      Test webhook connectivity (dry run)
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  let store: WebhookStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as WebhookStore;
  } else {
    store = { webhooks: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add webhook
  const addIdx = argv.indexOf("--add");
  if (addIdx >= 0) {
    const webhook = JSON.parse(argv[addIdx + 1]) as WebhookConfig;
    const existingIdx = store.webhooks.findIndex((w) => w.id === webhook.id);
    if (existingIdx >= 0) {
      store.webhooks[existingIdx] = webhook;
    } else {
      store.webhooks.push(webhook);
    }
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Webhook "${webhook.id}" saved.`);
    return;
  }

  // Remove webhook
  const removeIdx = argv.indexOf("--remove");
  if (removeIdx >= 0) {
    const id = argv[removeIdx + 1];
    store.webhooks = store.webhooks.filter((w) => w.id !== id);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Webhook "${id}" removed.`);
    return;
  }

  // Test webhook
  const testIdx = argv.indexOf("--test");
  if (testIdx >= 0) {
    const id = argv[testIdx + 1];
    const webhook = store.webhooks.find((w) => w.id === id);
    if (!webhook) {
      console.error(`Webhook "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Webhook test (dry run):`);
    console.log(`  ID:     ${webhook.id}`);
    console.log(`  URL:    ${webhook.url}`);
    console.log(`  Events: ${webhook.events.join(", ")}`);
    console.log(`  Status: ${webhook.enabled ? "enabled" : "disabled"}`);
    console.log(`  Would send: { "event": "test", "timestamp": "${new Date().toISOString()}" }`);
    return;
  }

  // List webhooks
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nWebhook Dispatch Config`);
  console.log("═".repeat(60));

  if (store.webhooks.length === 0) {
    console.log("  No webhooks configured. Use --add to create one.");
  } else {
    for (const w of store.webhooks) {
      const status = w.enabled ? "ON" : "OFF";
      console.log(`  [${status}] ${w.id.padEnd(20)} ${w.url}`);
      console.log(`         Events: ${w.events.join(", ")}`);
    }
  }

  console.log("═".repeat(60));
}
