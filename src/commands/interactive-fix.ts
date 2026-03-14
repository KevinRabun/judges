/**
 * `judges fix --interactive` — Interactive fix mode.
 *
 * Presents each auto-fixable finding one by one, letting the developer
 * accept, skip, or view the diff before applying each patch.
 * Reduces trust barrier by giving full control over what gets changed.
 *
 * Usage:
 *   judges fix src/app.ts --interactive       # Interactive per-finding review
 *   judges fix src/app.ts -I                  # Short form
 */

import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import type { Finding, Patch } from "../types.js";
import { applyPatches, type PatchCandidate } from "./fix.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InteractiveFixResult {
  accepted: number;
  skipped: number;
  total: number;
}

// ─── Diff Display ───────────────────────────────────────────────────────────

function formatPatchDiff(patch: Patch): string {
  const lines: string[] = [];
  lines.push(`  Line ${patch.startLine}–${patch.endLine}:`);
  for (const line of patch.oldText.split("\n")) {
    lines.push(`  \x1b[31m- ${line}\x1b[0m`);
  }
  for (const line of patch.newText.split("\n")) {
    lines.push(`  \x1b[32m+ ${line}\x1b[0m`);
  }
  return lines.join("\n");
}

function formatFindingHeader(finding: Finding, index: number, total: number): string {
  const sevColors: Record<string, string> = {
    critical: "\x1b[31;1m",
    high: "\x1b[31m",
    medium: "\x1b[33m",
    low: "\x1b[36m",
    info: "\x1b[37m",
  };
  const color = sevColors[finding.severity] || "\x1b[37m";
  const reset = "\x1b[0m";

  return [
    "",
    `═══════════════════════════════════════════════════════════════`,
    `  [${index + 1}/${total}] ${color}${finding.severity.toUpperCase()}${reset} ${finding.ruleId} — ${finding.title}`,
    `  ${finding.description}`,
    `───────────────────────────────────────────────────────────────`,
  ].join("\n");
}

// ─── Interactive Prompt ─────────────────────────────────────────────────────

async function promptUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─── Interactive Fix Runner ─────────────────────────────────────────────────

/**
 * Run interactive fix mode — present each fixable finding and let the user
 * accept or skip it before applying.
 */
export async function runInteractiveFix(filePath: string, findings: Finding[]): Promise<InteractiveFixResult> {
  const fixable = findings.filter((f) => f.patch);

  if (fixable.length === 0) {
    console.log("\n  No auto-fixable findings.\n");
    return { accepted: 0, skipped: 0, total: 0 };
  }

  console.log(`\n  Found ${fixable.length} auto-fixable finding(s). Review each one:\n`);

  const accepted: PatchCandidate[] = [];
  let skipped = 0;

  for (let i = 0; i < fixable.length; i++) {
    const finding = fixable[i];

    console.log(formatFindingHeader(finding, i, fixable.length));
    console.log(formatPatchDiff(finding.patch!));
    console.log("");

    const answer = await promptUser("  Apply this fix? [y]es / [n]o / [a]ll / [q]uit: ");

    switch (answer) {
      case "y":
      case "yes":
        accepted.push({
          ruleId: finding.ruleId,
          title: finding.title,
          severity: finding.severity,
          patch: finding.patch!,
          lineNumbers: finding.lineNumbers,
        });
        console.log("  ✓ Accepted\n");
        break;

      case "a":
      case "all":
        // Accept this and all remaining
        accepted.push({
          ruleId: finding.ruleId,
          title: finding.title,
          severity: finding.severity,
          patch: finding.patch!,
          lineNumbers: finding.lineNumbers,
        });
        for (let j = i + 1; j < fixable.length; j++) {
          accepted.push({
            ruleId: fixable[j].ruleId,
            title: fixable[j].title,
            severity: fixable[j].severity,
            patch: fixable[j].patch!,
            lineNumbers: fixable[j].lineNumbers,
          });
        }
        console.log(`  ✓ Accepted all remaining ${fixable.length - i} fix(es)\n`);
        i = fixable.length; // break out of loop
        break;

      case "q":
      case "quit":
        skipped += fixable.length - i;
        console.log("  Quit — remaining fixes skipped.\n");
        i = fixable.length; // break out of loop
        break;

      case "n":
      case "no":
      default:
        skipped++;
        console.log("  ⏭ Skipped\n");
        break;
    }
  }

  // Apply accepted patches
  if (accepted.length > 0) {
    const code = readFileSync(filePath, "utf-8");
    const result = applyPatches(code, accepted);
    writeFileSync(filePath, result.result, "utf-8");
    console.log(`  ✅ Applied ${result.applied} fix(es) to ${filePath}`);
    if (result.skipped > 0) {
      console.log(`  ⏭ ${result.skipped} fix(es) could not be applied (source changed)`);
    }
  }

  console.log(`\n  Summary: ${accepted.length} accepted, ${skipped} skipped out of ${fixable.length}\n`);

  return {
    accepted: accepted.length,
    skipped,
    total: fixable.length,
  };
}
