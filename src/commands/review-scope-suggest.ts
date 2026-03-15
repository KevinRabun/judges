import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Finding } from "../types.js";

/* ── review-scope-suggest ───────────────────────────────────────────
   Suggest optimal review scope for a change by analyzing file types,
   change size, and historical finding density to help reviewers
   focus on the most impactful areas.
   ─────────────────────────────────────────────────────────────────── */

interface ScopeSuggestion {
  file: string;
  priority: string;
  reason: string;
  findingDensity: number;
}

function suggestScope(files: string[], historicalFindings: Finding[]): ScopeSuggestion[] {
  const suggestions: ScopeSuggestion[] = [];

  const findingsByTitle = new Map<string, number>();
  for (const f of historicalFindings) {
    const key = f.title.toLowerCase();
    for (const file of files) {
      if (key.includes(file.toLowerCase()) || file.toLowerCase().includes(key.split(" ")[0])) {
        findingsByTitle.set(file, (findingsByTitle.get(file) ?? 0) + 1);
      }
    }
  }

  for (const file of files) {
    const density = findingsByTitle.get(file) ?? 0;
    const ext = file.split(".").pop() ?? "";

    const securityExts = ["ts", "js", "py", "java", "go", "rs", "cs"];
    const configExts = ["yml", "yaml", "json", "toml", "env"];

    let priority: string;
    let reason: string;

    if (density > 3) {
      priority = "critical";
      reason = `High historical finding density (${density})`;
    } else if (securityExts.includes(ext)) {
      priority = "high";
      reason = "Source code — security-relevant";
    } else if (configExts.includes(ext)) {
      priority = "medium";
      reason = "Configuration file — check for secrets/misconfig";
    } else {
      priority = "low";
      reason = "Low-risk file type";
    }

    suggestions.push({ file, priority, reason, findingDensity: density });
  }

  suggestions.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
  });

  return suggestions;
}

export function runReviewScopeSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-scope-suggest [options]

Suggest optimal review scope for a set of changed files.

Options:
  --files <path>       File listing changed files (one per line)
  --history <path>     Path to historical verdict JSON for density analysis
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const filesIdx = argv.indexOf("--files");
  const filesPath = filesIdx !== -1 && argv[filesIdx + 1] ? join(process.cwd(), argv[filesIdx + 1]) : null;

  let changedFiles: string[] = [];
  if (filesPath !== null && existsSync(filesPath)) {
    changedFiles = readFileSync(filesPath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } else {
    const gitDir = join(process.cwd(), ".git");
    if (existsSync(gitDir)) {
      const reportsDir = join(process.cwd(), ".judges", "reports");
      if (existsSync(reportsDir)) {
        changedFiles = (readdirSync(reportsDir) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
      }
    }
  }

  if (changedFiles.length === 0) {
    console.log("No changed files found. Provide --files or ensure .judges/reports/ exists.");
    return;
  }

  let historicalFindings: Finding[] = [];
  const historyIdx = argv.indexOf("--history");
  if (historyIdx !== -1 && argv[historyIdx + 1]) {
    const histPath = join(process.cwd(), argv[historyIdx + 1]);
    if (existsSync(histPath)) {
      const data = JSON.parse(readFileSync(histPath, "utf-8"));
      historicalFindings = data.findings ?? [];
    }
  } else {
    const defaultHist = join(process.cwd(), ".judges", "last-verdict.json");
    if (existsSync(defaultHist)) {
      const data = JSON.parse(readFileSync(defaultHist, "utf-8"));
      historicalFindings = data.findings ?? [];
    }
  }

  const suggestions = suggestScope(changedFiles, historicalFindings);

  if (format === "json") {
    console.log(JSON.stringify(suggestions, null, 2));
    return;
  }

  console.log("\n=== Review Scope Suggestions ===\n");
  console.log(`Files analyzed: ${changedFiles.length}\n`);

  for (const s of suggestions) {
    console.log(`[${s.priority.toUpperCase()}] ${s.file}`);
    console.log(`  Reason: ${s.reason}`);
    if (s.findingDensity > 0) {
      console.log(`  Historical findings: ${s.findingDensity}`);
    }
  }
}
