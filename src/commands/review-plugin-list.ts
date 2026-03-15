/**
 * Review-plugin-list — List available and active plugins.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PluginInfo {
  name: string;
  source: "built-in" | "local" | "registry";
  status: "active" | "inactive";
  judgeCount: number;
  rulePrefix: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function listPlugins(pluginDir?: string): PluginInfo[] {
  const results: PluginInfo[] = [];
  const judges = defaultRegistry.getJudges();

  // built-in judges grouped by prefix
  const prefixMap = new Map<string, string[]>();
  for (const j of judges) {
    const ids = prefixMap.get(j.rulePrefix) || [];
    ids.push(j.id);
    prefixMap.set(j.rulePrefix, ids);
  }

  for (const [prefix, ids] of prefixMap) {
    results.push({
      name: ids[0],
      source: "built-in",
      status: "active",
      judgeCount: ids.length,
      rulePrefix: prefix,
    });
  }

  // local plugins directory
  if (pluginDir && existsSync(pluginDir)) {
    const entries = readdirSync(pluginDir) as unknown as string[];
    for (const entry of entries) {
      const entryPath = join(pluginDir, entry);
      if (!entry.endsWith(".json")) continue;

      try {
        const config = JSON.parse(readFileSync(entryPath, "utf-8"));
        results.push({
          name: config.name || entry.replace(".json", ""),
          source: "local",
          status: config.enabled !== false ? "active" : "inactive",
          judgeCount: config.judges !== undefined ? config.judges.length : 0,
          rulePrefix: config.rulePrefix || "CUSTOM",
        });
      } catch {
        // skip invalid plugin files
      }
    }
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPluginList(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const filterIdx = argv.indexOf("--filter");
  const pluginDir = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const filter = filterIdx >= 0 ? argv[filterIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-plugin-list — List available plugins

Usage:
  judges review-plugin-list [--dir <plugins-dir>] [--format table|json]
                            [--filter active|inactive|built-in|local]

Options:
  --dir <path>       Custom plugins directory
  --format <fmt>     Output format: table (default), json
  --filter <type>    Filter by: active, inactive, built-in, local
  --help, -h         Show this help
`);
    return;
  }

  let results = listPlugins(pluginDir);

  if (filter !== undefined) {
    if (filter === "active" || filter === "inactive") {
      results = results.filter((r) => r.status === filter);
    } else if (filter === "built-in" || filter === "local") {
      results = results.filter((r) => r.source === filter);
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nAvailable Plugins (${results.length})`);
  console.log("═".repeat(70));
  console.log(
    `${"Name".padEnd(25)} ${"Source".padEnd(12)} ${"Status".padEnd(10)} ${"Judges".padEnd(8)} ${"Prefix".padEnd(10)}`,
  );
  console.log("─".repeat(70));

  for (const p of results) {
    const name = p.name.length > 23 ? p.name.slice(0, 23) + "…" : p.name;
    console.log(
      `${name.padEnd(25)} ${p.source.padEnd(12)} ${p.status.padEnd(10)} ${String(p.judgeCount).padEnd(8)} ${p.rulePrefix.padEnd(10)}`,
    );
  }
  console.log("═".repeat(70));
  console.log(`  Built-in: ${results.filter((r) => r.source === "built-in").length}`);
  console.log(`  Local:    ${results.filter((r) => r.source === "local").length}`);
}
