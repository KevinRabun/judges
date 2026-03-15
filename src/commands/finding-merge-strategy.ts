import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Finding } from "../types.js";

/* ── finding-merge-strategy ─────────────────────────────────────────
   Determine how to merge findings across branches, detecting
   duplicates, conflicts, and suggesting resolution strategies
   for multi-branch review workflows.
   ─────────────────────────────────────────────────────────────────── */

interface MergeEntry {
  ruleId: string;
  severity: string;
  branch: string;
  status: string;
  strategy: string;
}

function detectMergeStrategy(branchFindings: Map<string, Finding[]>): MergeEntry[] {
  const entries: MergeEntry[] = [];
  const seenRules = new Map<string, string[]>();

  for (const [branch, findings] of branchFindings) {
    for (const f of findings) {
      const existing = seenRules.get(f.ruleId);
      if (existing !== undefined) {
        existing.push(branch);
        entries.push({
          ruleId: f.ruleId,
          severity: f.severity,
          branch,
          status: "duplicate",
          strategy: "deduplicate — keep highest severity instance",
        });
      } else {
        seenRules.set(f.ruleId, [branch]);
        entries.push({
          ruleId: f.ruleId,
          severity: f.severity,
          branch,
          status: "unique",
          strategy: "carry forward to merged result",
        });
      }
    }
  }

  return entries;
}

export function runFindingMergeStrategy(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-merge-strategy [options]

Suggest merge strategies for findings across branches.

Options:
  --dir <path>      Directory containing per-branch verdict files
  --format <fmt>    Output format: table (default) or json
  -h, --help        Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const dirIdx = argv.indexOf("--dir");
  const dirPath =
    dirIdx !== -1 && argv[dirIdx + 1]
      ? join(process.cwd(), argv[dirIdx + 1])
      : join(process.cwd(), ".judges", "branches");

  if (!existsSync(dirPath)) {
    console.log(`No branch findings directory found at: ${dirPath}`);
    console.log("Place per-branch verdict JSON files in .judges/branches/");
    return;
  }

  const files = (readdirSync(dirPath) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No branch verdict files found.");
    return;
  }

  const branchFindings = new Map<string, Finding[]>();
  for (const file of files) {
    const branchName = file.replace(/\.json$/, "");
    const content = JSON.parse(readFileSync(join(dirPath, file), "utf-8"));
    const findings: Finding[] = content.findings ?? [];
    branchFindings.set(branchName, findings);
  }

  const entries = detectMergeStrategy(branchFindings);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log("\n=== Finding Merge Strategy ===\n");
  console.log(`Branches analyzed: ${branchFindings.size}`);
  console.log(`Total entries: ${entries.length}\n`);

  const duplicates = entries.filter((e) => e.status === "duplicate").length;
  const unique = entries.filter((e) => e.status === "unique").length;
  console.log(`  Unique: ${unique}`);
  console.log(`  Duplicates: ${duplicates}\n`);

  for (const entry of entries) {
    console.log(`[${entry.status.toUpperCase()}] ${entry.ruleId} (${entry.severity}) — ${entry.branch}`);
    console.log(`  Strategy: ${entry.strategy}`);
  }
}
