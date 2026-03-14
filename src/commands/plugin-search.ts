/**
 * `judges plugin search` — Plugin discovery from a curated registry.
 *
 * Uses a local JSON registry file (bundled with judges) to list available
 * community and official plugins. No network calls — the registry is
 * versioned alongside the codebase and updated when judges is updated.
 *
 * Usage:
 *   judges plugin search                    List all plugins
 *   judges plugin search security           Search by keyword
 *   judges plugin search --category custom  Filter by category
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { defaultRegistry } from "../judge-registry.js";

// ─── Registry Types ─────────────────────────────────────────────────────────

export interface PluginEntry {
  /** Plugin npm package name or repo URL */
  name: string;
  /** Short description */
  description: string;
  /** Plugin version */
  version: string;
  /** Author or org */
  author: string;
  /** Category tags */
  categories: string[];
  /** Install command */
  install: string;
  /** Link to documentation or source */
  url?: string;
  /** Whether this is an official (first-party) plugin */
  official?: boolean;
}

export interface PluginRegistry {
  /** Registry format version */
  version: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Available plugins */
  plugins: PluginEntry[];
}

// ─── Registry Loading ───────────────────────────────────────────────────────

/**
 * Load the bundled plugin registry.
 * Falls back to an empty registry if the file doesn't exist.
 */
function loadRegistry(): PluginRegistry {
  // The registry lives alongside the distributed package
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const registryPath = join(__dirname, "..", "plugin-registry.json");
    const raw = readFileSync(registryPath, "utf-8");
    return JSON.parse(raw) as PluginRegistry;
  } catch {
    // Return the built-in seed registry
    return SEED_REGISTRY;
  }
}

// ─── Seed Registry ──────────────────────────────────────────────────────────
// Bundled starter entries — extended by the plugin-registry.json file.

const SEED_REGISTRY: PluginRegistry = {
  version: "1.0",
  updatedAt: new Date().toISOString(),
  plugins: [
    {
      name: "@kevinrabun/judges-plugin-react",
      description:
        "React-specific security and quality rules: XSS via dangerouslySetInnerHTML, hooks misuse, key prop validation",
      version: "0.1.0",
      author: "judges",
      categories: ["react", "frontend", "security"],
      install: "npm install @kevinrabun/judges-plugin-react",
      official: true,
    },
    {
      name: "@kevinrabun/judges-plugin-aws",
      description: "AWS infrastructure rules: IAM over-permissioning, S3 public access, Lambda cold start patterns",
      version: "0.1.0",
      author: "judges",
      categories: ["aws", "cloud", "infrastructure", "security"],
      install: "npm install @kevinrabun/judges-plugin-aws",
      official: true,
    },
    {
      name: "@kevinrabun/judges-plugin-kubernetes",
      description: "Kubernetes manifest validation: pod security, resource limits, network policies",
      version: "0.1.0",
      author: "judges",
      categories: ["kubernetes", "infrastructure", "security"],
      install: "npm install @kevinrabun/judges-plugin-kubernetes",
      official: true,
    },
    {
      name: "@kevinrabun/judges-plugin-database",
      description: "Database query and schema rules: N+1 detection, missing indexes, migration safety",
      version: "0.1.0",
      author: "judges",
      categories: ["database", "performance", "quality"],
      install: "npm install @kevinrabun/judges-plugin-database",
      official: true,
    },
    {
      name: "@kevinrabun/judges-plugin-graphql",
      description: "GraphQL schema and resolver rules: depth limiting, query complexity, authorization",
      version: "0.1.0",
      author: "judges",
      categories: ["graphql", "api", "security"],
      install: "npm install @kevinrabun/judges-plugin-graphql",
      official: true,
    },
  ],
};

// ─── Search & Filter ────────────────────────────────────────────────────────

function searchPlugins(registry: PluginRegistry, query?: string, category?: string): PluginEntry[] {
  let results = registry.plugins;

  if (category) {
    const cat = category.toLowerCase();
    results = results.filter((p) => p.categories.some((c) => c.toLowerCase() === cat));
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.categories.some((c) => c.toLowerCase().includes(q)) ||
        p.author.toLowerCase().includes(q),
    );
  }

  return results;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatPluginList(plugins: PluginEntry[]): string {
  if (plugins.length === 0) {
    return "No plugins found matching your search.\n";
  }

  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════╗",
    "║              Judges — Plugin Registry                       ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
    `Found ${plugins.length} plugin(s):`,
    "",
  ];

  for (const p of plugins) {
    const badge = p.official ? " ✓ official" : "";
    lines.push(`  ${p.name}${badge}`);
    lines.push(`    ${p.description}`);
    lines.push(`    Categories: ${p.categories.join(", ")}   Version: ${p.version}`);
    lines.push(`    Install: ${p.install}`);
    if (p.url) lines.push(`    Docs: ${p.url}`);
    lines.push("");
  }

  lines.push("To add a plugin to your project:");
  lines.push("  1. Install: npm install <plugin-name>");
  lines.push('  2. Add to .judgesrc: { "plugins": ["<plugin-name>"] }');
  lines.push("");

  return lines.join("\n");
}

function formatPluginJson(plugins: PluginEntry[]): string {
  return JSON.stringify(plugins, null, 2);
}

// ─── CLI Entry ──────────────────────────────────────────────────────────────

export function runPluginSearch(argv: string[]): void {
  // Detect subcommand: judges plugin <sub> [args]
  const sub = argv[3];

  if (sub === "list") {
    listInstalledPlugins();
    return;
  }

  if (sub === "init") {
    const name = argv[4];
    if (!name) {
      console.error("  Usage: judges plugin init <name>");
      process.exit(1);
    }
    scaffoldPlugin(name);
    return;
  }

  if (sub === "info") {
    const name = argv[4];
    if (!name) {
      console.error("  Usage: judges plugin info <name>");
      process.exit(1);
    }
    showPluginInfo(name);
    return;
  }

  // Default: search
  let query: string | undefined;
  let category: string | undefined;
  let format = "text";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--category" && argv[i + 1]) category = argv[++i];
    else if (arg === "--format" && argv[i + 1]) format = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-") && arg !== "plugin" && arg !== "search") {
      query = arg;
    }
  }

  const registry = loadRegistry();
  const results = searchPlugins(registry, query, category);

  if (format === "json") {
    console.log(formatPluginJson(results));
  } else {
    console.log(formatPluginList(results));
  }
}

// ─── List Installed Plugins ─────────────────────────────────────────────────

function listInstalledPlugins(): void {
  const installed = defaultRegistry.getRegisteredPlugins();
  if (installed.length === 0) {
    console.log("\n  No plugins installed.\n");
    console.log("  To create a plugin: judges plugin init <name>");
    console.log("  To browse plugins:  judges plugin search\n");
    return;
  }
  console.log("\n  Installed Plugins:");
  console.log("  " + "─".repeat(55));
  console.log(`  ${"Name".padEnd(30)} ${"Version".padEnd(10)} Rules  Judges`);
  console.log("  " + "─".repeat(55));
  for (const p of installed) {
    console.log(
      `  ${p.name.padEnd(30)} v${p.version.padEnd(9)} ${String(p.rulesRegistered).padStart(5)}  ${String(p.judgesRegistered).padStart(6)}`,
    );
  }
  console.log("");
}

// ─── Plugin Info ────────────────────────────────────────────────────────────

function showPluginInfo(name: string): void {
  // Check installed first
  const installed = defaultRegistry.getRegisteredPlugins();
  const found = installed.find((p) => p.name === name);
  if (found) {
    console.log(`\n  Plugin  : ${found.name}`);
    console.log(`  Version : ${found.version}`);
    console.log(`  Rules   : ${found.rulesRegistered}`);
    console.log(`  Judges  : ${found.judgesRegistered}`);
    console.log(`  Status  : installed ✅\n`);
    return;
  }
  // Check registry
  const registry = loadRegistry();
  const entry = registry.plugins.find((p) => p.name === name || p.name.endsWith(`/${name}`));
  if (entry) {
    console.log(`\n  Plugin      : ${entry.name}`);
    console.log(`  Version     : ${entry.version}`);
    console.log(`  Description : ${entry.description}`);
    console.log(`  Author      : ${entry.author}`);
    console.log(`  Categories  : ${entry.categories.join(", ")}`);
    console.log(`  Install     : ${entry.install}`);
    if (entry.url) console.log(`  Docs        : ${entry.url}`);
    console.log(`  Status      : not installed\n`);
    return;
  }
  console.log(`\n  Plugin "${name}" not found.\n`);
  console.log("  Search available plugins: judges plugin search\n");
}

// ─── Scaffold New Plugin ────────────────────────────────────────────────────

function scaffoldPlugin(name: string): void {
  const dir = join(process.cwd(), name);
  if (existsSync(dir)) {
    console.error(`  Error: Directory '${name}' already exists.`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `judges-plugin-${name}`,
        version: "0.1.0",
        type: "module",
        main: "dist/index.js",
        types: "dist/index.d.ts",
        keywords: ["judges-plugin", "code-review", "security"],
        peerDependencies: { "@kevinrabun/judges": "*" },
        scripts: { build: "tsc" },
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "Node16",
          moduleResolution: "Node16",
          outDir: "./dist",
          rootDir: "./src",
          strict: true,
          declaration: true,
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(dir, "src", "index.ts"),
    `/**
 * ${name} — Judges Panel Plugin
 *
 * import { registerPlugin } from "@kevinrabun/judges/api";
 * import plugin from "judges-plugin-${name}";
 * registerPlugin(plugin);
 */

import type { JudgesPlugin } from "@kevinrabun/judges/api";

const plugin: JudgesPlugin = {
  name: "${name}",
  version: "0.1.0",
  description: "Custom judges plugin",
  rules: [
    // {
    //   id: "CUSTOM-001",
    //   title: "Example Rule",
    //   severity: "medium",
    //   judgeId: "custom",
    //   description: "Describe what this rule checks",
    //   pattern: /your-regex-pattern/,
    //   suggestedFix: "Fix suggestion",
    //   tags: ["custom"],
    // },
  ],
};

export default plugin;
`,
    "utf-8",
  );

  console.log(`\n  ✅ Plugin scaffolded at: ./${name}/`);
  console.log(`\n  Next steps:`);
  console.log(`    1. cd ${name}`);
  console.log(`    2. Add custom rules to src/index.ts`);
  console.log(`    3. npm run build`);
  console.log(`    4. Register in your project: import & registerPlugin()\n`);
}

// ─── Help ───────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
judges plugin — Plugin discovery and management

Usage:
  judges plugin search                      List all plugins
  judges plugin search security             Search by keyword
  judges plugin search --category aws       Filter by category
  judges plugin list                        List installed plugins
  judges plugin info <name>                 Show plugin details
  judges plugin init <name>                 Scaffold a new plugin project

Options:
  --category <name>   Filter by category (e.g. security, aws, react)
  --format <fmt>      Output format: text (default), json
  -h, --help          Show this help

The plugin registry is bundled locally — no network calls are made.
`);
}
