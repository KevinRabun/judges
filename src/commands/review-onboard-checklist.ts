/**
 * Review-onboard-checklist — Generate team onboarding checklists for Judges adoption.
 */

import { writeFileSync } from "fs";
import { defaultRegistry } from "../judge-registry.js";

// ─── Checklist Items ────────────────────────────────────────────────────────

interface ChecklistItem {
  category: string;
  item: string;
  priority: "required" | "recommended" | "optional";
}

function getChecklist(): ChecklistItem[] {
  const judges = defaultRegistry.getJudges();
  const domains = [...new Set(judges.map((j) => j.domain))];

  return [
    {
      category: "Installation",
      item: "Install @kevinrabun/judges globally or as dev dependency",
      priority: "required",
    },
    { category: "Installation", item: "Install VS Code extension (Judges Panel)", priority: "recommended" },
    { category: "Configuration", item: "Create .judgesrc in project root", priority: "required" },
    { category: "Configuration", item: "Choose preset (default, strict, security-focused)", priority: "required" },
    { category: "Configuration", item: "Set minSeverity threshold for team", priority: "recommended" },
    {
      category: "Configuration",
      item: `Review available domains: ${domains.slice(0, 5).join(", ")}...`,
      priority: "recommended",
    },
    { category: "CI/CD", item: "Add judges review to CI pipeline", priority: "recommended" },
    { category: "CI/CD", item: "Configure review-ci-gate with pass/fail thresholds", priority: "recommended" },
    { category: "CI/CD", item: "Set up SARIF output for GitHub Security tab", priority: "optional" },
    { category: "Team", item: "Share .judgesrc in version control", priority: "required" },
    { category: "Team", item: "Document suppression workflow for false positives", priority: "recommended" },
    { category: "Team", item: "Set up team-specific tenant config profiles", priority: "optional" },
    { category: "Review", item: "Run first review on sample file", priority: "required" },
    { category: "Review", item: "Review output formats (table, json, markdown, sarif)", priority: "recommended" },
    {
      category: "Review",
      item: `Explore ${judges.length} available judges across ${domains.length} domains`,
      priority: "optional",
    },
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOnboardChecklist(argv: string[]): void {
  const formatIdx = argv.indexOf("--format");
  const outputIdx = argv.indexOf("--output");
  const priorityIdx = argv.indexOf("--priority");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const priorityFilter = priorityIdx >= 0 ? argv[priorityIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-onboard-checklist — Team onboarding checklist

Usage:
  judges review-onboard-checklist [--priority required|recommended|optional]
                                  [--output <file>] [--format table|json|markdown]

Options:
  --priority <level>  Filter by priority level
  --output <path>     Write checklist to file
  --format <fmt>      Output format: table (default), json, markdown
  --help, -h          Show this help
`);
    return;
  }

  let items = getChecklist();
  if (priorityFilter) {
    items = items.filter((i) => i.priority === priorityFilter);
  }

  if (format === "json") {
    const output = JSON.stringify(items, null, 2);
    if (outputPath) {
      writeFileSync(outputPath, output);
      console.log(`Checklist written to ${outputPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  if (format === "markdown") {
    const lines: string[] = ["# Judges Onboarding Checklist\n"];
    let currentCategory = "";
    for (const item of items) {
      if (item.category !== currentCategory) {
        currentCategory = item.category;
        lines.push(`\n## ${currentCategory}\n`);
      }
      const badge =
        item.priority === "required"
          ? "**[REQUIRED]**"
          : item.priority === "recommended"
            ? "[recommended]"
            : "[optional]";
      lines.push(`- [ ] ${badge} ${item.item}`);
    }
    const output = lines.join("\n");
    if (outputPath) {
      writeFileSync(outputPath, output);
      console.log(`Checklist written to ${outputPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  // Table format
  console.log(`\nOnboarding Checklist: ${items.length} items`);
  console.log("═".repeat(70));

  let currentCategory = "";
  for (const item of items) {
    if (item.category !== currentCategory) {
      currentCategory = item.category;
      console.log(`\n  ${currentCategory}`);
      console.log("  " + "─".repeat(60));
    }
    const badge = item.priority === "required" ? "[REQ]" : item.priority === "recommended" ? "[REC]" : "[OPT]";
    console.log(`    ${badge} ${item.item}`);
  }

  console.log("\n" + "═".repeat(70));
  const required = items.filter((i) => i.priority === "required").length;
  console.log(`${required} required, ${items.length - required} optional/recommended`);
}
