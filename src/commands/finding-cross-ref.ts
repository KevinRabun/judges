/**
 * Finding-cross-ref — Cross-reference findings across multiple reviews.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CrossRef {
  ruleId: string;
  title: string;
  occurrences: number;
  files: string[];
  persistent: boolean;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function crossReference(verdicts: Array<{ name: string; verdict: TribunalVerdict }>): CrossRef[] {
  const ruleMap = new Map<string, { title: string; files: Set<string> }>();

  for (const { name, verdict } of verdicts) {
    for (const f of verdict.findings) {
      const existing = ruleMap.get(f.ruleId);
      if (existing) {
        existing.files.add(name);
      } else {
        ruleMap.set(f.ruleId, { title: f.title, files: new Set([name]) });
      }
    }
  }

  return [...ruleMap.entries()]
    .map(([ruleId, data]) => ({
      ruleId,
      title: data.title,
      occurrences: data.files.size,
      files: [...data.files],
      persistent: data.files.size === verdicts.length,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCrossRef(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const persistentOnly = argv.includes("--persistent");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-cross-ref — Cross-reference findings across reviews

Usage:
  judges finding-cross-ref --dir <verdicts-dir> [--persistent]
                           [--format table|json]

Options:
  --dir <path>         Directory of verdict JSON files (required)
  --persistent         Show only findings present in all reviews
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (!dirPath) {
    console.error("Error: --dir required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(dirPath)) {
    console.error(`Error: not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  const files = (readdirSync(dirPath) as unknown as string[]).filter((f) => f.endsWith(".json"));
  const verdicts: Array<{ name: string; verdict: TribunalVerdict }> = [];

  for (const file of files) {
    try {
      verdicts.push({
        name: file,
        verdict: JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")),
      });
    } catch {
      // skip
    }
  }

  if (verdicts.length === 0) {
    console.error("Error: no valid verdict files found");
    process.exitCode = 1;
    return;
  }

  let refs = crossReference(verdicts);
  if (persistentOnly) {
    refs = refs.filter((r) => r.persistent);
  }

  if (format === "json") {
    console.log(JSON.stringify(refs, null, 2));
    return;
  }

  console.log(`\nCross-Reference (${refs.length} rules across ${verdicts.length} reviews)`);
  console.log("═".repeat(70));
  console.log(`${"Rule".padEnd(22)} ${"Occurrences".padEnd(14)} ${"Persistent".padEnd(12)} Title`);
  console.log("─".repeat(70));

  for (const r of refs.slice(0, 20)) {
    const rule = r.ruleId.length > 20 ? r.ruleId.slice(0, 20) + "…" : r.ruleId;
    const title = r.title.length > 20 ? r.title.slice(0, 20) + "…" : r.title;
    console.log(
      `${rule.padEnd(22)} ${String(r.occurrences).padEnd(14)} ${(r.persistent ? "yes" : "no").padEnd(12)} ${title}`,
    );
  }
  console.log("═".repeat(70));
}
