/**
 * Review-template-library — Library of reusable review templates.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewTemplate {
  name: string;
  description: string;
  preset: string;
  minSeverity: string;
  disabledRules: string[];
  tags: string[];
}

// ─── Built-in Templates ─────────────────────────────────────────────────────

function getBuiltinTemplates(): ReviewTemplate[] {
  return [
    {
      name: "ai-code-review",
      description: "Optimized for reviewing AI-generated code",
      preset: "strict",
      minSeverity: "medium",
      disabledRules: [],
      tags: ["ai", "code-generation", "copilot"],
    },
    {
      name: "security-audit",
      description: "Deep security review with all severity levels",
      preset: "security-focused",
      minSeverity: "low",
      disabledRules: [],
      tags: ["security", "audit", "compliance"],
    },
    {
      name: "quick-scan",
      description: "Fast scan for critical issues only",
      preset: "default",
      minSeverity: "critical",
      disabledRules: [],
      tags: ["quick", "ci", "fast"],
    },
    {
      name: "pr-review",
      description: "Balanced review for pull requests",
      preset: "default",
      minSeverity: "medium",
      disabledRules: [],
      tags: ["pr", "pull-request", "review"],
    },
    {
      name: "onboarding",
      description: "Gentle review for new team members",
      preset: "default",
      minSeverity: "high",
      disabledRules: [],
      tags: ["onboarding", "learning", "gentle"],
    },
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTemplateLibrary(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const nameIdx = argv.indexOf("--name");
  const exportIdx = argv.indexOf("--export");
  const importIdx = argv.indexOf("--import");
  const tagIdx = argv.indexOf("--tag");
  const formatIdx = argv.indexOf("--format");
  const templateDir = dirIdx >= 0 ? argv[dirIdx + 1] : join(process.cwd(), ".judges-templates");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-template-library — Reusable review templates

Usage:
  judges review-template-library [--dir <path>] [--name <template>]
                                 [--tag <tag>] [--export <file>]
                                 [--import <file>] [--format table|json]

Options:
  --dir <path>       Template directory (default: .judges-templates/)
  --name <template>  Show or use specific template
  --tag <tag>        Filter by tag
  --export <file>    Export template to file
  --import <file>    Import template from file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  // Import a template
  if (importIdx >= 0) {
    const importPath = argv[importIdx + 1];
    if (!existsSync(importPath)) {
      console.error(`Error: file not found: ${importPath}`);
      process.exitCode = 1;
      return;
    }
    try {
      const template = JSON.parse(readFileSync(importPath, "utf-8")) as ReviewTemplate;
      const outPath = join(templateDir, `${template.name}.json`);
      writeFileSync(outPath, JSON.stringify(template, null, 2));
      console.log(`Imported template "${template.name}" to ${outPath}`);
    } catch {
      console.error(`Error: failed to parse template file: ${importPath}`);
      process.exitCode = 1;
    }
    return;
  }

  // Collect all templates (builtin + user)
  let templates = getBuiltinTemplates();

  if (existsSync(templateDir)) {
    const files = readdirSync(templateDir) as unknown as string[];
    for (const file of files) {
      if (typeof file === "string" && file.endsWith(".json")) {
        try {
          const t = JSON.parse(readFileSync(join(templateDir, file), "utf-8")) as ReviewTemplate;
          if (t.name !== undefined) {
            templates = templates.filter((bt) => bt.name !== t.name);
            templates.push(t);
          }
        } catch {
          // skip invalid
        }
      }
    }
  }

  // Filter by tag
  if (tagIdx >= 0) {
    const tag = argv[tagIdx + 1];
    templates = templates.filter((t) => t.tags.includes(tag));
  }

  // Show specific template
  const templateName = nameIdx >= 0 ? argv[nameIdx + 1] : undefined;
  if (templateName) {
    const template = templates.find((t) => t.name === templateName);
    if (!template) {
      console.error(`Error: template not found: ${templateName}`);
      process.exitCode = 1;
      return;
    }

    if (exportIdx >= 0) {
      const exportPath = argv[exportIdx + 1];
      writeFileSync(exportPath, JSON.stringify(template, null, 2));
      console.log(`Exported "${template.name}" to ${exportPath}`);
      return;
    }

    console.log(JSON.stringify(template, null, 2));
    return;
  }

  // List all templates
  if (format === "json") {
    console.log(JSON.stringify(templates, null, 2));
    return;
  }

  console.log(`\nReview Template Library: ${templates.length} template(s)`);
  console.log("═".repeat(65));

  for (const t of templates) {
    console.log(`  ${t.name.padEnd(20)} ${t.description}`);
    console.log(`  ${"".padEnd(20)} preset: ${t.preset}  minSeverity: ${t.minSeverity}  tags: ${t.tags.join(", ")}`);
  }

  console.log("═".repeat(65));
}
