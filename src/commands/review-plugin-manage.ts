/**
 * Review-plugin-manage — Manage review plugins and extensions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PluginEntry {
  name: string;
  version: string;
  enabled: boolean;
  description: string;
  addedAt: string;
}

interface PluginStore {
  version: string;
  plugins: PluginEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORE_FILE = ".judges/plugins.json";

function loadStore(): PluginStore {
  if (!existsSync(STORE_FILE)) return { version: "1.0.0", plugins: [] };
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as PluginStore;
  } catch {
    return { version: "1.0.0", plugins: [] };
  }
}

function saveStore(store: PluginStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPluginManage(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-plugin-manage — Manage review plugins

Usage:
  judges review-plugin-manage list
  judges review-plugin-manage add --name <name> --version <ver> [--description <text>]
  judges review-plugin-manage enable --name <name>
  judges review-plugin-manage disable --name <name>
  judges review-plugin-manage remove --name <name>
  judges review-plugin-manage clear

Options:
  --name <name>          Plugin name
  --version <ver>        Plugin version
  --description <text>   Plugin description
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["list", "add", "enable", "disable", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");
    const version = argv.find((_a: string, i: number) => argv[i - 1] === "--version") || "1.0.0";
    const description = argv.find((_a: string, i: number) => argv[i - 1] === "--description") || "";
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    if (store.plugins.some((p) => p.name === name)) {
      console.error(`Plugin '${name}' already exists.`);
      process.exitCode = 1;
      return;
    }
    store.plugins.push({ name, version, enabled: true, description, addedAt: new Date().toISOString() });
    saveStore(store);
    console.log(`Added plugin: ${name}@${version}`);
    return;
  }

  if (subcommand === "enable") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const plugin = store.plugins.find((p) => p.name === name);
    if (!plugin) {
      console.error(`Plugin '${name}' not found.`);
      process.exitCode = 1;
      return;
    }
    plugin.enabled = true;
    saveStore(store);
    console.log(`Enabled: ${name}`);
    return;
  }

  if (subcommand === "disable") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const plugin = store.plugins.find((p) => p.name === name);
    if (!plugin) {
      console.error(`Plugin '${name}' not found.`);
      process.exitCode = 1;
      return;
    }
    plugin.enabled = false;
    saveStore(store);
    console.log(`Disabled: ${name}`);
    return;
  }

  if (subcommand === "remove") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const before = store.plugins.length;
    store.plugins = store.plugins.filter((p) => p.name !== name);
    saveStore(store);
    console.log(`Removed ${before - store.plugins.length} plugin(s).`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", plugins: [] });
    console.log("All plugins cleared.");
    return;
  }

  // Default: list
  if (store.plugins.length === 0) {
    console.log("No plugins registered.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.plugins, null, 2));
    return;
  }

  console.log(`\nPlugins (${store.plugins.length}):`);
  console.log("═".repeat(60));
  for (const p of store.plugins) {
    const status = p.enabled ? " ON" : "OFF";
    console.log(`  [${status}] ${p.name.padEnd(25)} v${p.version.padEnd(10)} ${p.description}`);
  }
  console.log("═".repeat(60));
}
