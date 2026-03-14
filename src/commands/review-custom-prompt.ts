/**
 * Review-custom-prompt — Customize review prompts for project-specific needs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomPrompt {
  id: string;
  name: string;
  description: string;
  template: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

interface PromptStore {
  version: string;
  prompts: CustomPrompt[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const PROMPT_FILE = join(".judges", "custom-prompts.json");

function loadPrompts(): PromptStore {
  if (!existsSync(PROMPT_FILE)) return { version: "1.0.0", prompts: [] };
  try {
    return JSON.parse(readFileSync(PROMPT_FILE, "utf-8")) as PromptStore;
  } catch {
    return { version: "1.0.0", prompts: [] };
  }
}

function savePrompts(store: PromptStore): void {
  mkdirSync(dirname(PROMPT_FILE), { recursive: true });
  writeFileSync(PROMPT_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `prompt-${Date.now().toString(36)}`;
}

// ─── Built-in Templates ─────────────────────────────────────────────────────

const BUILTIN_TEMPLATES: Record<string, string> = {
  security: "Focus on security vulnerabilities: injection, XSS, CSRF, auth bypass, secrets exposure.",
  performance: "Focus on performance issues: N+1 queries, memory leaks, unnecessary allocations, blocking I/O.",
  "api-design": "Focus on API design: REST conventions, error handling, input validation, response formats.",
  accessibility: "Focus on accessibility: ARIA labels, keyboard navigation, screen reader support.",
  "error-handling": "Focus on error handling: try/catch usage, error propagation, user-facing messages.",
};

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCustomPrompt(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-custom-prompt — Customize review prompts for project needs

Usage:
  judges review-custom-prompt add --name "API Review" --template "Focus on REST conventions" --lang typescript
  judges review-custom-prompt list
  judges review-custom-prompt show --name "API Review"
  judges review-custom-prompt remove --id prompt-abc123
  judges review-custom-prompt templates                    Show built-in templates
  judges review-custom-prompt clear

Subcommands:
  add                   Add a custom prompt
  list                  List all custom prompts
  show                  Show a specific prompt
  remove                Remove a custom prompt
  templates             Show built-in templates
  clear                 Clear all custom prompts

Options:
  --name <name>         Prompt name
  --template <text>     Prompt template text
  --desc <text>         Description
  --lang <language>     Target language
  --id <id>             Prompt ID
  --format json         JSON output
  --help, -h            Show this help

Custom prompts stored in .judges/custom-prompts.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "show", "remove", "templates", "clear"].includes(a)) || "list";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadPrompts();

  if (subcommand === "templates") {
    if (format === "json") {
      console.log(JSON.stringify(BUILTIN_TEMPLATES, null, 2));
      return;
    }
    console.log("\nBuilt-in Prompt Templates:");
    console.log("─".repeat(60));
    for (const [name, template] of Object.entries(BUILTIN_TEMPLATES)) {
      console.log(`  ${name.padEnd(20)} ${template.slice(0, 60)}...`);
    }
    console.log("─".repeat(60));
    return;
  }

  if (subcommand === "add") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "";
    const template = argv.find((_a: string, i: number) => argv[i - 1] === "--template") || "";
    const desc = argv.find((_a: string, i: number) => argv[i - 1] === "--desc") || "";
    const lang = argv.find((_a: string, i: number) => argv[i - 1] === "--lang") || "*";

    if (!name || !template) {
      console.error("Error: --name and --template are required.");
      process.exitCode = 1;
      return;
    }

    // Check for duplicate name
    if (store.prompts.some((p) => p.name === name)) {
      console.error(`Error: Prompt "${name}" already exists. Remove it first.`);
      process.exitCode = 1;
      return;
    }

    const id = generateId();
    const now = new Date().toISOString();
    store.prompts.push({ id, name, description: desc, template, language: lang, createdAt: now, updatedAt: now });
    savePrompts(store);
    console.log(`Added custom prompt "${name}" (${id}).`);
    return;
  }

  if (subcommand === "show") {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "";
    const prompt = store.prompts.find((p) => p.name === name);
    if (!prompt) {
      console.error(`Error: Prompt "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(prompt, null, 2));
      return;
    }
    console.log(`\nPrompt: ${prompt.name} (${prompt.id})`);
    console.log("─".repeat(50));
    console.log(`  Language:    ${prompt.language}`);
    console.log(`  Description: ${prompt.description || "(none)"}`);
    console.log(`  Created:     ${prompt.createdAt.slice(0, 10)}`);
    console.log(`  Template:`);
    console.log(`    ${prompt.template}`);
    console.log("─".repeat(50));
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const before = store.prompts.length;
    store.prompts = store.prompts.filter((p) => p.id !== id);
    if (store.prompts.length === before) {
      console.error(`Error: Prompt "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    savePrompts(store);
    console.log(`Removed prompt ${id}.`);
    return;
  }

  if (subcommand === "clear") {
    savePrompts({ version: "1.0.0", prompts: [] });
    console.log("Custom prompts cleared.");
    return;
  }

  // list
  if (store.prompts.length === 0) {
    console.log("No custom prompts. Use 'judges review-custom-prompt add' or 'templates' to get started.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.prompts, null, 2));
    return;
  }

  console.log("\nCustom Prompts:");
  console.log("─".repeat(70));
  for (const p of store.prompts) {
    console.log(`  ${p.id}  ${p.name.padEnd(25)} lang=${p.language}  ${p.createdAt.slice(0, 10)}`);
    if (p.description) console.log(`    ${p.description}`);
  }
  console.log("─".repeat(70));
  console.log(
    `  Total: ${store.prompts.length} prompt(s), ${Object.keys(BUILTIN_TEMPLATES).length} built-in template(s)`,
  );
}
