/**
 * Review-config-export — Export and import review configurations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConfigBundle {
  version: string;
  exportedAt: string;
  source: string;
  config: Record<string, unknown>;
  metadata: { name: string; description: string };
}

// ─── Config Discovery ───────────────────────────────────────────────────────

const CONFIG_FILES = [".judgesrc", ".judgesrc.json", "judgesrc.json"];

function findConfigFile(): string | null {
  for (const f of CONFIG_FILES) {
    if (existsSync(f)) return f;
  }
  return null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewConfigExport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-config-export — Export and import review configurations

Usage:
  judges review-config-export export --out config-bundle.json
  judges review-config-export import --file config-bundle.json
  judges review-config-export show

Subcommands:
  export                Export current config as a shareable bundle
  import                Import a config bundle
  show                  Show current config

Options:
  --out <path>          Output path for export
  --file <path>         Config bundle to import
  --config <path>       Config file path (auto-detected)
  --name <text>         Bundle name
  --desc <text>         Bundle description
  --format json         JSON output
  --help, -h            Show this help

Enables sharing review configurations between projects and team members.
`);
    return;
  }

  const subcommand = argv.find((a) => ["export", "import", "show"].includes(a)) || "show";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (subcommand === "export") {
    const configArg = argv.find((_a: string, i: number) => argv[i - 1] === "--config");
    const configFile = configArg || findConfigFile();
    const outPath = argv.find((_a: string, i: number) => argv[i - 1] === "--out") || "judges-config-bundle.json";
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "Judges Config";
    const desc = argv.find((_a: string, i: number) => argv[i - 1] === "--desc") || "";

    if (!configFile || !existsSync(configFile)) {
      console.error("Error: No config file found. Use --config to specify.");
      process.exitCode = 1;
      return;
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(readFileSync(configFile, "utf-8")) as Record<string, unknown>;
    } catch {
      console.error("Error: Could not parse config file.");
      process.exitCode = 1;
      return;
    }

    const bundle: ConfigBundle = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      source: configFile,
      config,
      metadata: { name, description: desc },
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(bundle, null, 2), "utf-8");
    console.log(`Exported config to "${outPath}".`);
    return;
  }

  if (subcommand === "import") {
    const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!filePath || !existsSync(filePath)) {
      console.error("Error: --file is required and must exist.");
      process.exitCode = 1;
      return;
    }

    let bundle: ConfigBundle;
    try {
      bundle = JSON.parse(readFileSync(filePath, "utf-8")) as ConfigBundle;
    } catch {
      console.error("Error: Could not parse config bundle.");
      process.exitCode = 1;
      return;
    }

    if (!bundle.config) {
      console.error("Error: Invalid config bundle (missing 'config' field).");
      process.exitCode = 1;
      return;
    }

    const targetFile = findConfigFile() || ".judgesrc.json";
    mkdirSync(dirname(targetFile), { recursive: true });
    writeFileSync(targetFile, JSON.stringify(bundle.config, null, 2), "utf-8");
    console.log(`Imported config from "${filePath}" to "${targetFile}".`);
    if (bundle.metadata.name) console.log(`  Bundle: ${bundle.metadata.name}`);
    if (bundle.metadata.description) console.log(`  Description: ${bundle.metadata.description}`);
    return;
  }

  // show
  const configFile = findConfigFile();
  if (!configFile || !existsSync(configFile)) {
    console.log("No config file found.");
    return;
  }

  const content = readFileSync(configFile, "utf-8");

  if (format === "json") {
    console.log(content);
    return;
  }

  console.log(`\nCurrent Config (${configFile}):`);
  console.log("─".repeat(50));
  console.log(content);
  console.log("─".repeat(50));
}
