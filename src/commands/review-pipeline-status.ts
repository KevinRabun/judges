/**
 * Review-pipeline-status — Show status of review pipelines and integrations.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PipelineConfig {
  id: string;
  name: string;
  type: "ci" | "webhook" | "scheduled";
  status: "active" | "paused" | "error";
  lastRun: string;
  nextRun: string;
  config: Record<string, string>;
}

interface PipelineStore {
  pipelines: PipelineConfig[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPipelineStatus(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-pipelines.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-pipeline-status — Show pipeline status

Usage:
  judges review-pipeline-status [--store <path>] [--format table|json]

Options:
  --store <path>   Pipeline config file (default: .judges-pipelines.json)
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help

The pipeline store tracks CI integrations, webhooks, and scheduled reviews.
`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No pipeline config found at: ${storePath}`);
    console.log("Configure pipelines using review-cicd-integrate or review-webhook-dispatch.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as PipelineStore;

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nPipeline Status`);
  console.log("═".repeat(70));

  if (store.pipelines.length === 0) {
    console.log("  No pipelines configured.");
  } else {
    console.log(`  ${"ID".padEnd(15)} ${"Type".padEnd(12)} ${"Status".padEnd(10)} ${"Last Run".padEnd(14)} Next Run`);
    console.log("  " + "─".repeat(65));

    for (const p of store.pipelines) {
      const statusIcon = p.status === "active" ? "OK" : p.status === "paused" ? "PAUSE" : "ERR";
      console.log(
        `  ${p.id.padEnd(15)} ${p.type.padEnd(12)} ${statusIcon.padEnd(10)} ${p.lastRun.padEnd(14)} ${p.nextRun}`,
      );
    }
  }

  const active = store.pipelines.filter((p) => p.status === "active").length;
  const errored = store.pipelines.filter((p) => p.status === "error").length;
  console.log(`\n  Active: ${active} | Paused: ${store.pipelines.length - active - errored} | Errors: ${errored}`);
  console.log("═".repeat(70));
}
