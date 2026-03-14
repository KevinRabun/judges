/**
 * Context inject — feed project-specific context (architecture docs,
 * API contracts, coding standards) into evaluation for higher-precision
 * findings.
 *
 * Parses context files and maintains a local context cache for judges.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContextRule {
  source: string;
  category: string;
  rule: string;
  pattern?: string;
}

interface ContextProfile {
  name: string;
  sources: string[];
  rules: ContextRule[];
  createdAt: string;
  updatedAt: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const CONTEXT_DIR = ".judges-context";

function ensureDir(): void {
  if (!existsSync(CONTEXT_DIR)) mkdirSync(CONTEXT_DIR, { recursive: true });
}

function loadProfile(): ContextProfile | null {
  const file = join(CONTEXT_DIR, "profile.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function saveProfile(profile: ContextProfile): void {
  ensureDir();
  writeFileSync(join(CONTEXT_DIR, "profile.json"), JSON.stringify(profile, null, 2));
}

// ─── Context Extraction ────────────────────────────────────────────────────

const RULE_PATTERNS: Array<{ regex: RegExp; category: string }> = [
  { regex: /(?:must|should|always|never|require|mandatory)\s+(.{10,80})/i, category: "requirement" },
  { regex: /(?:do not|don't|avoid|prohibit|forbid)\s+(.{10,80})/i, category: "prohibition" },
  { regex: /(?:all|every)\s+(?:api|endpoint|route|handler)\s+(?:must|should)\s+(.{10,80})/i, category: "api-standard" },
  {
    regex: /(?:database|db|data)\s+(?:access|query|operation)\s+(?:must|should)\s+(.{10,80})/i,
    category: "data-access",
  },
  {
    regex: /(?:error|exception)\s+(?:handling|management)\s+(?:must|should)\s+(.{10,80})/i,
    category: "error-handling",
  },
  { regex: /(?:auth|authentication|authorization)\s+(.{10,80})/i, category: "auth" },
  { regex: /(?:naming|convention|style)\s+(?:must|should|:)\s*(.{10,80})/i, category: "naming" },
  { regex: /(?:test|testing)\s+(?:must|should|require)\s+(.{10,80})/i, category: "testing" },
  { regex: /(?:log|logging)\s+(?:must|should|require)\s+(.{10,80})/i, category: "logging" },
  { regex: /(?:security|secure)\s+(?:must|should|require)\s+(.{10,80})/i, category: "security" },
];

function extractRules(content: string, source: string): ContextRule[] {
  const rules: ContextRule[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    for (const pattern of RULE_PATTERNS) {
      const match = pattern.regex.exec(trimmed);
      if (match) {
        rules.push({ source: basename(source), category: pattern.category, rule: trimmed.substring(0, 120) });
        break;
      }
    }
  }

  return rules;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runContextInject(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges context-inject — Feed project context into evaluation

Usage:
  judges context-inject --add docs/architecture.md
  judges context-inject --add docs/coding-standards.md
  judges context-inject --show
  judges context-inject --scan docs/
  judges context-inject --clear

Options:
  --add <file>          Add a context file (Markdown/YAML/text)
  --scan <dir>          Scan directory for context documents
  --show                Show current context profile
  --clear               Clear all context
  --format json         JSON output
  --help, -h            Show this help

Context files are parsed for rules, standards, and conventions that
judges use to calibrate findings for your specific project.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isAdd = argv.includes("--add");
  const _isShow = argv.includes("--show");
  const isScan = argv.includes("--scan");
  const isClear = argv.includes("--clear");

  if (isClear) {
    saveProfile({
      name: "default",
      sources: [],
      rules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log("  ✅ Context cleared");
    return;
  }

  if (isAdd) {
    const fileIdx = argv.indexOf("--add") + 1;
    const file = argv[fileIdx] || "";
    if (!file || !existsSync(file)) {
      console.error(`  File not found: ${file}`);
      return;
    }

    const content = readFileSync(file, "utf-8");
    const newRules = extractRules(content, file);

    const profile = loadProfile() || {
      name: "default",
      sources: [],
      rules: [],
      createdAt: new Date().toISOString(),
      updatedAt: "",
    };
    if (!profile.sources.includes(file)) profile.sources.push(file);
    profile.rules.push(...newRules);
    profile.updatedAt = new Date().toISOString();
    saveProfile(profile);

    console.log(`  ✅ Added ${file} — extracted ${newRules.length} rule(s)`);
    if (newRules.length > 0) {
      for (const r of newRules.slice(0, 5)) {
        console.log(`    [${r.category}] ${r.rule}`);
      }
      if (newRules.length > 5) console.log(`    ... and ${newRules.length - 5} more`);
    }
    return;
  }

  if (isScan) {
    const dirIdx = argv.indexOf("--scan") + 1;
    const dir = argv[dirIdx] || "docs";
    if (!existsSync(dir)) {
      console.error(`  Directory not found: ${dir}`);
      return;
    }

    const DOC_EXTS = new Set([".md", ".txt", ".yaml", ".yml", ".rst"]);
    let entries: string[];
    try {
      entries = readdirSync(dir) as unknown as string[];
    } catch {
      entries = [];
    }
    const docFiles = entries.filter((e) => DOC_EXTS.has(join(".", e).includes(".") ? "." + e.split(".").pop() : ""));

    const profile = loadProfile() || {
      name: "default",
      sources: [],
      rules: [],
      createdAt: new Date().toISOString(),
      updatedAt: "",
    };
    let totalNew = 0;

    for (const f of docFiles) {
      const fullPath = join(dir, f);
      try {
        const content = readFileSync(fullPath, "utf-8");
        const rules = extractRules(content, fullPath);
        if (!profile.sources.includes(fullPath)) profile.sources.push(fullPath);
        profile.rules.push(...rules);
        totalNew += rules.length;
      } catch {
        /* skip */
      }
    }

    profile.updatedAt = new Date().toISOString();
    saveProfile(profile);
    console.log(`  ✅ Scanned ${docFiles.length} doc(s) in ${dir} — extracted ${totalNew} rule(s)`);
    return;
  }

  // Default: show profile
  const profile = loadProfile();

  if (!profile || profile.rules.length === 0) {
    console.log("  No context loaded. Use --add <file> or --scan <dir> to inject context.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    console.log(
      `\n  Context Profile — ${profile.rules.length} rule(s) from ${profile.sources.length} source(s)\n  ──────────────────────────`,
    );

    const byCategory = new Map<string, ContextRule[]>();
    for (const r of profile.rules) {
      const list = byCategory.get(r.category) || [];
      list.push(r);
      byCategory.set(r.category, list);
    }

    for (const [cat, rules] of byCategory) {
      console.log(`\n    📋 ${cat} (${rules.length}):`);
      for (const r of rules.slice(0, 5)) {
        console.log(`        ${r.rule}`);
      }
      if (rules.length > 5) console.log(`        ... and ${rules.length - 5} more`);
    }

    console.log(`\n    Sources: ${profile.sources.join(", ")}`);
    console.log(`    Last updated: ${profile.updatedAt}\n`);
  }
}
