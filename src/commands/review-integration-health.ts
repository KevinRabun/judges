/**
 * Review-integration-health — Check health of Judges integrations.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IntegrationEntry {
  name: string;
  type: "ci" | "webhook" | "ide" | "api";
  status: "healthy" | "degraded" | "error" | "unknown";
  lastCheck: string;
  details: string;
}

interface IntegrationStore {
  integrations: IntegrationEntry[];
  lastUpdated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function checkLocalIntegrations(): IntegrationEntry[] {
  const results: IntegrationEntry[] = [];
  const now = new Date().toISOString();

  // Check .judgesrc
  results.push({
    name: "judgesrc",
    type: "api",
    status: existsSync(".judgesrc") ? "healthy" : "error",
    lastCheck: now,
    details: existsSync(".judgesrc") ? "Config found" : "No .judgesrc found",
  });

  // Check CI config
  const ciFiles = [".github/workflows", ".gitlab-ci.yml", "Jenkinsfile", "azure-pipelines.yml"];
  const ciFound = ciFiles.some((f) => existsSync(f));
  results.push({
    name: "ci-pipeline",
    type: "ci",
    status: ciFound ? "healthy" : "unknown",
    lastCheck: now,
    details: ciFound ? "CI config detected" : "No CI config found",
  });

  // Check webhooks config
  const webhookFile = ".judges-webhooks.json";
  results.push({
    name: "webhooks",
    type: "webhook",
    status: existsSync(webhookFile) ? "healthy" : "unknown",
    lastCheck: now,
    details: existsSync(webhookFile) ? "Webhook config found" : "No webhooks configured",
  });

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIntegrationHealth(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-integration-health — Check integration health

Usage:
  judges review-integration-health [--store <path>] [--format table|json]

Options:
  --store <path>     Integration store file (optional, auto-detects if omitted)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help

Without --store, performs local auto-detection of integrations.
`);
    return;
  }

  let integrations: IntegrationEntry[];

  if (storePath && existsSync(storePath)) {
    const store = JSON.parse(readFileSync(storePath, "utf-8")) as IntegrationStore;
    integrations = store.integrations;
  } else {
    integrations = checkLocalIntegrations();
  }

  if (format === "json") {
    console.log(JSON.stringify(integrations, null, 2));
    return;
  }

  console.log("\nIntegration Health");
  console.log("═".repeat(70));
  console.log(`  ${"Name".padEnd(18)} ${"Type".padEnd(10)} ${"Status".padEnd(12)} Details`);
  console.log("  " + "─".repeat(65));

  for (const i of integrations) {
    const statusLabel =
      i.status === "healthy" ? "OK" : i.status === "degraded" ? "DEGRADED" : i.status === "error" ? "ERROR" : "UNKNOWN";
    console.log(`  ${i.name.padEnd(18)} ${i.type.padEnd(10)} ${statusLabel.padEnd(12)} ${i.details}`);
  }

  const healthy = integrations.filter((i) => i.status === "healthy").length;
  const errors = integrations.filter((i) => i.status === "error").length;
  console.log(`\n  Healthy: ${healthy} | Errors: ${errors} | Total: ${integrations.length}`);
  console.log("═".repeat(70));
}
