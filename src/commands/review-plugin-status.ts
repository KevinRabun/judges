/**
 * Review-plugin-status — Show plugin loading status and configuration.
 */

import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PluginInfo {
  id: string;
  domain: string;
  rulePrefix: string;
  status: "loaded";
}

// ─── Logic ──────────────────────────────────────────────────────────────────

function getPluginStatus(): PluginInfo[] {
  const judges = defaultRegistry.getJudges();
  return judges.map((j) => ({
    id: j.id,
    domain: j.domain,
    rulePrefix: j.rulePrefix,
    status: "loaded" as const,
  }));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPluginStatus(argv: string[]): void {
  const formatIdx = argv.indexOf("--format");
  const filterIdx = argv.indexOf("--domain");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const domainFilter = filterIdx >= 0 ? argv[filterIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-plugin-status — Show plugin status

Usage:
  judges review-plugin-status [--domain <filter>] [--format table|json]

Options:
  --domain <name>    Filter by domain
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  let plugins = getPluginStatus();

  if (domainFilter) {
    plugins = plugins.filter((p) => p.domain.toLowerCase().includes(domainFilter.toLowerCase()));
  }

  if (format === "json") {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  console.log(`\nPlugin Status (${plugins.length} plugins)`);
  console.log("═".repeat(65));
  console.log(`${"ID".padEnd(22)} ${"Domain".padEnd(16)} ${"Prefix".padEnd(14)} Status`);
  console.log("─".repeat(65));

  for (const p of plugins) {
    const id = p.id.length > 20 ? p.id.slice(0, 20) + "…" : p.id;
    const domain = p.domain.length > 14 ? p.domain.slice(0, 14) + "…" : p.domain;
    console.log(`${id.padEnd(22)} ${domain.padEnd(16)} ${p.rulePrefix.padEnd(14)} ${p.status}`);
  }
  console.log("═".repeat(65));
}
