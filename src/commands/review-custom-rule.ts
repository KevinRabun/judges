/**
 * Review-custom-rule — Create and manage custom rules for review.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  pattern: string;
  description: string;
  recommendation: string;
  enabled: boolean;
}

interface CustomRuleConfig {
  version: number;
  rules: CustomRule[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadConfig(configPath: string): CustomRuleConfig {
  if (!existsSync(configPath)) {
    return { version: 1, rules: [] };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return { version: 1, rules: [] };
  }
}

function saveConfig(configPath: string, config: CustomRuleConfig): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function testRule(rule: CustomRule, sourceFile: string): Array<{ line: number; match: string }> {
  if (!existsSync(sourceFile)) return [];
  const lines = readFileSync(sourceFile, "utf-8").split("\n");
  const matches: Array<{ line: number; match: string }> = [];

  try {
    const regex = new RegExp(rule.pattern, "gi");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(regex);
      if (m !== null) {
        matches.push({ line: i + 1, match: m[0] });
      }
    }
  } catch {
    // invalid regex
  }

  return matches;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCustomRule(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const configIdx = argv.indexOf("--config");
  const idIdx = argv.indexOf("--id");
  const titleIdx = argv.indexOf("--title");
  const severityIdx = argv.indexOf("--severity");
  const patternIdx = argv.indexOf("--pattern");
  const sourceIdx = argv.indexOf("--source");
  const formatIdx = argv.indexOf("--format");

  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "list";
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-custom-rules.json";
  const ruleId = idIdx >= 0 ? argv[idIdx + 1] : undefined;
  const title = titleIdx >= 0 ? argv[titleIdx + 1] : undefined;
  const severity = severityIdx >= 0 ? argv[severityIdx + 1] : "medium";
  const pattern = patternIdx >= 0 ? argv[patternIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-custom-rule — Manage custom review rules

Usage:
  judges review-custom-rule --action <action> [options]

Actions:
  list       List custom rules (default)
  add        Add a new custom rule
  remove     Remove a custom rule
  test       Test a rule against a source file

Options:
  --action <act>      Action: list, add, remove, test
  --config <path>     Config file (default: .judges-custom-rules.json)
  --id <id>           Rule ID (for add/remove/test)
  --title <title>     Rule title (for add)
  --severity <sev>    Severity: critical, high, medium (default), low, info
  --pattern <regex>   Regex pattern (for add)
  --source <path>     Source file (for test)
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  const config = loadConfig(configPath);

  if (action === "add") {
    if (!ruleId || !pattern) {
      console.error("Error: --id and --pattern required for add");
      process.exitCode = 1;
      return;
    }
    if (config.rules.some((r) => r.id === ruleId)) {
      console.error(`Error: rule ${ruleId} already exists`);
      process.exitCode = 1;
      return;
    }
    config.rules.push({
      id: ruleId,
      title: title || ruleId,
      severity: severity as CustomRule["severity"],
      pattern,
      description: `Custom rule: ${ruleId}`,
      recommendation: "Review matched code for compliance",
      enabled: true,
    });
    saveConfig(configPath, config);
    console.log(`Added rule: ${ruleId}`);
    return;
  }

  if (action === "remove") {
    if (!ruleId) {
      console.error("Error: --id required for remove");
      process.exitCode = 1;
      return;
    }
    const idx = config.rules.findIndex((r) => r.id === ruleId);
    if (idx < 0) {
      console.error(`Error: rule ${ruleId} not found`);
      process.exitCode = 1;
      return;
    }
    config.rules.splice(idx, 1);
    saveConfig(configPath, config);
    console.log(`Removed rule: ${ruleId}`);
    return;
  }

  if (action === "test") {
    if (!ruleId || !sourceFile) {
      console.error("Error: --id and --source required for test");
      process.exitCode = 1;
      return;
    }
    const rule = config.rules.find((r) => r.id === ruleId);
    if (rule === undefined) {
      console.error(`Error: rule ${ruleId} not found`);
      process.exitCode = 1;
      return;
    }
    const matches = testRule(rule, sourceFile);
    if (format === "json") {
      console.log(JSON.stringify({ rule: rule.id, matches }, null, 2));
      return;
    }
    console.log(`\nTest Results: ${rule.id} (${matches.length} matches)`);
    console.log("─".repeat(50));
    for (const m of matches) {
      console.log(`  Line ${String(m.line).padEnd(6)} ${m.match}`);
    }
    return;
  }

  // default: list
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\nCustom Rules (${config.rules.length})`);
  console.log("═".repeat(70));
  console.log(`${"ID".padEnd(18)} ${"Severity".padEnd(10)} ${"Enabled".padEnd(10)} ${"Pattern".padEnd(25)} Title`);
  console.log("─".repeat(70));

  for (const r of config.rules) {
    const pat = r.pattern.length > 23 ? r.pattern.slice(0, 23) + "…" : r.pattern;
    const title2 = r.title.length > 15 ? r.title.slice(0, 15) + "…" : r.title;
    console.log(
      `${r.id.padEnd(18)} ${r.severity.padEnd(10)} ${String(r.enabled).padEnd(10)} ${pat.padEnd(25)} ${title2}`,
    );
  }
  console.log("═".repeat(70));
}
