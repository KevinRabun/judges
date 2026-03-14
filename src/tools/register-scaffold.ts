// ─── MCP Scaffold Tools ──────────────────────────────────────────────────────
// Provides an interactive scaffold_judge tool that generates the boilerplate
// files needed to add a new judge or plugin to the Judges Panel.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { JUDGES } from "../judges/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function kebabToPascal(s: string): string {
  const camel = kebabToCamel(s);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerScaffoldTools(server: McpServer): void {
  registerScaffoldJudge(server);
  registerScaffoldPlugin(server);
}

// ─── scaffold_judge ──────────────────────────────────────────────────────────

function registerScaffoldJudge(server: McpServer): void {
  server.tool(
    "scaffold_judge",
    "Generate the boilerplate files to add a new judge to the Judges Panel. Creates the judge definition (with self-registration), evaluator skeleton, and tells you the one line to add to index.ts. Validates that the judge ID and rule prefix are unique.",
    {
      id: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/, "Must be kebab-case (e.g., 'supply-chain')")
        .describe("Unique kebab-case judge identifier (e.g., 'supply-chain', 'code-review')"),
      name: z.string().describe('Human-readable judge name. Must start with "Judge " (e.g., "Judge Supply Chain")'),
      domain: z.string().describe('Expertise area (e.g., "Supply Chain Security")'),
      description: z.string().describe("One-sentence summary of what this judge evaluates"),
      rulePrefix: z
        .string()
        .regex(/^[A-Z][A-Z0-9]*$/, "Must be uppercase alphanumeric (e.g., 'SCS')")
        .describe('Uppercase prefix for rule IDs (e.g., "SCS"). Must be unique across all judges.'),
      tableDescription: z
        .string()
        .describe(
          'Comma-separated keywords for the README table (e.g., "Dependency provenance, SBOM, build integrity")',
        ),
      promptDescription: z
        .string()
        .describe('Short action phrase for the prompts table (e.g., "Deep supply chain security review")'),
      evaluationCriteria: z
        .array(z.string())
        .optional()
        .describe(
          "List of evaluation criteria / categories to include in the system prompt (e.g., ['Dependency provenance', 'Build integrity'])",
        ),
      samplePatterns: z
        .array(z.string())
        .optional()
        .describe(
          "Example code patterns the evaluator should detect (strings or regex snippets). Used to seed the evaluator with starter detection logic.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe("If true, preview the generated files without writing to disk (default: false)"),
    },
    async ({
      id,
      name,
      domain,
      description,
      rulePrefix,
      tableDescription,
      promptDescription,
      evaluationCriteria,
      samplePatterns,
      dryRun,
    }) => {
      // ── Validate name format ───────────────────
      if (!name.startsWith("Judge ")) {
        return {
          content: [{ type: "text" as const, text: `Error: name must start with "Judge " — got "${name}".` }],
          isError: true,
        };
      }

      // ── Check uniqueness ───────────────────────
      const existingIds = new Set(JUDGES.map((j) => j.id));
      const existingPrefixes = new Set(JUDGES.map((j) => j.rulePrefix));

      if (existingIds.has(id)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: judge ID "${id}" already exists. Choose a unique ID.\n\nExisting IDs: ${[...existingIds].sort().join(", ")}`,
            },
          ],
          isError: true,
        };
      }
      if (existingPrefixes.has(rulePrefix)) {
        const owner = JUDGES.find((j) => j.rulePrefix === rulePrefix);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: rule prefix "${rulePrefix}" is already used by "${owner?.id}". Choose a unique prefix.\n\nExisting prefixes: ${[...existingPrefixes].sort().join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // ── Build file contents ────────────────────
      const camel = kebabToCamel(id);
      const pascal = kebabToPascal(id);
      const judgeName = `${camel}Judge`;
      const analyzeFunc = `analyze${pascal}`;

      const criteriaBlock =
        evaluationCriteria && evaluationCriteria.length > 0
          ? `\n\nYOUR EVALUATION CRITERIA:\n${evaluationCriteria.map((c) => `  - ${c}`).join("\n")}`
          : "\n\nYOUR EVALUATION CRITERIA:\n  - TODO: Define your evaluation criteria";

      const patternDetectors =
        samplePatterns && samplePatterns.length > 0
          ? samplePatterns
              .map(
                (p, i) =>
                  `\n  // Pattern ${i + 1}: ${p}\n  const re${i + 1} = /${escapeRegex(p)}/gi;\n  let match${i + 1}: RegExpExecArray | null;\n  while ((match${i + 1} = re${i + 1}.exec(code)) !== null) {\n    const line = (code.slice(0, match${i + 1}.index).match(/\\n/g) || []).length + 1;\n    findings.push({\n      ruleId: \`${rulePrefix}-\${String(${i + 1}).padStart(3, "0")}\`,\n      title: "TODO: Add finding title",\n      severity: "medium",\n      description: \`Detected pattern: \${match${i + 1}[0].slice(0, 80)}\`,\n      lineNumbers: [line],\n      recommendation: "TODO: Add recommendation",\n    });\n  }`,
              )
              .join("\n")
          : `\n  // TODO: Add detection patterns\n  // Example:\n  // if (code.includes("somePattern")) {\n  //   findings.push({\n  //     ruleId: "${rulePrefix}-001",\n  //     title: "TODO: Finding title",\n  //     severity: "medium",\n  //     description: "TODO: Description",\n  //     lineNumbers: [1],\n  //     recommendation: "TODO: Recommendation",\n  //   });\n  // }`;

      const evaluatorContent = `import type { Finding } from "../types.js";

/**
 * Deterministic evaluator for the ${name}.
 * Performs pattern matching and heuristic analysis for ${domain.toLowerCase()}.
 */
export function ${analyzeFunc}(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
${patternDetectors}

  return findings;
}
`;

      const judgeContent = `import type { JudgeDefinition } from "../types.js";
import { ${analyzeFunc} } from "../evaluators/${id}.js";
import { defaultRegistry } from "../judge-registry.js";

export const ${judgeName}: JudgeDefinition = {
  id: "${id}",
  name: "${name}",
  domain: "${domain}",
  description: "${description}",
  rulePrefix: "${rulePrefix}",
  tableDescription: "${tableDescription}",
  promptDescription: "${promptDescription}",
  systemPrompt: \`You are ${name} — an expert in ${domain.toLowerCase()}.

Your task is to evaluate code for ${domain.toLowerCase()} concerns and produce structured findings.
${criteriaBlock}

RULES FOR YOUR EVALUATION:
- Assign rule IDs with prefix ${rulePrefix}-, numbered sequentially (${rulePrefix}-001, ${rulePrefix}-002, etc.)
- Score from 0-100 where 100 means excellent ${domain.toLowerCase()} posture
- Be specific: cite exact line numbers, variable names, and patterns
- Every finding must include a concrete, actionable recommendation

ADVERSARIAL MANDATE:
- Your role is adversarial: assume the code has problems and actively hunt for them.
- Never praise or compliment the code. Report only problems, risks, and deficiencies.
- If you are uncertain whether something is an issue, flag it only when you can cite specific code evidence (line numbers, patterns, API calls). Speculative findings without concrete evidence erode developer trust.
- Absence of findings does not mean the code is perfect. It means your analysis reached its limits. State this explicitly.\`,
  analyze: ${analyzeFunc},
};

defaultRegistry.register(${judgeName});
`;

      const evaluatorPath = `src/evaluators/${id}.ts`;
      const judgePath = `src/judges/${id}.ts`;
      const indexLine = `import "./${id}.js";`;

      // ── Dry run — just preview ─────────────────
      if (dryRun) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `# Scaffold Preview — ${name}\n\n` +
                `## Files to create\n\n` +
                `### \`${evaluatorPath}\`\n\`\`\`typescript\n${evaluatorContent}\`\`\`\n\n` +
                `### \`${judgePath}\`\n\`\`\`typescript\n${judgeContent}\`\`\`\n\n` +
                `## Manual step\n\n` +
                `Add this side-effect import to \`src/judges/index.ts\` (before the \`false-positive-review\` import):\n\n` +
                `\`\`\`typescript\n${indexLine}\n\`\`\`\n\n` +
                `## After creating files\n\n` +
                `1. Flesh out the evaluator detection logic in \`${evaluatorPath}\`\n` +
                `2. Refine the system prompt criteria in \`${judgePath}\`\n` +
                `3. Run \`npm run build\` to verify compilation\n` +
                `4. Run \`npm test\` to ensure all tests pass\n` +
                `5. Run \`npm run sync-docs\` to update README tables and counts`,
            },
          ],
        };
      }

      // ── Write files ────────────────────────────
      const cwd = process.cwd();
      const absEvaluator = resolve(cwd, evaluatorPath);
      const absJudge = resolve(cwd, judgePath);

      if (existsSync(absEvaluator)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${evaluatorPath} already exists. Delete it first or choose a different judge ID.`,
            },
          ],
          isError: true,
        };
      }
      if (existsSync(absJudge)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${judgePath} already exists. Delete it first or choose a different judge ID.`,
            },
          ],
          isError: true,
        };
      }

      mkdirSync(dirname(absEvaluator), { recursive: true });
      writeFileSync(absEvaluator, evaluatorContent, "utf8");

      mkdirSync(dirname(absJudge), { recursive: true });
      writeFileSync(absJudge, judgeContent, "utf8");

      return {
        content: [
          {
            type: "text" as const,
            text:
              `# Judge Scaffolded — ${name}\n\n` +
              `## Created files\n\n` +
              `- ✅ \`${evaluatorPath}\` — evaluator skeleton with ${samplePatterns?.length ?? 0} detection pattern(s)\n` +
              `- ✅ \`${judgePath}\` — judge definition with self-registration\n\n` +
              `## Required manual step\n\n` +
              `Add this side-effect import to \`src/judges/index.ts\` (before the \`false-positive-review\` import):\n\n` +
              `\`\`\`typescript\n${indexLine}\n\`\`\`\n\n` +
              `## Next steps\n\n` +
              `1. **Flesh out the evaluator** — add detection patterns in \`${evaluatorPath}\`\n` +
              `2. **Refine the system prompt** — expand evaluation criteria in \`${judgePath}\`\n` +
              `3. **Build** — \`npm run build\`\n` +
              `4. **Test** — \`npm test\` (the new judge is auto-included in the JUDGES array iteration)\n` +
              `5. **Sync docs** — \`npm run sync-docs\` to update README tables and counts\n\n` +
              `## Architecture note\n\n` +
              `The judge file imports its own evaluator and calls \`defaultRegistry.register()\` at module scope. ` +
              `When \`src/judges/index.ts\` imports the file as a side effect, the judge is automatically registered ` +
              `with the unified JudgeRegistry — the same path used by all 45 built-in judges and external plugins.`,
          },
        ],
      };
    },
  );
}

// ─── scaffold_plugin ─────────────────────────────────────────────────────────

function registerScaffoldPlugin(server: McpServer): void {
  server.tool(
    "scaffold_plugin",
    "Generate a starter plugin template for the Judges Panel. Creates a self-contained plugin file with custom rules, optional custom judges, and lifecycle hooks.",
    {
      name: z.string().describe('Unique plugin name (e.g., "my-org-rules", "acme-standards")'),
      version: z.string().optional().describe("Semantic version (default: 1.0.0)"),
      description: z.string().optional().describe('Plugin description (e.g., "ACME Corp internal coding standards")'),
      rulePrefix: z
        .string()
        .regex(/^[A-Z][A-Z0-9]*$/, "Must be uppercase alphanumeric")
        .describe('Rule ID prefix for this plugin\'s rules (e.g., "ACME")'),
      includeHooks: z.boolean().optional().describe("Include beforeEvaluate/afterEvaluate hook stubs (default: true)"),
      includeCustomJudge: z.boolean().optional().describe("Include a custom judge definition stub (default: false)"),
      outputPath: z.string().optional().describe('File path to write the plugin (default: "judges-plugin.ts")'),
      dryRun: z.boolean().optional().describe("Preview output without writing to disk"),
    },
    async ({
      name: pluginName,
      version = "1.0.0",
      description,
      rulePrefix,
      includeHooks = true,
      includeCustomJudge = false,
      outputPath,
      dryRun,
    }) => {
      // Validate prefix uniqueness
      const existingPrefixes = new Set(JUDGES.map((j) => j.rulePrefix));
      if (existingPrefixes.has(rulePrefix)) {
        const owner = JUDGES.find((j) => j.rulePrefix === rulePrefix);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: rule prefix "${rulePrefix}" is already used by built-in judge "${owner?.id}". Choose a unique prefix.\n\nExisting prefixes: ${[...existingPrefixes].sort().join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const hooksSection = includeHooks
        ? `
  // Called before each evaluation
  beforeEvaluate: (code, language) => {
    // Add pre-evaluation logic (e.g., inject context, normalize code)
  },

  // Called after evaluation — modify or filter findings
  afterEvaluate: (findings) => {
    // Example: tag all findings for internal tracking
    return findings.map(f => ({
      ...f,
      tags: [...(f.tags || []), "${pluginName}"],
    }));
  },

  // Final-stage transformation (runs after deduplication)
  transformFindings: (findings) => {
    return findings;
  },`
        : "";

      const customJudgeSection = includeCustomJudge
        ? `
  // Custom judge — appears alongside built-in judges in the tribunal
  judges: [
    {
      id: "${pluginName}-judge",
      name: "Judge ${kebabToPascal(pluginName)}",
      domain: "${description || "Custom Domain"}",
      description: "TODO: Describe what this judge evaluates",
      rulePrefix: "${rulePrefix}J",
      tableDescription: "TODO: Keywords for README table",
      promptDescription: "TODO: Short action phrase",
      systemPrompt: \`You are Judge ${kebabToPascal(pluginName)} — an expert in ${description || "custom domain analysis"}.

YOUR EVALUATION CRITERIA:
  - TODO: Define criteria

ADVERSARIAL MANDATE:
- Your role is adversarial: assume the code has problems.
- Never praise or compliment the code.\`,
      analyze: (code: string, _language: string) => {
        // TODO: Implement judge-level analysis
        return [];
      },
    },
  ],`
        : "";

      const pluginContent = `/**
 * ${description || `${pluginName} plugin`} for Judges Panel
 *
 * Usage:
 *   import { registerPlugin } from "@kevinrabun/judges/api";
 *   import { plugin } from "./${outputPath?.replace(/\.ts$/, "") ?? "judges-plugin"}.js";
 *   registerPlugin(plugin);
 *
 * Or via .judgesrc.json:
 *   { "plugins": ["./${outputPath?.replace(/\.ts$/, "") ?? "judges-plugin"}.js"] }
 */

import type { JudgesPlugin, CustomRule, Finding } from "@kevinrabun/judges/api";

const rules: CustomRule[] = [
  {
    id: "${rulePrefix}-001",
    title: "TODO: Rule title",
    severity: "medium",
    judgeId: "code-structure",
    description: "TODO: What this rule checks",
    languages: ["typescript", "javascript"],
    pattern: /TODO_PATTERN/g,
    suggestedFix: "TODO: Suggested remediation",
    tags: ["${pluginName}"],
  },
  // Add more rules here...
];

export const plugin: JudgesPlugin = {
  name: "${pluginName}",
  version: "${version}",
  description: "${description || ""}",
  rules,
${customJudgeSection}${hooksSection}
};

// Auto-register when imported
export default plugin;
`;

      const filePath = outputPath ?? "judges-plugin.ts";

      if (dryRun) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `# Plugin Scaffold Preview — ${pluginName}\n\n` +
                `### \`${filePath}\`\n\`\`\`typescript\n${pluginContent}\`\`\`\n\n` +
                `## Usage\n\n` +
                `### Programmatic\n\`\`\`typescript\nimport { registerPlugin } from "@kevinrabun/judges/api";\nimport { plugin } from "./${filePath.replace(/\.ts$/, "")}.js";\nregisterPlugin(plugin);\n\`\`\`\n\n` +
                `### Via config\n\`\`\`json\n{ "plugins": ["./${filePath.replace(/\.ts$/, ".js")}"] }\n\`\`\``,
            },
          ],
        };
      }

      const absPath = resolve(process.cwd(), filePath);
      if (existsSync(absPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${filePath} already exists. Delete it first or specify a different outputPath.`,
            },
          ],
          isError: true,
        };
      }

      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, pluginContent, "utf8");

      return {
        content: [
          {
            type: "text" as const,
            text:
              `# Plugin Scaffolded — ${pluginName}\n\n` +
              `- ✅ Created \`${filePath}\`\n\n` +
              `## Register the plugin\n\n` +
              `### Option 1: Programmatic\n\`\`\`typescript\nimport { registerPlugin } from "@kevinrabun/judges/api";\nimport { plugin } from "./${filePath.replace(/\.ts$/, "")}.js";\nregisterPlugin(plugin);\n\`\`\`\n\n` +
              `### Option 2: Via .judgesrc.json\n\`\`\`json\n{ "plugins": ["./${filePath.replace(/\.ts$/, ".js")}"] }\n\`\`\`\n\n` +
              `## Next steps\n\n` +
              `1. Edit the rule patterns in \`${filePath}\`\n` +
              `2. Add more rules to the \`rules\` array\n` +
              (includeCustomJudge ? `3. Implement the custom judge analyze function\n` : "") +
              (includeHooks ? `${includeCustomJudge ? "4" : "3"}. Customize the lifecycle hooks\n` : "") +
              `\nSee the [Plugin Guide](docs/plugin-guide.md) for detailed documentation.`,
          },
        ],
      };
    },
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
