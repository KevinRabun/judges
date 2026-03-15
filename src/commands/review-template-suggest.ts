import { readFileSync, existsSync } from "fs";
import { join } from "path";

/* ── review-template-suggest ────────────────────────────────────────
   Suggest review templates based on the type of change detected
   (bug fix, feature, refactor, config, etc.) to standardize
   review workflows and ensure consistent coverage.
   ─────────────────────────────────────────────────────────────────── */

interface TemplateSuggestion {
  changeType: string;
  template: string;
  focusAreas: string[];
  checklistItems: string[];
}

const TEMPLATES: Record<string, TemplateSuggestion> = {
  "bug-fix": {
    changeType: "Bug Fix",
    template: "bug-fix-review",
    focusAreas: ["Root cause analysis", "Regression test coverage", "Edge cases"],
    checklistItems: [
      "Bug root cause identified",
      "Fix addresses root cause, not just symptom",
      "Regression tests added",
      "No unintended side effects",
    ],
  },
  feature: {
    changeType: "New Feature",
    template: "feature-review",
    focusAreas: ["Design alignment", "Security review", "Performance impact", "Documentation"],
    checklistItems: [
      "Feature matches requirements",
      "Security implications reviewed",
      "Performance tested",
      "Documentation updated",
      "Tests cover happy and error paths",
    ],
  },
  refactor: {
    changeType: "Refactor",
    template: "refactor-review",
    focusAreas: ["Behavior preservation", "Test coverage unchanged", "Code clarity"],
    checklistItems: [
      "No behavioral changes introduced",
      "All existing tests still pass",
      "Code readability improved",
      "No new dependencies added unnecessarily",
    ],
  },
  config: {
    changeType: "Configuration",
    template: "config-review",
    focusAreas: ["Secret exposure", "Environment parity", "Breaking changes"],
    checklistItems: [
      "No secrets or credentials exposed",
      "Compatible with all environments",
      "Backward compatible or migration documented",
    ],
  },
  dependency: {
    changeType: "Dependency Update",
    template: "dependency-review",
    focusAreas: ["Security advisories", "Breaking changes", "License compatibility"],
    checklistItems: [
      "No known vulnerabilities in new version",
      "Breaking changes reviewed",
      "License still compatible",
      "Lock file updated consistently",
    ],
  },
};

function detectChangeType(files: string[]): string {
  const hasConfig = files.some(
    (f) =>
      f.endsWith(".json") || f.endsWith(".yml") || f.endsWith(".yaml") || f.endsWith(".toml") || f.endsWith(".env"),
  );
  const hasDeps = files.some(
    (f) => f.includes("package.json") || f.includes("Cargo.toml") || f.includes("go.mod") || f.includes("requirements"),
  );
  const hasTests = files.some((f) => f.includes("test") || f.includes("spec"));
  const hasSource = files.some(
    (f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".py") || f.endsWith(".go") || f.endsWith(".rs"),
  );

  if (hasDeps) return "dependency";
  if (hasConfig && !hasSource) return "config";
  if (hasTests && hasSource) return "bug-fix";
  if (hasSource) return "feature";
  return "refactor";
}

export function runReviewTemplateSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-template-suggest [options]

Suggest review templates based on change type.

Options:
  --files <path>     File listing changed files (one per line)
  --type <type>      Override change type: bug-fix, feature, refactor, config, dependency
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const typeIdx = argv.indexOf("--type");
  let changeType = typeIdx !== -1 && argv[typeIdx + 1] ? argv[typeIdx + 1] : "";

  if (changeType === "") {
    const filesIdx = argv.indexOf("--files");
    const filesPath = filesIdx !== -1 && argv[filesIdx + 1] ? join(process.cwd(), argv[filesIdx + 1]) : null;

    let changedFiles: string[] = [];
    if (filesPath !== null && existsSync(filesPath)) {
      changedFiles = readFileSync(filesPath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    }

    changeType = changedFiles.length > 0 ? detectChangeType(changedFiles) : "feature";
  }

  const suggestion = TEMPLATES[changeType] ?? TEMPLATES["feature"];

  if (format === "json") {
    console.log(JSON.stringify(suggestion, null, 2));
    return;
  }

  console.log(`\n=== Review Template: ${suggestion.changeType} ===\n`);
  console.log(`Template: ${suggestion.template}`);
  console.log("\nFocus Areas:");
  for (const area of suggestion.focusAreas) {
    console.log(`  • ${area}`);
  }
  console.log("\nChecklist:");
  for (const item of suggestion.checklistItems) {
    console.log(`  ☐ ${item}`);
  }
}
