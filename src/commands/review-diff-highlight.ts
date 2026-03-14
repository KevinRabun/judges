/**
 * Review-diff-highlight — Highlight key differences in review findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiffHighlight {
  type: "added" | "removed" | "changed";
  ruleId: string;
  title: string;
  severity: string;
  detail: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeHighlights(before: TribunalVerdict, after: TribunalVerdict): DiffHighlight[] {
  const highlights: DiffHighlight[] = [];

  const beforeRules = new Map<string, typeof before.findings>();
  for (const f of before.findings) {
    const existing = beforeRules.get(f.ruleId) || [];
    existing.push(f);
    beforeRules.set(f.ruleId, existing);
  }

  const afterRules = new Map<string, typeof after.findings>();
  for (const f of after.findings) {
    const existing = afterRules.get(f.ruleId) || [];
    existing.push(f);
    afterRules.set(f.ruleId, existing);
  }

  // findings in after but not in before (new)
  for (const [ruleId, findings] of afterRules) {
    const beforeCount = (beforeRules.get(ruleId) || []).length;
    if (beforeCount === 0) {
      for (const f of findings) {
        highlights.push({
          type: "added",
          ruleId,
          title: f.title,
          severity: f.severity || "medium",
          detail: "New finding",
        });
      }
    } else if (findings.length > beforeCount) {
      const diff = findings.length - beforeCount;
      highlights.push({
        type: "added",
        ruleId,
        title: findings[0].title,
        severity: findings[0].severity || "medium",
        detail: `${diff} new instance(s)`,
      });
    }
  }

  // findings in before but not in after (resolved)
  for (const [ruleId, findings] of beforeRules) {
    const afterCount = (afterRules.get(ruleId) || []).length;
    if (afterCount === 0) {
      for (const f of findings) {
        highlights.push({
          type: "removed",
          ruleId,
          title: f.title,
          severity: f.severity || "medium",
          detail: "Resolved",
        });
      }
    } else if (afterCount < findings.length) {
      const diff = findings.length - afterCount;
      highlights.push({
        type: "removed",
        ruleId,
        title: findings[0].title,
        severity: findings[0].severity || "medium",
        detail: `${diff} instance(s) resolved`,
      });
    }
  }

  // severity changes
  for (const [ruleId, afterFindings] of afterRules) {
    const beforeFindings = beforeRules.get(ruleId) || [];
    if (beforeFindings.length > 0 && afterFindings.length > 0) {
      const bSev = (beforeFindings[0].severity || "medium").toLowerCase();
      const aSev = (afterFindings[0].severity || "medium").toLowerCase();
      if (bSev !== aSev) {
        highlights.push({
          type: "changed",
          ruleId,
          title: afterFindings[0].title,
          severity: aSev,
          detail: `Severity: ${bSev} → ${aSev}`,
        });
      }
    }
  }

  return highlights;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDiffHighlight(argv: string[]): void {
  const beforeIdx = argv.indexOf("--before");
  const afterIdx = argv.indexOf("--after");
  const formatIdx = argv.indexOf("--format");
  const beforePath = beforeIdx >= 0 ? argv[beforeIdx + 1] : undefined;
  const afterPath = afterIdx >= 0 ? argv[afterIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-diff-highlight — Highlight review differences

Usage:
  judges review-diff-highlight --before <verdict1.json> --after <verdict2.json>
                               [--format table|json]

Options:
  --before <path>    First verdict JSON (baseline)
  --after <path>     Second verdict JSON (current)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!beforePath || !afterPath) {
    console.error("Error: --before and --after required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(beforePath)) {
    console.error(`Error: not found: ${beforePath}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(afterPath)) {
    console.error(`Error: not found: ${afterPath}`);
    process.exitCode = 1;
    return;
  }

  let before: TribunalVerdict;
  let after: TribunalVerdict;
  try {
    before = JSON.parse(readFileSync(beforePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON in before file");
    process.exitCode = 1;
    return;
  }
  try {
    after = JSON.parse(readFileSync(afterPath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON in after file");
    process.exitCode = 1;
    return;
  }

  const highlights = computeHighlights(before, after);

  if (highlights.length === 0) {
    console.log("No differences found between verdicts.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(highlights, null, 2));
    return;
  }

  const added = highlights.filter((h) => h.type === "added");
  const removed = highlights.filter((h) => h.type === "removed");
  const changed = highlights.filter((h) => h.type === "changed");

  console.log(`\nDiff Highlights (${highlights.length} changes)`);
  console.log("═".repeat(70));

  if (added.length > 0) {
    console.log(`\n  + ADDED (${added.length}):`);
    for (const h of added) {
      console.log(`    + [${h.severity}] ${h.ruleId}: ${h.title} — ${h.detail}`);
    }
  }

  if (removed.length > 0) {
    console.log(`\n  - REMOVED (${removed.length}):`);
    for (const h of removed) {
      console.log(`    - [${h.severity}] ${h.ruleId}: ${h.title} — ${h.detail}`);
    }
  }

  if (changed.length > 0) {
    console.log(`\n  ~ CHANGED (${changed.length}):`);
    for (const h of changed) {
      console.log(`    ~ [${h.severity}] ${h.ruleId}: ${h.title} — ${h.detail}`);
    }
  }

  console.log("\n" + "═".repeat(70));
}
