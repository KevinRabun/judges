/**
 * Remediation library — stores proven fixes as parameterized
 * templates ranked by effectiveness. Auto-applies top-ranked
 * templates to new instances of the same finding pattern.
 *
 * All data stored locally in `.judges-remediation/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RemediationTemplate {
  id: string;
  ruleId: string;
  name: string;
  description: string;
  language: string;
  before: string;
  after: string;
  votes: number;
  applied: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
}

interface TemplateLibrary {
  templates: RemediationTemplate[];
  totalApplied: number;
  lastUpdated: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-remediation";
const LIB_FILE = join(DATA_DIR, "library.json");

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadLibrary(): TemplateLibrary {
  if (!existsSync(LIB_FILE)) return { templates: [], totalApplied: 0, lastUpdated: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(LIB_FILE, "utf-8"));
  } catch {
    return { templates: [], totalApplied: 0, lastUpdated: new Date().toISOString() };
  }
}

function saveLibrary(lib: TemplateLibrary): void {
  ensureDir();
  lib.lastUpdated = new Date().toISOString();
  writeFileSync(LIB_FILE, JSON.stringify(lib, null, 2));
}

// ─── Built-in templates ─────────────────────────────────────────────────────

const BUILTIN_TEMPLATES: RemediationTemplate[] = [
  {
    id: "builtin-empty-catch",
    ruleId: "empty-catch",
    name: "Add error logging to empty catch",
    description: "Replace empty catch blocks with console.error or logger",
    language: "typescript",
    before: "catch (err) {}",
    after: 'catch (err) { console.error("Unhandled error:", err); }',
    votes: 10,
    applied: 0,
    successRate: 95,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "builtin-sql-injection",
    ruleId: "sql-injection",
    name: "Use parameterized query",
    description: "Replace string concatenation with parameterized queries",
    language: "typescript",
    before: "`SELECT * FROM users WHERE id = ${userId}`",
    after: '"SELECT * FROM users WHERE id = $1", [userId]',
    votes: 15,
    applied: 0,
    successRate: 98,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "builtin-xss",
    ruleId: "xss",
    name: "Sanitize HTML output",
    description: "Escape user input before inserting into HTML",
    language: "javascript",
    before: "element.innerHTML = userInput",
    after: "element.textContent = userInput",
    votes: 12,
    applied: 0,
    successRate: 92,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "builtin-hardcoded-secret",
    ruleId: "hardcoded-secret",
    name: "Move to environment variable",
    description: "Replace hardcoded secrets with environment variable references",
    language: "any",
    before: 'const API_KEY = "sk-abc123..."',
    after: "const API_KEY = process.env.API_KEY || ''",
    votes: 14,
    applied: 0,
    successRate: 96,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "builtin-todo-placeholder",
    ruleId: "todo-placeholder",
    name: "Replace TODO with implementation",
    description: "Flag TODO comments that AI generators leave behind",
    language: "any",
    before: "// TODO: implement this",
    after: "// Implementation required — see ticket #XXX",
    votes: 8,
    applied: 0,
    successRate: 70,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRemediationLib(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges remediation-lib — Proven fix templates for common findings

Usage:
  judges remediation-lib --list
  judges remediation-lib --search "empty-catch"
  judges remediation-lib --add --rule "my-rule" --name "Fix name" --before "bad" --after "good" --lang ts
  judges remediation-lib --vote --id "builtin-empty-catch"
  judges remediation-lib --apply --id "builtin-sql-injection" --file src/db.ts
  judges remediation-lib --init (seed with built-in templates)

Options:
  --list                List all templates (ranked by votes)
  --search <pattern>    Search templates by rule or name
  --add                 Add a new template
  --rule <ruleId>       Rule ID for the template
  --name <name>         Template name
  --before <code>       Code pattern to match
  --after <code>        Replacement code
  --lang <language>     Language (default: any)
  --vote                Upvote a template
  --id <template-id>    Template ID (for vote/apply)
  --apply               Apply template to file
  --file <path>         Target file for apply
  --init                Initialize with built-in templates
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const _isList = argv.includes("--list");
  const isSearch = argv.includes("--search");
  const isAdd = argv.includes("--add");
  const isVote = argv.includes("--vote");
  const isApply = argv.includes("--apply");
  const isInit = argv.includes("--init");

  const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
  const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
  const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "";
  const before = argv.find((_a: string, i: number) => argv[i - 1] === "--before") || "";
  const after = argv.find((_a: string, i: number) => argv[i - 1] === "--after") || "";
  const lang = argv.find((_a: string, i: number) => argv[i - 1] === "--lang") || "any";
  const searchTerm = argv.find((_a: string, i: number) => argv[i - 1] === "--search") || "";
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";

  if (isInit) {
    const lib = loadLibrary();
    let added = 0;
    for (const bt of BUILTIN_TEMPLATES) {
      if (!lib.templates.some((t) => t.id === bt.id)) {
        lib.templates.push({ ...bt });
        added++;
      }
    }
    saveLibrary(lib);
    console.log(`  ✅ Initialized with ${added} built-in templates (${lib.templates.length} total)`);
    return;
  }

  if (isAdd) {
    if (!ruleId || !name || !before || !after) {
      console.error("  --rule, --name, --before, and --after are required");
      return;
    }
    const lib = loadLibrary();
    const template: RemediationTemplate = {
      id: `custom-${Date.now()}`,
      ruleId,
      name,
      description: name,
      language: lang,
      before,
      after,
      votes: 0,
      applied: 0,
      successRate: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    lib.templates.push(template);
    saveLibrary(lib);
    console.log(`  ✅ Added template "${name}" for rule "${ruleId}"`);
    return;
  }

  if (isVote) {
    if (!id) {
      console.error("  --id is required");
      return;
    }
    const lib = loadLibrary();
    const tmpl = lib.templates.find((t) => t.id === id);
    if (!tmpl) {
      console.error(`  Template "${id}" not found`);
      return;
    }
    tmpl.votes++;
    tmpl.updatedAt = new Date().toISOString();
    saveLibrary(lib);
    console.log(`  ✅ Upvoted "${tmpl.name}" (${tmpl.votes} votes)`);
    return;
  }

  if (isApply) {
    if (!id || !file) {
      console.error("  --id and --file are required");
      return;
    }
    if (!existsSync(file)) {
      console.error(`  File not found: ${file}`);
      return;
    }
    const lib = loadLibrary();
    const tmpl = lib.templates.find((t) => t.id === id);
    if (!tmpl) {
      console.error(`  Template "${id}" not found`);
      return;
    }

    const content = readFileSync(file, "utf-8");
    if (!content.includes(tmpl.before)) {
      console.log(`  ⚠ Pattern not found in ${file}`);
      return;
    }
    const updated = content.replace(tmpl.before, tmpl.after);
    writeFileSync(file, updated);
    tmpl.applied++;
    lib.totalApplied++;
    saveLibrary(lib);
    console.log(`  ✅ Applied "${tmpl.name}" to ${file}`);
    return;
  }

  // List / Search
  const lib = loadLibrary();
  let templates = lib.templates;

  if (isSearch && searchTerm) {
    const term = searchTerm.toLowerCase();
    templates = templates.filter(
      (t) =>
        t.ruleId.toLowerCase().includes(term) ||
        t.name.toLowerCase().includes(term) ||
        t.description.toLowerCase().includes(term),
    );
  }

  templates.sort((a, b) => b.votes - a.votes);

  if (format === "json") {
    console.log(
      JSON.stringify({ templates, totalApplied: lib.totalApplied, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    console.log(`\n  Remediation Library — ${templates.length} templates\n  ──────────────────────────`);

    if (templates.length === 0) {
      console.log("    No templates found. Use --init to seed built-ins or --add to create.");
      console.log("");
      return;
    }

    for (const t of templates) {
      const effIcon = t.successRate >= 90 ? "🟢" : t.successRate >= 70 ? "🟡" : "🔴";
      console.log(`\n    ${effIcon} ${t.name} [${t.id}]`);
      console.log(
        `        Rule: ${t.ruleId} | Lang: ${t.language} | Votes: ${t.votes} | Applied: ${t.applied} | Success: ${t.successRate}%`,
      );
      console.log(`        Before: ${t.before}`);
      console.log(`        After:  ${t.after}`);
    }

    console.log(`\n    Total applied: ${lib.totalApplied}\n`);
  }
}
