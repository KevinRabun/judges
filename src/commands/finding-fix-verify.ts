/**
 * Finding-fix-verify — Verify that applied fixes actually resolve findings.
 */

import type { TribunalVerdict } from "../types.js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VerificationRecord {
  ruleId: string;
  title: string;
  status: "resolved" | "unresolved" | "new";
  verifiedAt: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFixVerify(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges finding-fix-verify — Verify fixes resolve findings

Usage:
  judges finding-fix-verify compare --before <f1> --after <f2> [--format json]
  judges finding-fix-verify check   --file <results.json> --rule <ruleId>
  judges finding-fix-verify history [--format json]

Subcommands:
  compare         Compare before/after results to verify fixes
  check           Check if a specific rule's findings are resolved
  history         Show verification history

Options:
  --before <path>  Result file before fixes
  --after <path>   Result file after fixes
  --file <path>    Result file to check
  --rule <ruleId>  Specific rule to verify
  --format json    JSON output
  --help, -h       Show this help
`);
    return;
  }

  const args = argv.slice(1);

  if (sub === "compare") {
    const before = args.find((_a: string, i: number) => args[i - 1] === "--before");
    const after = args.find((_a: string, i: number) => args[i - 1] === "--after");
    const format = args.find((_a: string, i: number) => args[i - 1] === "--format") || "text";
    if (!before || !after) {
      console.error("Error: --before and --after required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(before)) {
      console.error(`Error: file not found: ${before}`);
      process.exitCode = 1;
      return;
    }
    if (!existsSync(after)) {
      console.error(`Error: file not found: ${after}`);
      process.exitCode = 1;
      return;
    }

    let vBefore: TribunalVerdict;
    let vAfter: TribunalVerdict;
    try {
      vBefore = JSON.parse(readFileSync(before, "utf-8"));
    } catch {
      console.error("Error: could not parse before file");
      process.exitCode = 1;
      return;
    }
    try {
      vAfter = JSON.parse(readFileSync(after, "utf-8"));
    } catch {
      console.error("Error: could not parse after file");
      process.exitCode = 1;
      return;
    }

    const beforeRules = new Set((vBefore.findings || []).map((f) => f.ruleId));
    const afterRules = new Set((vAfter.findings || []).map((f) => f.ruleId));

    const records: VerificationRecord[] = [];
    const now = new Date().toISOString();

    for (const f of vBefore.findings || []) {
      if (!afterRules.has(f.ruleId)) {
        records.push({ ruleId: f.ruleId, title: f.title, status: "resolved", verifiedAt: now });
      } else {
        records.push({ ruleId: f.ruleId, title: f.title, status: "unresolved", verifiedAt: now });
      }
    }
    for (const f of vAfter.findings || []) {
      if (!beforeRules.has(f.ruleId)) {
        records.push({ ruleId: f.ruleId, title: f.title, status: "new", verifiedAt: now });
      }
    }

    // Save history
    const histFile = join(process.cwd(), ".judges", "fix-verify-history.json");
    const hd = dirname(histFile);
    if (!existsSync(hd)) mkdirSync(hd, { recursive: true });
    const existing: VerificationRecord[] = existsSync(histFile)
      ? (() => {
          try {
            return JSON.parse(readFileSync(histFile, "utf-8"));
          } catch {
            return [];
          }
        })()
      : [];
    const history = [...existing, ...records];
    writeFileSync(histFile, JSON.stringify(history.slice(-500), null, 2));

    const resolved = records.filter((r) => r.status === "resolved");
    const unresolved = records.filter((r) => r.status === "unresolved");
    const newFindings = records.filter((r) => r.status === "new");

    if (format === "json") {
      console.log(
        JSON.stringify(
          { resolved: resolved.length, unresolved: unresolved.length, new: newFindings.length, records },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`\nFix Verification:`);
    console.log("═".repeat(65));
    console.log(`  ✓ Resolved:   ${resolved.length}`);
    console.log(`  ✗ Unresolved: ${unresolved.length}`);
    console.log(`  ★ New:        ${newFindings.length}`);
    console.log("─".repeat(65));

    if (resolved.length > 0) {
      console.log("\n  Resolved:");
      for (const r of resolved.slice(0, 10)) console.log(`    ✓ ${r.ruleId} — ${r.title}`);
    }
    if (unresolved.length > 0) {
      console.log("\n  Still Open:");
      for (const r of unresolved.slice(0, 10)) console.log(`    ✗ ${r.ruleId} — ${r.title}`);
    }
    if (newFindings.length > 0) {
      console.log("\n  New (regressions?):");
      for (const r of newFindings.slice(0, 10)) console.log(`    ★ ${r.ruleId} — ${r.title}`);
    }
    console.log("═".repeat(65));
  } else if (sub === "check") {
    const file = args.find((_a: string, i: number) => args[i - 1] === "--file");
    const rule = args.find((_a: string, i: number) => args[i - 1] === "--rule");
    if (!file || !rule) {
      console.error("Error: --file and --rule required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      console.error("Error: could not parse file");
      process.exitCode = 1;
      return;
    }

    const matches = (verdict.findings || []).filter((f) => f.ruleId === rule);
    if (matches.length === 0) {
      console.log(`✓ Rule "${rule}" has no findings — fix verified!`);
    } else {
      console.log(`✗ Rule "${rule}" still has ${matches.length} finding(s):`);
      for (const m of matches.slice(0, 5)) console.log(`  - ${m.title} [${m.severity}]`);
    }
  } else if (sub === "history") {
    const format = args.find((_a: string, i: number) => args[i - 1] === "--format") || "text";
    const histFile = join(process.cwd(), ".judges", "fix-verify-history.json");
    if (!existsSync(histFile)) {
      console.log("No verification history found.");
      return;
    }
    let history: VerificationRecord[];
    try {
      history = JSON.parse(readFileSync(histFile, "utf-8"));
    } catch {
      console.log("Could not parse history.");
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(history, null, 2));
      return;
    }

    console.log(`\nVerification History: ${history.length} records`);
    console.log("═".repeat(55));
    for (const h of history.slice(-15)) {
      const icon = h.status === "resolved" ? "✓" : h.status === "new" ? "★" : "✗";
      console.log(`  ${icon} ${h.ruleId.padEnd(22)} ${h.status.padEnd(12)} ${h.verifiedAt.slice(0, 10)}`);
    }
    console.log("═".repeat(55));
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
