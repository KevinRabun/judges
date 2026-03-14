/**
 * Team rules sync — fast onboarding by pulling org rules from a
 * shared config file or Git repo's .judgesrc.
 *
 * All config is read-only; stored locally only.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamConfig {
  name: string;
  preset?: string;
  disabledJudges?: string[];
  disabledRules?: string[];
  ruleOverrides?: Record<string, unknown>;
  minSeverity?: string;
  customRules?: string[];
}

interface SyncResult {
  team: string;
  rulesApplied: number;
  presetsApplied: string[];
  overridesApplied: number;
  timestamp: string;
}

const SYNC_DIR = ".judges-team-sync";

// ─── Built-in team templates ────────────────────────────────────────────────

const TEAM_TEMPLATES: Record<string, TeamConfig> = {
  "security-team": {
    name: "Security Team",
    preset: "strict,security-only",
    disabledJudges: [],
    disabledRules: [],
    minSeverity: "low",
    customRules: ["SEC-*", "INJECT-*", "CRYPTO-*", "AUTH-*"],
  },
  "frontend-team": {
    name: "Frontend Team",
    preset: "react,nextjs",
    disabledJudges: [],
    disabledRules: ["PERF-004", "PERF-005"],
    minSeverity: "medium",
    customRules: ["XSS-*", "DOM-*", "CSP-*"],
  },
  "backend-team": {
    name: "Backend Team",
    preset: "express,strict",
    disabledJudges: [],
    disabledRules: [],
    minSeverity: "medium",
    customRules: ["SQL-*", "AUTH-*", "SSRF-*", "CMD-*"],
  },
  "data-team": {
    name: "Data Engineering Team",
    preset: "lenient",
    disabledJudges: [],
    disabledRules: ["PERF-001"],
    minSeverity: "high",
    customRules: ["SQL-*", "SEC-*"],
  },
  startup: {
    name: "Startup / Small Team",
    preset: "startup",
    disabledJudges: [],
    disabledRules: [],
    minSeverity: "medium",
    customRules: [],
  },
};

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(SYNC_DIR)) mkdirSync(SYNC_DIR, { recursive: true });
}

function loadSyncHistory(): SyncResult[] {
  const file = join(SYNC_DIR, "sync-history.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveSyncHistory(history: SyncResult[]): void {
  ensureDir();
  writeFileSync(join(SYNC_DIR, "sync-history.json"), JSON.stringify(history, null, 2));
}

function applyTeamConfig(config: TeamConfig): SyncResult {
  // Load existing .judgesrc or create new
  let existing: Record<string, unknown> = {};
  if (existsSync(".judgesrc")) {
    try {
      existing = JSON.parse(readFileSync(".judgesrc", "utf-8"));
    } catch {
      /* start fresh */
    }
  }

  // Merge
  if (config.preset) existing["preset"] = config.preset;
  if (config.disabledJudges?.length) existing["disabledJudges"] = config.disabledJudges;
  if (config.disabledRules?.length) existing["disabledRules"] = config.disabledRules;
  if (config.ruleOverrides)
    existing["ruleOverrides"] = {
      ...((existing["ruleOverrides"] as Record<string, unknown>) || {}),
      ...config.ruleOverrides,
    };
  if (config.minSeverity) existing["minSeverity"] = config.minSeverity;

  writeFileSync(".judgesrc", JSON.stringify(existing, null, 2));

  const result: SyncResult = {
    team: config.name,
    rulesApplied: (config.customRules?.length || 0) + (config.disabledRules?.length || 0),
    presetsApplied: config.preset ? config.preset.split(",") : [],
    overridesApplied: config.ruleOverrides ? Object.keys(config.ruleOverrides).length : 0,
    timestamp: new Date().toISOString(),
  };

  // Save history
  const history = loadSyncHistory();
  history.push(result);
  if (history.length > 50) history.splice(0, history.length - 50);
  saveSyncHistory(history);

  return result;
}

function syncFromFile(path: string): SyncResult {
  if (!existsSync(path)) throw new Error(`Config file not found: ${path}`);
  const config: TeamConfig = JSON.parse(readFileSync(path, "utf-8"));
  if (!config.name) config.name = basename(path, ".json");
  return applyTeamConfig(config);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTeamRulesSync(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges team-rules-sync — Fast team onboarding with shared rules

Usage:
  judges team-rules-sync --team security-team
  judges team-rules-sync --from ./team-config.json
  judges team-rules-sync --list
  judges team-rules-sync --history
  judges team-rules-sync --scan ./configs/

Options:
  --team <name>           Apply built-in team template
  --from <path>           Sync from a custom team config JSON file
  --list                  List available team templates
  --scan <dir>            Find and list .judgesrc files in directory
  --history               Show sync history
  --dry-run               Preview changes without applying
  --format json           JSON output
  --help, -h              Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List templates
  if (argv.includes("--list")) {
    const templates = Object.entries(TEAM_TEMPLATES);
    if (format === "json") {
      console.log(JSON.stringify(TEAM_TEMPLATES, null, 2));
    } else {
      console.log(`\n  Team Templates (${templates.length})\n  ──────────────────────────`);
      for (const [id, t] of templates) {
        console.log(`    ${id.padEnd(20)} ${t.name.padEnd(25)} preset: ${t.preset || "none"}`);
      }
      console.log(`\n  Use: judges team-rules-sync --team <name>\n`);
    }
    return;
  }

  // History
  if (argv.includes("--history")) {
    const history = loadSyncHistory();
    if (format === "json") {
      console.log(JSON.stringify(history, null, 2));
    } else {
      console.log(`\n  Sync History (${history.length} records)\n  ──────────────────────────`);
      for (const r of history.slice(-20)) {
        console.log(
          `    ${r.timestamp.slice(0, 10)}  ${r.team.padEnd(25)} +${r.rulesApplied} rules, ${r.presetsApplied.join(",") || "none"}`,
        );
      }
      console.log("");
    }
    return;
  }

  // Scan directory
  const scanDir = argv.find((_a: string, i: number) => argv[i - 1] === "--scan");
  if (scanDir) {
    if (!existsSync(scanDir)) {
      console.error(`  Directory not found: ${scanDir}`);
      return;
    }
    const files = readdirSync(scanDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".judgesrc") || f.endsWith("judgesrc.json"));
    if (format === "json") {
      console.log(JSON.stringify(files, null, 2));
    } else {
      console.log(`\n  Config files found in ${scanDir}: ${files.length}\n  ──────────────────────────`);
      for (const f of files) console.log(`    ${f}`);
      console.log("");
    }
    return;
  }

  // Apply team template
  const teamId = argv.find((_a: string, i: number) => argv[i - 1] === "--team");
  if (teamId) {
    const template = TEAM_TEMPLATES[teamId];
    if (!template) {
      console.error(`  Team template not found: ${teamId}`);
      console.error(`  Available: ${Object.keys(TEAM_TEMPLATES).join(", ")}`);
      return;
    }

    if (argv.includes("--dry-run")) {
      console.log(`\n  Dry Run — ${template.name}\n  ──────────────────────────`);
      console.log(`  Preset:   ${template.preset || "none"}`);
      console.log(`  Rules:    ${template.customRules?.join(", ") || "none"}`);
      console.log(`  Disabled: ${template.disabledRules?.join(", ") || "none"}`);
      console.log(`  Min sev:  ${template.minSeverity || "default"}`);
      console.log(`\n  No changes applied (--dry-run)\n`);
      return;
    }

    const result = applyTeamConfig(template);
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n  ✅ Team rules synced: ${result.team}`);
      console.log(`     Rules applied:   ${result.rulesApplied}`);
      console.log(`     Presets:         ${result.presetsApplied.join(", ")}`);
      console.log(`     .judgesrc updated\n`);
    }
    return;
  }

  // Sync from file
  const fromPath = argv.find((_a: string, i: number) => argv[i - 1] === "--from");
  if (fromPath) {
    try {
      const result = syncFromFile(fromPath);
      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\n  ✅ Synced from: ${fromPath}`);
        console.log(`     Team:    ${result.team}`);
        console.log(`     Rules:   ${result.rulesApplied}`);
        console.log(`     Presets: ${result.presetsApplied.join(", ")}\n`);
      }
    } catch (err) {
      console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  console.error("  Use --team, --from, --list, or --history. --help for usage.");
}
