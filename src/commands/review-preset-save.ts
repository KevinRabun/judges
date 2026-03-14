/**
 * Review-preset-save — Save and load custom review preset configurations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewPreset {
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function presetsFile(): string {
  return join(process.cwd(), ".judges", "saved-presets.json");
}

function loadPresets(): Record<string, ReviewPreset> {
  const f = presetsFile();
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return {};
  }
}

function savePresets(presets: Record<string, ReviewPreset>): void {
  const f = presetsFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(presets, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPresetSave(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-preset-save — Save and load review presets

Usage:
  judges review-preset-save save    --name <name> --config <path> [--description <desc>]
  judges review-preset-save load    --name <name>
  judges review-preset-save list
  judges review-preset-save remove  --name <name>
  judges review-preset-save export  --name <name> [--output <path>]
  judges review-preset-save clear

Options:
  --name <name>        Preset name (required for save/load/remove/export)
  --config <path>      Config file to save as preset (JSON)
  --description <desc> Preset description
  --output <path>      Output file for export (defaults to stdout)
  --help, -h           Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const presets = loadPresets();

  if (sub === "save") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    const configPath = args.find((_a: string, i: number) => args[i - 1] === "--config");
    if (!name || !configPath) {
      console.error("Error: --name and --config required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(configPath)) {
      console.error(`Error: config file not found: ${configPath}`);
      process.exitCode = 1;
      return;
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.error("Error: could not parse config file");
      process.exitCode = 1;
      return;
    }

    const desc = args.find((_a: string, i: number) => args[i - 1] === "--description") || "";
    const now = new Date().toISOString();

    presets[name] = { name, description: desc, config, createdAt: presets[name]?.createdAt || now, updatedAt: now };
    savePresets(presets);
    console.log(`Preset saved: ${name}`);
  } else if (sub === "load") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    if (!presets[name]) {
      console.error(`Preset "${name}" not found.`);
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(presets[name].config, null, 2));
  } else if (sub === "list") {
    const names = Object.keys(presets);
    if (names.length === 0) {
      console.log("No saved presets.");
      return;
    }

    console.log(`\nSaved Presets (${names.length}):`);
    console.log("═".repeat(60));
    for (const name of names) {
      const p = presets[name];
      const keys = Object.keys(p.config).length;
      console.log(`  ${name.padEnd(22)} ${String(keys).padStart(3)} keys  ${p.updatedAt.slice(0, 10)}`);
      if (p.description) console.log(`    ${p.description}`);
    }
    console.log("═".repeat(60));
  } else if (sub === "remove") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    if (!presets[name]) {
      console.error(`Preset "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    delete presets[name];
    savePresets(presets);
    console.log(`Removed preset: ${name}`);
  } else if (sub === "export") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    if (!presets[name]) {
      console.error(`Preset "${name}" not found.`);
      process.exitCode = 1;
      return;
    }

    const output = args.find((_a: string, i: number) => args[i - 1] === "--output");
    const data = JSON.stringify(presets[name], null, 2);
    if (output) {
      writeFileSync(output, data);
      console.log(`Exported "${name}" to ${output}`);
    } else {
      console.log(data);
    }
  } else if (sub === "clear") {
    savePresets({});
    console.log("All presets cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
