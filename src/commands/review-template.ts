/**
 * Review-template — Reusable review templates for common workflows.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewTemplate {
  id: string;
  name: string;
  description: string;
  judges: string[];
  preset: string;
  minSeverity: string;
  focusRules: string[];
  excludeRules: string[];
  outputFormat: string;
  failOnFindings: boolean;
  tags: string[];
}

// ─── Built-in templates ────────────────────────────────────────────────────

const BUILTIN_TEMPLATES: ReviewTemplate[] = [
  {
    id: "security-audit",
    name: "Security Audit",
    description: "Deep security review focusing on OWASP Top 10 and CWE patterns",
    judges: ["data-security", "cybersecurity", "authentication", "input-guard"],
    preset: "security-only",
    minSeverity: "medium",
    focusRules: [],
    excludeRules: [],
    outputFormat: "sarif",
    failOnFindings: true,
    tags: ["security", "compliance"],
  },
  {
    id: "pr-review",
    name: "PR Review",
    description: "Standard pull request review for code quality and correctness",
    judges: [],
    preset: "recommended",
    minSeverity: "low",
    focusRules: [],
    excludeRules: [],
    outputFormat: "text",
    failOnFindings: false,
    tags: ["pr", "quality"],
  },
  {
    id: "pre-deploy",
    name: "Pre-Deploy Check",
    description: "Critical checks before deployment — security and reliability only",
    judges: ["data-security", "cybersecurity", "reliability", "error-handling"],
    preset: "strict",
    minSeverity: "high",
    focusRules: [],
    excludeRules: [],
    outputFormat: "json",
    failOnFindings: true,
    tags: ["deploy", "ci"],
  },
  {
    id: "ai-code-review",
    name: "AI Code Review",
    description: "Specialized review for AI-generated code patterns",
    judges: [],
    preset: "strict",
    minSeverity: "low",
    focusRules: [],
    excludeRules: [],
    outputFormat: "text",
    failOnFindings: false,
    tags: ["ai", "generated"],
  },
  {
    id: "quick-scan",
    name: "Quick Scan",
    description: "Fast scan for critical issues only",
    judges: ["data-security", "cybersecurity"],
    preset: "lenient",
    minSeverity: "critical",
    focusRules: [],
    excludeRules: [],
    outputFormat: "text",
    failOnFindings: false,
    tags: ["quick", "critical"],
  },
];

// ─── Template storage ──────────────────────────────────────────────────────

const TEMPLATE_DIR = join(".judges", "templates");

function loadCustomTemplates(): ReviewTemplate[] {
  if (!existsSync(TEMPLATE_DIR)) return [];
  const files = readdirSync(TEMPLATE_DIR) as unknown as string[];
  const templates: ReviewTemplate[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const t = JSON.parse(readFileSync(join(TEMPLATE_DIR, f), "utf-8")) as ReviewTemplate;
      templates.push(t);
    } catch {
      // Skip invalid files
    }
  }
  return templates;
}

function getAllTemplates(): ReviewTemplate[] {
  return [...BUILTIN_TEMPLATES, ...loadCustomTemplates()];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTemplate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-template — Reusable review templates

Usage:
  judges review-template list                      List all templates
  judges review-template show --id security-audit  Show template details
  judges review-template create --id my-template   Create custom template
  judges review-template export --id my-template   Export template to JSON
  judges review-template --format json             JSON output

Subcommands:
  list                 List built-in and custom templates
  show                 Show template details
  create               Create a new custom template
  export               Export template to stdout

Options:
  --id <id>            Template ID (required for show/create/export)
  --name <name>        Template display name (for create)
  --desc <text>        Template description (for create)
  --preset <name>      Preset to use (for create)
  --format json        JSON output
  --help, -h           Show this help

Built-in templates: security-audit, pr-review, pre-deploy, ai-code-review, quick-scan.
Custom templates are stored in .judges/templates/.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const templateId = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
  const subcommand = argv.find((a) => ["list", "show", "create", "export"].includes(a)) || "list";

  const allTemplates = getAllTemplates();

  if (subcommand === "list") {
    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            templates: allTemplates.map((t) => ({ id: t.id, name: t.name, description: t.description, tags: t.tags })),
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`\n  Review Templates (${allTemplates.length})\n  ─────────────────────────────`);
    for (const t of allTemplates) {
      const tags = t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : "";
      console.log(`    📋 ${t.id} — ${t.name}${tags}`);
      console.log(`       ${t.description}`);
    }
    console.log();
    return;
  }

  if (!templateId) {
    console.error("Error: --id is required.");
    process.exitCode = 1;
    return;
  }

  if (subcommand === "create") {
    const existing = allTemplates.find((t) => t.id === templateId);
    if (existing) {
      console.error(`Error: Template '${templateId}' already exists.`);
      process.exitCode = 1;
      return;
    }

    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || templateId;
    const desc = argv.find((_a: string, i: number) => argv[i - 1] === "--desc") || "Custom review template";
    const preset = argv.find((_a: string, i: number) => argv[i - 1] === "--preset") || "recommended";

    const template: ReviewTemplate = {
      id: templateId,
      name,
      description: desc,
      judges: [],
      preset,
      minSeverity: "low",
      focusRules: [],
      excludeRules: [],
      outputFormat: "text",
      failOnFindings: false,
      tags: ["custom"],
    };

    const filePath = join(TEMPLATE_DIR, `${templateId}.json`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(template, null, 2), "utf-8");
    console.log(`Created template '${templateId}' in ${filePath}.`);
    return;
  }

  const template = allTemplates.find((t) => t.id === templateId);
  if (!template) {
    console.error(`Error: Template '${templateId}' not found.`);
    process.exitCode = 1;
    return;
  }

  if (subcommand === "export") {
    console.log(JSON.stringify(template, null, 2));
    return;
  }

  // Show
  if (format === "json") {
    console.log(JSON.stringify(template, null, 2));
    return;
  }

  console.log(`\n  Template: ${template.name}\n  ─────────────────────────────`);
  console.log(`    ID: ${template.id}`);
  console.log(`    Description: ${template.description}`);
  console.log(`    Preset: ${template.preset}`);
  console.log(`    Min severity: ${template.minSeverity}`);
  console.log(`    Output format: ${template.outputFormat}`);
  console.log(`    Fail on findings: ${template.failOnFindings}`);
  if (template.judges.length > 0) {
    console.log(`    Judges: ${template.judges.join(", ")}`);
  }
  if (template.tags.length > 0) {
    console.log(`    Tags: ${template.tags.join(", ")}`);
  }
  console.log();
}
