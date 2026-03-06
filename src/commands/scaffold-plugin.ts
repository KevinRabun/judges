/**
 * `judges scaffold-plugin` — Generate a starter custom plugin project.
 *
 * Creates a directory structure with:
 *   - package.json (with @kevinrabun/judges as peer dependency)
 *   - tsconfig.json
 *   - src/index.ts (plugin entry-point with example rule & judge)
 *   - src/rules/example-rule.ts
 *   - README.md
 *
 * Usage:
 *   judges scaffold-plugin my-org-rules
 *   judges scaffold-plugin my-org-rules --dir ./plugins
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

// ─── Templates ───────────────────────────────────────────────────────────────

function packageJsonTemplate(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      description: `Custom Judges Panel plugin: ${name}`,
      type: "module",
      main: "dist/index.js",
      types: "dist/index.d.ts",
      scripts: {
        build: "tsc",
        watch: "tsc --watch",
        test: "node --test dist/**/*.test.js",
      },
      peerDependencies: {
        "@anthropic-ai/sdk": ">=0.39.0",
        "@kevinrabun/judges": "*",
      },
      devDependencies: {
        typescript: "^5.7.0",
      },
      keywords: ["judges-plugin", "code-review", "static-analysis"],
      license: "MIT",
    },
    null,
    2,
  );
}

function tsconfigTemplate(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        declaration: true,
        outDir: "dist",
        rootDir: "src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ["src"],
    },
    null,
    2,
  );
}

function indexTemplate(name: string): string {
  return `/**
 * ${name} — Custom Judges Panel Plugin
 *
 * Register this plugin in your .judgesrc or via the API:
 *
 *   import { registerPlugin } from "@kevinrabun/judges/api";
 *   import plugin from "${name}";
 *   registerPlugin(plugin);
 */

import type { JudgesPlugin, CustomRule } from "@kevinrabun/judges/api";
import { exampleNoTodoRule } from "./rules/example-rule.js";

const plugin: JudgesPlugin = {
  name: "${name}",
  version: "0.1.0",
  description: "Custom rules and judges for ${name}",

  // Register custom rules
  rules: [exampleNoTodoRule],

  // Optionally add custom judges (uncomment to use):
  // judges: [],

  // Hook: post-process findings (e.g., add org metadata)
  // afterEvaluate: (findings) => {
  //   return findings.map((f) => ({
  //     ...f,
  //     tags: [...(f.tags || []), "${name}"],
  //   }));
  // },
};

export default plugin;
`;
}

function exampleRuleTemplate(): string {
  return `/**
 * Example custom rule: no-todo-comments
 *
 * Flags TODO / FIXME / HACK comments as findings.
 * This is a pattern-based rule — the simplest form.
 */

import type { CustomRule } from "@kevinrabun/judges/api";

export const exampleNoTodoRule: CustomRule = {
  id: "CUSTOM-001",
  title: "TODO/FIXME comment detected",
  severity: "info",
  judgeId: "code-structure",
  description: "Flags TODO, FIXME, and HACK comments that should be tracked in an issue tracker.",
  languages: [], // empty = all languages
  pattern: /\\b(TODO|FIXME|HACK|XXX)\\b/i,
  suggestedFix: "Convert this comment into a tracked issue and reference the issue ID.",
  tags: ["tech-debt", "comments"],
};

/**
 * For more complex rules, use the \`analyze\` function instead of \`pattern\`:
 *
 * export const complexRule: CustomRule = {
 *   id: "CUSTOM-002",
 *   title: "Complex custom check",
 *   severity: "medium",
 *   judgeId: "cybersecurity",
 *   description: "Example of a custom rule with analyze function.",
 *   analyze: (code, language) => {
 *     const findings: Finding[] = [];
 *     // Your custom analysis logic here
 *     return findings;
 *   },
 * };
 */
`;
}

function readmeTemplate(name: string): string {
  return `# ${name}

A custom plugin for [Judges Panel](https://github.com/KevinRabun/judges).

## Quick Start

\`\`\`bash
npm install
npm run build
\`\`\`

## Usage

### Via API

\`\`\`ts
import { registerPlugin } from "@kevinrabun/judges/api";
import plugin from "${name}";

registerPlugin(plugin);
\`\`\`

### Via .judgesrc

\`\`\`json
{
  "plugins": ["${name}"]
}
\`\`\`

## Adding Rules

Create a new file in \`src/rules/\` and add it to the plugin's \`rules\` array in \`src/index.ts\`.

### Pattern-Based Rule

\`\`\`ts
import type { CustomRule } from "@kevinrabun/judges/api";

export const myRule: CustomRule = {
  id: "MYORG-001",
  title: "My custom rule",
  severity: "medium",
  judgeId: "cybersecurity",
  description: "What this rule checks.",
  pattern: /dangerousFunction\\(/,
  suggestedFix: "Use safeFunction() instead.",
};
\`\`\`

### Function-Based Rule

\`\`\`ts
import type { CustomRule, Finding } from "@kevinrabun/judges/api";

export const myAdvancedRule: CustomRule = {
  id: "MYORG-002",
  title: "Advanced custom check",
  severity: "high",
  judgeId: "cybersecurity",
  description: "Complex analysis with custom logic.",
  analyze: (code: string, language: string): Finding[] => {
    const findings: Finding[] = [];
    // Your analysis logic here
    return findings;
  },
};
\`\`\`

## License

MIT
`;
}

// ─── Scaffold Command ────────────────────────────────────────────────────────

interface ScaffoldArgs {
  name: string | undefined;
  dir: string;
}

function parseScaffoldArgs(argv: string[]): ScaffoldArgs {
  const args: ScaffoldArgs = { name: undefined, dir: "." };
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir" || arg === "-d") {
      args.dir = argv[++i];
    } else if (!arg.startsWith("-") && !args.name) {
      args.name = arg;
    }
  }
  return args;
}

export function runScaffoldPlugin(argv: string[]): void {
  const args = parseScaffoldArgs(argv);

  if (!args.name) {
    console.error("Error: Plugin name required.");
    console.error("Usage: judges scaffold-plugin <name> [--dir <path>]");
    process.exit(1);
  }

  const name = args.name;
  const root = resolve(args.dir, name);

  if (existsSync(root)) {
    console.error(`Error: Directory already exists: ${root}`);
    process.exit(1);
  }

  // Create directory structure
  mkdirSync(join(root, "src", "rules"), { recursive: true });

  // Write files
  const files: Array<[string, string]> = [
    ["package.json", packageJsonTemplate(name)],
    ["tsconfig.json", tsconfigTemplate()],
    ["README.md", readmeTemplate(name)],
    [join("src", "index.ts"), indexTemplate(name)],
    [join("src", "rules", "example-rule.ts"), exampleRuleTemplate()],
  ];

  for (const [rel, content] of files) {
    writeFileSync(join(root, rel), content, "utf-8");
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           Judges Panel — Plugin Scaffolded                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Created: ${root}`);
  console.log("");
  console.log("  Files:");
  for (const [rel] of files) {
    console.log(`    ${rel}`);
  }
  console.log("");
  console.log("  Next steps:");
  console.log(`    cd ${name}`);
  console.log("    npm install");
  console.log("    npm run build");
  console.log("");
  console.log("  Then register in your project:");
  console.log(`    import plugin from "${name}";`);
  console.log("    registerPlugin(plugin);");
  console.log("");
}
