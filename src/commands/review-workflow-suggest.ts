import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-workflow-suggest ────────────────────────────────────────
   Suggest optimal review workflows based on project characteristics.
   Analyses recent review history, finding patterns, and config to
   recommend the best review cadence, focus areas, and tooling
   setup for maximum adoption.
   ─────────────────────────────────────────────────────────────────── */

interface WorkflowSuggestion {
  area: string;
  suggestion: string;
  priority: string;
  reason: string;
}

function buildSuggestions(baseDir: string): WorkflowSuggestion[] {
  const suggestions: WorkflowSuggestion[] = [];

  const configPath = join(baseDir, ".judgesrc.json");
  if (!existsSync(configPath)) {
    suggestions.push({
      area: "Configuration",
      suggestion: "Create .judgesrc.json with judges init",
      priority: "high",
      reason: "No config file found — using defaults may produce noisy results",
    });
  }

  const baselinePath = join(baseDir, ".judges", "baseline.json");
  if (!existsSync(baselinePath)) {
    suggestions.push({
      area: "Baseline",
      suggestion: "Generate a baseline to suppress known findings",
      priority: "high",
      reason: "Without a baseline, existing issues flood every review",
    });
  }

  const historyDir = join(baseDir, ".judges", "history");
  let historyCount = 0;
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir) as unknown as string[];
    historyCount = files.filter((f) => String(f).endsWith(".json")).length;
  }

  if (historyCount === 0) {
    suggestions.push({
      area: "Review cadence",
      suggestion: "Start with weekly reviews, then move to per-PR",
      priority: "medium",
      reason: "No review history — establish a rhythm before scaling up",
    });
  } else if (historyCount < 5) {
    suggestions.push({
      area: "Review cadence",
      suggestion: "Consider integrating into CI for automatic PR reviews",
      priority: "medium",
      reason: `Only ${historyCount} reviews on file — automate to increase coverage`,
    });
  }

  const lastVerdictPath = join(baseDir, ".judges", "last-verdict.json");
  if (existsSync(lastVerdictPath)) {
    try {
      const raw = readFileSync(lastVerdictPath, "utf-8");
      const verdict = JSON.parse(raw) as TribunalVerdict;
      const findings = verdict.findings ?? [];
      const criticals = findings.filter((f) => f.severity === "critical").length;
      const highs = findings.filter((f) => f.severity === "high").length;

      if (criticals > 5) {
        suggestions.push({
          area: "Security focus",
          suggestion: "Enable focused security judge preset",
          priority: "high",
          reason: `${criticals} critical findings — prioritise security review`,
        });
      }

      if (highs > 10) {
        suggestions.push({
          area: "Severity tuning",
          suggestion: "Review minSeverity setting to reduce noise",
          priority: "medium",
          reason: `${highs} high-severity findings may cause alert fatigue`,
        });
      }

      if (findings.length > 50) {
        suggestions.push({
          area: "Scope",
          suggestion: "Use diff-only mode to review only changed code",
          priority: "medium",
          reason: `${findings.length} findings — full-scan mode may overwhelm developers`,
        });
      }

      const patchable = findings.filter((f) => f.patch !== undefined && f.patch !== null).length;
      if (patchable > 0) {
        suggestions.push({
          area: "Autofix",
          suggestion: "Enable auto-fix to apply available patches automatically",
          priority: "low",
          reason: `${patchable} findings have patches — auto-apply saves time`,
        });
      }
    } catch {
      /* skip if parse fails */
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({
      area: "General",
      suggestion: "Current workflow looks good — continue iterating",
      priority: "low",
      reason: "No obvious improvements detected",
    });
  }

  return suggestions;
}

export function runReviewWorkflowSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-workflow-suggest [options]

Suggest optimal review workflows based on project characteristics.

Options:
  --dir <path>         Project directory (default: cwd)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const dirIdx = argv.indexOf("--dir");
  const baseDir = dirIdx !== -1 && argv[dirIdx + 1] ? join(process.cwd(), argv[dirIdx + 1]) : process.cwd();

  const suggestions = buildSuggestions(baseDir);

  if (format === "json") {
    console.log(JSON.stringify(suggestions, null, 2));
    return;
  }

  console.log(`\n=== Workflow Suggestions (${suggestions.length}) ===\n`);

  for (const s of suggestions) {
    console.log(`  [${s.priority.toUpperCase()}] ${s.area}`);
    console.log(`         ${s.suggestion}`);
    console.log(`         Reason: ${s.reason}`);
    console.log();
  }
}
