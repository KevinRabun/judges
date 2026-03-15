/**
 * Review-template-export — Export review templates for reuse.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewTemplate {
  name: string;
  version: number;
  judges: string[];
  ruleOverrides: Record<string, string>;
  minSeverity: string;
  description: string;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateTemplate(name: string, verdict?: TribunalVerdict): ReviewTemplate {
  const judges = defaultRegistry.getJudges();
  const activeJudges = judges.map((j) => j.id);

  const ruleOverrides: Record<string, string> = {};
  if (verdict !== undefined) {
    for (const f of verdict.findings) {
      if (!ruleOverrides[f.ruleId]) {
        ruleOverrides[f.ruleId] = (f.severity || "medium").toLowerCase();
      }
    }
  }

  return {
    name,
    version: 1,
    judges: activeJudges,
    ruleOverrides,
    minSeverity: "low",
    description: `Review template: ${name}`,
    createdAt: new Date().toISOString(),
  };
}

function presetTemplates(): ReviewTemplate[] {
  return [
    {
      name: "security-focused",
      version: 1,
      judges: ["cybersecurity", "data-security", "authentication", "api-security"],
      ruleOverrides: {},
      minSeverity: "medium",
      description: "Security-focused review — only security judges active",
      createdAt: new Date().toISOString(),
    },
    {
      name: "full-review",
      version: 1,
      judges: defaultRegistry.getJudges().map((j) => j.id),
      ruleOverrides: {},
      minSeverity: "low",
      description: "Full review with all judges active",
      createdAt: new Date().toISOString(),
    },
    {
      name: "quick-scan",
      version: 1,
      judges: ["cybersecurity", "code-quality"],
      ruleOverrides: {},
      minSeverity: "high",
      description: "Quick scan — critical and high severity only",
      createdAt: new Date().toISOString(),
    },
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTemplateExport(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const nameIdx = argv.indexOf("--name");
  const fileIdx = argv.indexOf("--file");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");

  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "list";
  const name = nameIdx >= 0 ? argv[nameIdx + 1] : "default";
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-template-export — Export review templates

Usage:
  judges review-template-export --action <action> [options]

Actions:
  list       Show preset templates (default)
  create     Create template from verdict
  export     Export template to file

Options:
  --action <act>     Action: list, create, export
  --name <name>      Template name (for create)
  --file <path>      Verdict JSON file (for create)
  --output <path>    Output file path (for export)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (action === "create") {
    let verdict: TribunalVerdict | undefined;
    if (filePath && existsSync(filePath)) {
      try {
        verdict = JSON.parse(readFileSync(filePath, "utf-8"));
      } catch {
        console.error("Error: invalid JSON");
        process.exitCode = 1;
        return;
      }
    }

    const template = generateTemplate(name, verdict);

    if (outputPath) {
      writeFileSync(outputPath, JSON.stringify(template, null, 2));
      console.log(`Template exported to ${outputPath}`);
      return;
    }

    console.log(JSON.stringify(template, null, 2));
    return;
  }

  if (action === "export") {
    const presets = presetTemplates();
    const target = presets.find((p) => p.name === name);
    if (target === undefined) {
      console.error(`Error: preset not found: ${name}`);
      console.error(`Available: ${presets.map((p) => p.name).join(", ")}`);
      process.exitCode = 1;
      return;
    }

    if (outputPath) {
      writeFileSync(outputPath, JSON.stringify(target, null, 2));
      console.log(`Template "${name}" exported to ${outputPath}`);
      return;
    }

    console.log(JSON.stringify(target, null, 2));
    return;
  }

  // default: list
  const presets = presetTemplates();

  if (format === "json") {
    console.log(JSON.stringify(presets, null, 2));
    return;
  }

  console.log(`\nReview Templates`);
  console.log("═".repeat(70));
  console.log(`${"Name".padEnd(22)} ${"Judges".padEnd(8)} ${"Min Sev".padEnd(10)} Description`);
  console.log("─".repeat(70));

  for (const t of presets) {
    const desc = t.description.length > 30 ? t.description.slice(0, 30) + "…" : t.description;
    console.log(`${t.name.padEnd(22)} ${String(t.judges.length).padEnd(8)} ${t.minSeverity.padEnd(10)} ${desc}`);
  }
  console.log("═".repeat(70));
}
