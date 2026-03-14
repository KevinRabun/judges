/**
 * Review-sandbox — Sandbox mode for testing review configurations safely.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SandboxConfig {
  name: string;
  createdAt: string;
  baseConfig: Record<string, unknown>;
  overrides: Record<string, unknown>;
  notes: string;
}

interface SandboxStore {
  version: string;
  active: string;
  sandboxes: SandboxConfig[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const SANDBOX_FILE = join(".judges", "sandbox.json");

function loadStore(): SandboxStore {
  if (!existsSync(SANDBOX_FILE)) return { version: "1.0.0", active: "", sandboxes: [] };
  try {
    return JSON.parse(readFileSync(SANDBOX_FILE, "utf-8")) as SandboxStore;
  } catch {
    return { version: "1.0.0", active: "", sandboxes: [] };
  }
}

function saveStore(store: SandboxStore): void {
  mkdirSync(dirname(SANDBOX_FILE), { recursive: true });
  writeFileSync(SANDBOX_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSandbox(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-sandbox — Test review configurations safely

Usage:
  judges review-sandbox create --name experiment1  Create a sandbox
  judges review-sandbox list                       List sandboxes
  judges review-sandbox activate --name experiment1  Activate sandbox
  judges review-sandbox deactivate                 Deactivate sandbox
  judges review-sandbox delete --name experiment1  Delete a sandbox
  judges review-sandbox show --name experiment1    Show sandbox details
  judges review-sandbox apply --name experiment1   Apply sandbox to real config

Options:
  --name <name>         Sandbox name
  --preset <preset>     Base preset for sandbox
  --disable <judges>    Comma-separated judges to disable
  --severity <level>    Minimum severity override
  --notes <text>        Description/notes
  --format json         JSON output
  --help, -h            Show this help

Test different review configurations without affecting your real setup.
Data stored locally in .judges/sandbox.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand =
    argv.find((a) => ["create", "list", "activate", "deactivate", "delete", "show", "apply"].includes(a)) || "list";
  const store = loadStore();
  const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");

  if (subcommand === "create") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    if (store.sandboxes.find((s) => s.name === name)) {
      console.error(`Error: Sandbox "${name}" already exists.`);
      process.exitCode = 1;
      return;
    }

    const preset = argv.find((_a: string, i: number) => argv[i - 1] === "--preset") || "";
    const disable = argv.find((_a: string, i: number) => argv[i - 1] === "--disable") || "";
    const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "";
    const notes = argv.find((_a: string, i: number) => argv[i - 1] === "--notes") || "";

    const overrides: Record<string, unknown> = {};
    if (preset) overrides.preset = preset;
    if (disable) overrides.disabledJudges = disable.split(",").map((s) => s.trim());
    if (severity) overrides.minSeverity = severity;

    // Load current .judgesrc as base
    let baseConfig: Record<string, unknown> = {};
    if (existsSync(".judgesrc")) {
      try {
        baseConfig = JSON.parse(readFileSync(".judgesrc", "utf-8")) as Record<string, unknown>;
      } catch {
        /* empty */
      }
    }

    store.sandboxes.push({
      name,
      createdAt: new Date().toISOString(),
      baseConfig,
      overrides,
      notes,
    });
    saveStore(store);
    console.log(`Sandbox "${name}" created.`);
    return;
  }

  if (subcommand === "activate") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    if (!store.sandboxes.find((s) => s.name === name)) {
      console.error(`Error: Sandbox "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    store.active = name;
    saveStore(store);
    console.log(`Sandbox "${name}" activated. Reviews will use sandbox config.`);
    return;
  }

  if (subcommand === "deactivate") {
    store.active = "";
    saveStore(store);
    console.log("Sandbox deactivated. Reviews will use normal config.");
    return;
  }

  if (subcommand === "delete") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    store.sandboxes = store.sandboxes.filter((s) => s.name !== name);
    if (store.active === name) store.active = "";
    saveStore(store);
    console.log(`Sandbox "${name}" deleted.`);
    return;
  }

  if (subcommand === "show") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    const sandbox = store.sandboxes.find((s) => s.name === name);
    if (!sandbox) {
      console.error(`Error: Sandbox "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(sandbox, null, 2));
      return;
    }
    console.log(`\nSandbox: ${sandbox.name}`);
    console.log("─".repeat(40));
    console.log(`  Created:    ${sandbox.createdAt.slice(0, 19)}`);
    console.log(`  Active:     ${store.active === sandbox.name ? "YES" : "no"}`);
    console.log(`  Notes:      ${sandbox.notes || "-"}`);
    console.log(`  Overrides:  ${JSON.stringify(sandbox.overrides)}`);
    console.log("─".repeat(40));
    return;
  }

  if (subcommand === "apply") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    const sandbox = store.sandboxes.find((s) => s.name === name);
    if (!sandbox) {
      console.error(`Error: Sandbox "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    const merged = { ...sandbox.baseConfig, ...sandbox.overrides };
    writeFileSync(".judgesrc", JSON.stringify(merged, null, 2), "utf-8");
    console.log(`Applied sandbox "${name}" config to .judgesrc.`);
    return;
  }

  // list
  if (format === "json") {
    console.log(JSON.stringify({ active: store.active, sandboxes: store.sandboxes.map((s) => s.name) }, null, 2));
    return;
  }

  if (store.sandboxes.length === 0) {
    console.log("No sandboxes configured. Use 'judges review-sandbox create --name <n>' to create one.");
    return;
  }

  console.log("\nSandboxes:");
  console.log("─".repeat(50));
  for (const s of store.sandboxes) {
    const active = store.active === s.name ? " [ACTIVE]" : "";
    console.log(`  ${s.name}${active}  (created: ${s.createdAt.slice(0, 10)})`);
  }
  console.log("─".repeat(50));
}
