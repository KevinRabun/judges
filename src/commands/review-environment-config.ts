/**
 * Review-environment-config — Manage per-environment review configurations.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnvironmentConfig {
  name: string;
  preset: string;
  minSeverity: string;
  disabledJudges: string[];
  customRules: Record<string, string>;
}

interface EnvironmentStore {
  environments: EnvironmentConfig[];
  activeEnvironment: string;
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewEnvironmentConfig(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-environments.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const addIdx = argv.indexOf("--add");
  const addName = addIdx >= 0 ? argv[addIdx + 1] : "";
  const activateIdx = argv.indexOf("--activate");
  const activateName = activateIdx >= 0 ? argv[activateIdx + 1] : "";
  const initMode = argv.includes("--init");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-environment-config — Manage per-environment review configs

Usage:
  judges review-environment-config [--store <path>] [--format table|json]
  judges review-environment-config --init [--store <path>]
  judges review-environment-config --add <name> [--store <path>]
  judges review-environment-config --activate <name> [--store <path>]

Options:
  --store <path>      Environment store file (default: .judges-environments.json)
  --init              Create default environment store
  --add <name>        Add a new environment
  --activate <name>   Set the active environment
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  if (initMode) {
    const defaultStore: EnvironmentStore = {
      environments: [
        { name: "development", preset: "default", minSeverity: "info", disabledJudges: [], customRules: {} },
        { name: "staging", preset: "strict", minSeverity: "medium", disabledJudges: [], customRules: {} },
        { name: "production", preset: "strict", minSeverity: "high", disabledJudges: [], customRules: {} },
      ],
      activeEnvironment: "development",
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(storePath, JSON.stringify(defaultStore, null, 2));
    console.log(`Created default environment store: ${storePath}`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No environment store found at: ${storePath}`);
    console.log("Run with --init to create one.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as EnvironmentStore;

  if (addName) {
    const exists = store.environments.some((e) => e.name === addName);
    if (exists) {
      console.error(`Environment already exists: ${addName}`);
      process.exitCode = 1;
      return;
    }
    store.environments.push({
      name: addName,
      preset: "default",
      minSeverity: "info",
      disabledJudges: [],
      customRules: {},
    });
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Added environment: ${addName}`);
    return;
  }

  if (activateName) {
    const exists = store.environments.some((e) => e.name === activateName);
    if (!exists) {
      console.error(`Environment not found: ${activateName}`);
      process.exitCode = 1;
      return;
    }
    store.activeEnvironment = activateName;
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Activated environment: ${activateName}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nEnvironment Configurations");
  console.log("═".repeat(70));
  console.log(
    `  ${"Name".padEnd(18)} ${"Preset".padEnd(12)} ${"Min Severity".padEnd(14)} ${"Disabled".padEnd(10)} Active`,
  );
  console.log("  " + "─".repeat(65));

  for (const env of store.environments) {
    const active = env.name === store.activeEnvironment ? "  *" : "";
    console.log(
      `  ${env.name.padEnd(18)} ${env.preset.padEnd(12)} ${env.minSeverity.padEnd(14)} ${String(env.disabledJudges.length).padEnd(10)}${active}`,
    );
  }

  console.log(`\n  Active: ${store.activeEnvironment}`);
  console.log("═".repeat(70));
}
