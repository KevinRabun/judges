/**
 * Review-diff-summary — Concise summary of changes and findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDiffSummary(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-diff-summary — Concise summary of changes + findings

Usage:
  judges review-diff-summary --file verdict.json
  judges review-diff-summary --before before.json --after after.json
  judges review-diff-summary --format json

Options:
  --file <path>           Single verdict to summarize
  --before <path>         Baseline verdict (before changes)
  --after <path>          Updated verdict (after changes)
  --max-lines <n>         Max summary lines (default: 20)
  --format json           JSON output
  --help, -h              Show this help

Generates a compact, PR-ready summary with key changes
and finding deltas. Ideal for commit messages or PR descriptions.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const beforeFile = argv.find((_a: string, i: number) => argv[i - 1] === "--before");
  const afterFile = argv.find((_a: string, i: number) => argv[i - 1] === "--after");
  const maxLines = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--max-lines") || "20", 10);

  // Comparison mode
  if (beforeFile && afterFile) {
    if (!existsSync(beforeFile) || !existsSync(afterFile)) {
      console.error("Error: Both --before and --after files must exist.");
      process.exitCode = 1;
      return;
    }

    let before: TribunalVerdict;
    let after: TribunalVerdict;
    try {
      before = JSON.parse(readFileSync(beforeFile, "utf-8")) as TribunalVerdict;
      after = JSON.parse(readFileSync(afterFile, "utf-8")) as TribunalVerdict;
    } catch {
      console.error("Error: Could not parse verdict files.");
      process.exitCode = 1;
      return;
    }

    const beforeFindings = before.findings || [];
    const afterFindings = after.findings || [];
    const scoreDelta = (after.overallScore || 0) - (before.overallScore || 0);
    const findingsDelta = afterFindings.length - beforeFindings.length;

    const beforeKeys = new Set(beforeFindings.map(fKey));
    const afterKeys = new Set(afterFindings.map(fKey));

    const resolved = beforeFindings.filter((f) => !afterKeys.has(fKey(f)));
    const introduced = afterFindings.filter((f) => !beforeKeys.has(fKey(f)));

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            scoreBefore: before.overallScore || 0,
            scoreAfter: after.overallScore || 0,
            scoreDelta,
            findingsBefore: beforeFindings.length,
            findingsAfter: afterFindings.length,
            findingsDelta,
            resolved: resolved.length,
            introduced: introduced.length,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`\n  Review Diff Summary\n  ═════════════════════════════`);
    console.log(
      `    Score: ${before.overallScore || 0} → ${after.overallScore || 0} (${scoreDelta >= 0 ? "+" : ""}${scoreDelta})`,
    );
    console.log(
      `    Findings: ${beforeFindings.length} → ${afterFindings.length} (${findingsDelta >= 0 ? "+" : ""}${findingsDelta})`,
    );
    console.log(`    Resolved: ${resolved.length} ✅`);
    console.log(`    Introduced: ${introduced.length} ${introduced.length > 0 ? "🆕" : ""}`);

    if (resolved.length > 0) {
      console.log("\n    Resolved:");
      for (const f of resolved.slice(0, maxLines)) {
        console.log(`      ✅ [${(f.severity || "").toUpperCase()}] ${f.title || f.ruleId}`);
      }
    }
    if (introduced.length > 0) {
      console.log("\n    Introduced:");
      for (const f of introduced.slice(0, maxLines)) {
        console.log(`      🆕 [${(f.severity || "").toUpperCase()}] ${f.title || f.ruleId}`);
      }
    }

    console.log();
    return;
  }

  // Single-file mode
  if (!file) {
    console.error("Error: --file or both --before and --after are required.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Could not parse ${file}`);
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  const severityCounts: Record<string, number> = {};
  for (const f of findings) {
    const sev = f.severity || "unknown";
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          score: verdict.overallScore || 0,
          verdict: verdict.overallVerdict || "n/a",
          totalFindings: findings.length,
          severityCounts,
          summary: verdict.summary || "",
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n  Review Summary\n  ─────────────────────────────`);
  console.log(
    `    Score: ${verdict.overallScore || 0}/100 | Verdict: ${verdict.overallVerdict || "n/a"} | Findings: ${findings.length}`,
  );

  const sevParts: string[] = [];
  for (const [sev, count] of Object.entries(severityCounts)) {
    sevParts.push(`${sev}: ${count}`);
  }
  if (sevParts.length > 0) {
    console.log(`    ${sevParts.join(" | ")}`);
  }

  if (verdict.summary) {
    console.log(`\n    ${verdict.summary}`);
  }

  if (findings.length > 0) {
    console.log("\n    Top findings:");
    for (const f of findings.slice(0, Math.min(maxLines, findings.length))) {
      console.log(`      [${(f.severity || "").toUpperCase()}] ${f.title || f.ruleId}`);
    }
    if (findings.length > maxLines) {
      console.log(`      ... and ${findings.length - maxLines} more`);
    }
  }

  console.log();
}

function fKey(f: Finding): string {
  return [f.ruleId || "", f.title || "", String(f.severity || "")].join("|").toLowerCase();
}
