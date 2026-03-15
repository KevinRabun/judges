/**
 * Review-plugin-config — View and manage plugin configuration.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PluginEntry {
  name: string;
  enabled: boolean;
  version: string;
  options: Record<string, unknown>;
}

interface PluginConfig {
  version: number;
  plugins: PluginEntry[];
  lastUpdated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CONFIG_PATH = ".judges/plugin-config.json";

function loadConfig(): PluginConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { version: 1, plugins: [], lastUpdated: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { version: 1, plugins: [], lastUpdated: new Date().toISOString() };
  }
}

function saveConfig(config: PluginConfig): void {
  const dir = CONFIG_PATH.substring(0, CONFIG_PATH.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  config.lastUpdated = new Date().toISOString();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPluginConfig(argv: string[]): void {
  const sub = argv[0];

  if (argv.includes("--help") || argv.includes("-h") || !sub) {
    console.log(`
judges review-plugin-config — Manage plugin configuration

Usage:
  judges review-plugin-config list [--format table|json]
  judges review-plugin-config add --name <plugin> [--version <ver>]
  judges review-plugin-config remove --name <plugin>
  judges review-plugin-config enable --name <plugin>
  judges review-plugin-config disable --name <plugin>
  judges review-plugin-config set --name <plugin> --key <key> --value <value>

Subcommands:
  list       List configured plugins
  add        Add a plugin
  remove     Remove a plugin
  enable     Enable a plugin
  disable    Disable a plugin
  set        Set a plugin option

Options:
  --name <plugin>    Plugin name
  --version <ver>    Plugin version (default: "latest")
  --key <key>        Option key
  --value <val>      Option value
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const nameIdx = argv.indexOf("--name");
  const versionIdx = argv.indexOf("--version");
  const keyIdx = argv.indexOf("--key");
  const valueIdx = argv.indexOf("--value");
  const formatIdx = argv.indexOf("--format");
  const name = nameIdx >= 0 ? argv[nameIdx + 1] : undefined;
  const version = versionIdx >= 0 ? argv[versionIdx + 1] : "latest";
  const key = keyIdx >= 0 ? argv[keyIdx + 1] : undefined;
  const value = valueIdx >= 0 ? argv[valueIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (sub === "list") {
    const config = loadConfig();
    if (config.plugins.length === 0) {
      console.log("No plugins configured.");
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log(`\nPlugin Configuration (${config.plugins.length} plugins)`);
    console.log("═".repeat(55));
    console.log(`${"Name".padEnd(25)} ${"Version".padEnd(12)} Status`);
    console.log("─".repeat(55));

    for (const p of config.plugins) {
      console.log(`${p.name.padEnd(25)} ${p.version.padEnd(12)} ${p.enabled ? "enabled" : "disabled"}`);
      const optKeys = Object.keys(p.options);
      if (optKeys.length > 0) {
        for (const k of optKeys) {
          console.log(`  ${k}: ${JSON.stringify(p.options[k])}`);
        }
      }
    }
    console.log("═".repeat(55));
    return;
  }

  if (!name) {
    console.error("Error: --name required");
    process.exitCode = 1;
    return;
  }

  if (sub === "add") {
    const config = loadConfig();
    if (config.plugins.some((p) => p.name === name)) {
      console.log(`Plugin already exists: ${name}`);
      return;
    }
    config.plugins.push({ name, enabled: true, version, options: {} });
    saveConfig(config);
    console.log(`Added plugin: ${name} (${version})`);
    return;
  }

  if (sub === "remove") {
    const config = loadConfig();
    const idx = config.plugins.findIndex((p) => p.name === name);
    if (idx < 0) {
      console.error(`Plugin not found: ${name}`);
      process.exitCode = 1;
      return;
    }
    config.plugins.splice(idx, 1);
    saveConfig(config);
    console.log(`Removed plugin: ${name}`);
    return;
  }

  if (sub === "enable" || sub === "disable") {
    const config = loadConfig();
    const plugin = config.plugins.find((p) => p.name === name);
    if (!plugin) {
      console.error(`Plugin not found: ${name}`);
      process.exitCode = 1;
      return;
    }
    plugin.enabled = sub === "enable";
    saveConfig(config);
    console.log(`Plugin ${name} ${sub}d`);
    return;
  }

  if (sub === "set") {
    if (!key) {
      console.error("Error: --key required");
      process.exitCode = 1;
      return;
    }
    if (value === undefined) {
      console.error("Error: --value required");
      process.exitCode = 1;
      return;
    }

    const config = loadConfig();
    const plugin = config.plugins.find((p) => p.name === name);
    if (!plugin) {
      console.error(`Plugin not found: ${name}`);
      process.exitCode = 1;
      return;
    }

    // try to parse value as JSON, fallback to string
    try {
      plugin.options[key] = JSON.parse(value);
    } catch {
      plugin.options[key] = value;
    }
    saveConfig(config);
    console.log(`Set ${name}.${key} = ${value}`);
    return;
  }

  console.error(`Error: unknown subcommand: ${sub}`);
  process.exitCode = 1;
}
