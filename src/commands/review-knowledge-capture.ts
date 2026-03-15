import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-knowledge-capture ───────────────────────────────────────
   Capture recurring patterns and lessons learned from review
   findings. Appends to a local knowledge base file so teams can
   build institutional knowledge over time.
   ─────────────────────────────────────────────────────────────────── */

interface KnowledgeEntry {
  ruleId: string;
  pattern: string;
  lesson: string;
  severity: string;
  capturedAt: string;
  occurrences: number;
}

interface KnowledgeBase {
  entries: KnowledgeEntry[];
}

function extractPatterns(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.ruleId;
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }
  return groups;
}

function mergeKnowledge(existing: KnowledgeBase, findings: Finding[]): KnowledgeBase {
  const patterns = extractPatterns(findings);
  const entryMap = new Map<string, KnowledgeEntry>();

  for (const e of existing.entries) {
    entryMap.set(e.ruleId, e);
  }

  for (const [ruleId, group] of patterns) {
    const existing_ = entryMap.get(ruleId);
    if (existing_) {
      existing_.occurrences += group.length;
    } else {
      const sample = group[0];
      entryMap.set(ruleId, {
        ruleId,
        pattern: sample.title,
        lesson: sample.recommendation,
        severity: sample.severity,
        capturedAt: new Date().toISOString().slice(0, 10),
        occurrences: group.length,
      });
    }
  }

  const entries = Array.from(entryMap.values());
  entries.sort((a, b) => b.occurrences - a.occurrences);
  return { entries };
}

export function runReviewKnowledgeCapture(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-knowledge-capture [options]

Capture recurring patterns and lessons from findings.

Options:
  --report <path>      Path to verdict JSON file
  --kb <path>          Path to knowledge base file
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const kbIdx = argv.indexOf("--kb");
  const kbPath =
    kbIdx !== -1 && argv[kbIdx + 1]
      ? join(process.cwd(), argv[kbIdx + 1])
      : join(process.cwd(), ".judges", "knowledge-base.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to capture.");
    return;
  }

  let existing: KnowledgeBase = { entries: [] };
  if (existsSync(kbPath)) {
    existing = JSON.parse(readFileSync(kbPath, "utf-8")) as KnowledgeBase;
  }

  const updated = mergeKnowledge(existing, findings);
  const kbDir = join(kbPath, "..");
  if (!existsSync(kbDir)) {
    mkdirSync(kbDir, { recursive: true });
  }
  writeFileSync(kbPath, JSON.stringify(updated, null, 2), "utf-8");

  if (format === "json") {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  console.log(`\n=== Knowledge Base (${updated.entries.length} patterns) ===\n`);
  for (const e of updated.entries) {
    console.log(`${e.ruleId} (${e.occurrences}x) — ${e.pattern}`);
    console.log(`  Lesson: ${e.lesson}`);
    console.log();
  }
  console.log(`Saved to: ${kbPath}`);
}
