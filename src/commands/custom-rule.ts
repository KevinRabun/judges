/**
 * Custom-rule — Load and run user-defined custom review rules from local config.
 */

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomRule {
  id: string;
  description: string;
  severity: string;
  pattern: string;
  fileTypes: string[];
  message: string;
}

interface CustomRuleMatch {
  ruleId: string;
  severity: string;
  message: string;
  file: string;
  line: number;
  content: string;
}

interface CustomRuleResult {
  rulesLoaded: number;
  filesScanned: number;
  matches: CustomRuleMatch[];
  counts: { critical: number; high: number; medium: number; low: number; total: number };
}

// ─── Rule loading ──────────────────────────────────────────────────────────

function loadCustomRules(configPath: string): CustomRule[] {
  if (!existsSync(configPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    if (Array.isArray(raw.rules)) {
      return (raw.rules as CustomRule[]).filter((r) => r.id && r.pattern);
    }
    return [];
  } catch {
    return [];
  }
}

function defaultRulesTemplate(): { rules: CustomRule[] } {
  return {
    rules: [
      {
        id: "no-fixme",
        description: "Disallow FIXME comments in production code",
        severity: "medium",
        pattern: "//\\s*FIXME\\b",
        fileTypes: [".ts", ".js", ".tsx", ".jsx"],
        message: "FIXME comment found — resolve before merging",
      },
      {
        id: "no-console-error",
        description: "Disallow console.error in production code",
        severity: "low",
        pattern: "console\\.error\\s*\\(",
        fileTypes: [".ts", ".js"],
        message: "Use a structured logger instead of console.error",
      },
      {
        id: "no-any-cast",
        description: "Disallow 'as any' type casts",
        severity: "medium",
        pattern: "as\\s+any\\b",
        fileTypes: [".ts", ".tsx"],
        message: "Avoid 'as any' — use proper type assertions or generics",
      },
    ],
  };
}

// ─── File collection ───────────────────────────────────────────────────────

function collectSourceFiles(dir: string, fileTypes: Set<string>): string[] {
  const files: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      const full = join(d, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (fileTypes.has(extname(name))) files.push(full);
      } catch {
        // skip
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ──────────────────────────────────────────────────────────────

function runCustomRules(rules: CustomRule[], dir: string): CustomRuleResult {
  // Collect all relevant file types
  const allFileTypes = new Set<string>();
  for (const rule of rules) {
    for (const ft of rule.fileTypes) allFileTypes.add(ft);
  }

  const files = collectSourceFiles(dir, allFileTypes);
  const matches: CustomRuleMatch[] = [];

  for (const filePath of files) {
    const ext = extname(filePath);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    for (const rule of rules) {
      if (!rule.fileTypes.includes(ext)) continue;

      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, "i");
      } catch {
        continue;
      }

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            ruleId: rule.id,
            severity: rule.severity || "medium",
            message: rule.message || rule.description,
            file: filePath,
            line: i + 1,
            content: lines[i].trim().slice(0, 100),
          });
        }
      }
    }
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: matches.length };
  for (const m of matches) {
    if (m.severity === "critical") counts.critical++;
    else if (m.severity === "high") counts.high++;
    else if (m.severity === "medium") counts.medium++;
    else counts.low++;
  }

  return { rulesLoaded: rules.length, filesScanned: files.length, matches, counts };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCustomRule(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges custom-rule — Load and run user-defined custom review rules

Usage:
  judges custom-rule [dir]                  Run custom rules on directory
  judges custom-rule init                   Create template custom-rules.json
  judges custom-rule --config rules.json    Use specific config file
  judges custom-rule --format json          JSON output

Options:
  [dir]                      Target directory (default: .)
  init                       Create a template custom-rules.json
  --config <path>            Path to custom rules file (default: custom-rules.json)
  --format json              JSON output
  --help, -h                 Show this help

Custom rules are defined in a JSON file with pattern (regex), severity,
file types, and a message. Rules are applied to matching files locally.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const configPath = argv.find((_a: string, i: number) => argv[i - 1] === "--config") || "custom-rules.json";

  // Check for init subcommand
  const hasInit = argv.some((a) => a === "init" && !argv[argv.indexOf(a) - 1]?.startsWith("--"));
  if (hasInit) {
    if (existsSync(configPath)) {
      console.error(`Error: ${configPath} already exists.`);
      process.exitCode = 1;
      return;
    }
    writeFileSync(configPath, JSON.stringify(defaultRulesTemplate(), null, 2), "utf-8");
    console.log(`Created ${configPath} with example rules. Edit to add your own.`);
    return;
  }

  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        a !== "custom-rule" &&
        a !== "init" &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--config",
    ) || ".";

  const rules = loadCustomRules(configPath);
  if (rules.length === 0) {
    console.log(`No custom rules found in ${configPath}. Run 'judges custom-rule init' to create a template.`);
    return;
  }

  const result = runCustomRules(rules, dir);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Custom Rule Review\n  ─────────────────────────────`);
  console.log(`    Rules loaded: ${result.rulesLoaded}`);
  console.log(`    Files scanned: ${result.filesScanned}`);
  console.log(
    `    Matches: ${result.counts.total} (C:${result.counts.critical} H:${result.counts.high} M:${result.counts.medium} L:${result.counts.low})`,
  );

  if (result.matches.length > 0) {
    console.log("\n    Matches:");
    for (const m of result.matches.slice(0, 30)) {
      const sevIcon =
        m.severity === "critical" ? "🔴" : m.severity === "high" ? "🟠" : m.severity === "medium" ? "🟡" : "🔵";
      console.log(`      ${sevIcon} [${m.ruleId}] ${m.message}`);
      console.log(`           ${m.file}:${m.line}`);
    }
    if (result.matches.length > 30) console.log(`      ... +${result.matches.length - 30} more`);
  } else {
    console.log("\n    ✅ No custom rule violations found.");
  }

  console.log();
}
