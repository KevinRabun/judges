/**
 * Review-config-template — Generate config templates for common scenarios.
 */

import { writeFileSync } from "fs";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Template {
  name: string;
  description: string;
  config: Record<string, unknown>;
}

// ─── Templates ──────────────────────────────────────────────────────────────

function getTemplates(): Template[] {
  const judges = defaultRegistry.getJudges();

  return [
    {
      name: "security-focused",
      description: "Focus on security vulnerabilities and best practices",
      config: {
        preset: "security-focused",
        minSeverity: "medium",
        disabledJudges: judges
          .filter((j) => !j.domain.toLowerCase().includes("security"))
          .map((j) => j.id)
          .slice(0, 5),
      },
    },
    {
      name: "strict",
      description: "Strict mode with all judges enabled and low severity threshold",
      config: {
        preset: "strict",
        minSeverity: "low",
      },
    },
    {
      name: "ci-friendly",
      description: "Optimized for CI pipelines with critical-only findings",
      config: {
        preset: "default",
        minSeverity: "high",
      },
    },
    {
      name: "performance",
      description: "Focus on performance issues",
      config: {
        preset: "performance",
        minSeverity: "medium",
        disabledJudges: judges
          .filter((j) => !j.domain.toLowerCase().includes("perf"))
          .map((j) => j.id)
          .slice(0, 5),
      },
    },
    {
      name: "minimal",
      description: "Minimal configuration with only critical findings",
      config: {
        preset: "default",
        minSeverity: "critical",
      },
    },
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewConfigTemplate(argv: string[]): void {
  const templateIdx = argv.indexOf("--template");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");
  const templateName = templateIdx >= 0 ? argv[templateIdx + 1] : undefined;
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-config-template — Generate config templates

Usage:
  judges review-config-template [--template <name>] [--output <file>]
                                [--format table|json]

Options:
  --template <name>  Template: security-focused, strict, ci-friendly, performance, minimal
  --output <path>    Write config to file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const templates = getTemplates();

  // List mode
  if (!templateName) {
    if (format === "json") {
      console.log(JSON.stringify(templates, null, 2));
      return;
    }

    console.log(`\nAvailable Config Templates`);
    console.log("═".repeat(55));
    for (const t of templates) {
      console.log(`  ${t.name.padEnd(20)} ${t.description}`);
    }
    console.log("═".repeat(55));
    return;
  }

  const template = templates.find((t) => t.name === templateName);
  if (!template) {
    console.error(`Error: unknown template: ${templateName}`);
    console.error(`Available: ${templates.map((t) => t.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(template.config, null, 2));
    console.log(`Template "${template.name}" written to ${outputPath}`);
    return;
  }

  console.log(JSON.stringify(template.config, null, 2));
}
