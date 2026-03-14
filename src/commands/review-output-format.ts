/**
 * Review-output-format — Configure and manage output format preferences.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OutputFormatConfig {
  defaultFormat: string;
  includeTimestamps: boolean;
  colorOutput: boolean;
  maxWidth: number;
  verbosity: string;
  customFormats: Record<string, { template: string; description: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function configFile(): string {
  return join(process.cwd(), ".judges", "output-format.json");
}

function loadConfig(): OutputFormatConfig {
  const f = configFile();
  const defaults: OutputFormatConfig = {
    defaultFormat: "text",
    includeTimestamps: true,
    colorOutput: true,
    maxWidth: 80,
    verbosity: "normal",
    customFormats: {},
  };
  if (!existsSync(f)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(readFileSync(f, "utf-8")) };
  } catch {
    return defaults;
  }
}

function saveConfig(config: OutputFormatConfig): void {
  const f = configFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(config, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOutputFormat(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-output-format — Configure output format preferences

Usage:
  judges review-output-format show
  judges review-output-format set    --key <key> --value <value>
  judges review-output-format add-format --name <name> --template <tmpl> [--description <desc>]
  judges review-output-format remove-format --name <name>
  judges review-output-format reset

Options:
  --key <key>          Setting key (defaultFormat, includeTimestamps, colorOutput, maxWidth, verbosity)
  --value <value>      Setting value
  --name <name>        Custom format name
  --template <tmpl>    Custom format template string
  --description <desc> Format description
  --help, -h           Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const config = loadConfig();

  if (sub === "show") {
    console.log(`\nOutput Format Configuration:`);
    console.log("═".repeat(50));
    console.log(`  Default format:     ${config.defaultFormat}`);
    console.log(`  Timestamps:         ${config.includeTimestamps}`);
    console.log(`  Color output:       ${config.colorOutput}`);
    console.log(`  Max width:          ${config.maxWidth}`);
    console.log(`  Verbosity:          ${config.verbosity}`);
    const fmtCount = Object.keys(config.customFormats).length;
    console.log(`  Custom formats:     ${fmtCount}`);
    if (fmtCount > 0) {
      for (const [name, fmt] of Object.entries(config.customFormats)) {
        console.log(`    - ${name}: ${fmt.description || fmt.template.slice(0, 40)}`);
      }
    }
    console.log("═".repeat(50));
  } else if (sub === "set") {
    const key = args.find((_a: string, i: number) => args[i - 1] === "--key");
    const value = args.find((_a: string, i: number) => args[i - 1] === "--value");
    if (!key || !value) {
      console.error("Error: --key and --value required");
      process.exitCode = 1;
      return;
    }

    if (key === "defaultFormat") config.defaultFormat = value;
    else if (key === "includeTimestamps") config.includeTimestamps = value === "true";
    else if (key === "colorOutput") config.colorOutput = value === "true";
    else if (key === "maxWidth") config.maxWidth = parseInt(value, 10);
    else if (key === "verbosity") config.verbosity = value;
    else {
      console.error(`Unknown key: ${key}`);
      process.exitCode = 1;
      return;
    }

    saveConfig(config);
    console.log(`Set ${key} = ${value}`);
  } else if (sub === "add-format") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    const template = args.find((_a: string, i: number) => args[i - 1] === "--template");
    if (!name || !template) {
      console.error("Error: --name and --template required");
      process.exitCode = 1;
      return;
    }
    const desc = args.find((_a: string, i: number) => args[i - 1] === "--description") || "";
    config.customFormats[name] = { template, description: desc };
    saveConfig(config);
    console.log(`Added custom format: ${name}`);
  } else if (sub === "remove-format") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    if (!config.customFormats[name]) {
      console.error(`Format "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    delete config.customFormats[name];
    saveConfig(config);
    console.log(`Removed format: ${name}`);
  } else if (sub === "reset") {
    const f = configFile();
    if (existsSync(f)) writeFileSync(f, "{}");
    console.log("Output format reset to defaults.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
