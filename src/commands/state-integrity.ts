/**
 * State integrity — validate state machine correctness, unreachable states, and missing transitions.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StateIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string): StateIssue[] {
  const issues: StateIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const fullText = content;

  // Detect enum/union type definitions for states
  const stateEnums = new Map<string, { values: string[]; line: number }>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const enumMatch = line.match(/enum\s+(\w*(?:State|Status|Phase|Stage|Mode)\w*)\s*\{/i);
    if (enumMatch) {
      const enumName = enumMatch[1];
      let depth = 0;
      let enumEnd = i;
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        if (depth <= 0 && j > i) {
          enumEnd = j;
          break;
        }
      }
      const enumBody = lines.slice(i + 1, enumEnd).join("\n");
      const values = [...enumBody.matchAll(/(\w+)\s*[=,]/g)].map((m) => m[1]);
      if (values.length > 0) stateEnums.set(enumName, { values, line: i + 1 });
    }

    // Also detect string union types for state
    const unionMatch = line.match(/type\s+(\w*(?:State|Status|Phase|Stage|Mode)\w*)\s*=\s*(.+)/i);
    if (unionMatch) {
      const typeName = unionMatch[1];
      const rest = unionMatch[2] + (lines[i + 1] || "");
      const values = [...rest.matchAll(/['"](\w+)['"]/g)].map((m) => m[1]);
      if (values.length > 1) stateEnums.set(typeName, { values, line: i + 1 });
    }
  }

  // Check if all enum values are handled in switch statements
  for (const [enumName, { values }] of stateEnums) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /switch\s*\(/.test(line) &&
        new RegExp(enumName, "i").test(lines.slice(Math.max(0, i - 3), i + 1).join("\n"))
      ) {
        let depth = 0;
        let switchEnd = i;
        let started = false;
        for (let j = i; j < Math.min(i + 60, lines.length); j++) {
          for (const ch of lines[j]) {
            if (ch === "{") {
              depth++;
              started = true;
            }
            if (ch === "}") depth--;
          }
          if (started && depth <= 0) {
            switchEnd = j;
            break;
          }
        }
        const switchBody = lines.slice(i, switchEnd + 1).join("\n");
        const unhandled = values.filter((v) => !switchBody.includes(v));
        if (unhandled.length > 0 && !/default\s*:/.test(switchBody)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Incomplete state handling",
            severity: "high",
            detail: `Switch on ${enumName} missing: ${unhandled.join(", ")} — and no default case`,
          });
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Impossible state combinations (boolean flags)
    if (/(?:loading|isLoading)\s*[:=]\s*true/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (/(?:error|isError|hasError)\s*[:=]\s*true/.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Impossible state: loading + error simultaneously",
          severity: "medium",
          detail:
            "Setting loading and error to true at the same time — use state machine to prevent impossible combinations",
        });
      }
    }

    // Direct state mutation without transition validation
    if (/\.(?:state|status|phase)\s*=\s*['"](\w+)['"]/.test(line)) {
      const newState = line.match(/\.(?:state|status|phase)\s*=\s*['"](\w+)['"]/)?.[1];
      const block = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
      if (!/if\s*\(|switch\s*\(|transition|canTransition|validate|guard|allowed/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "State mutation without transition guard",
          severity: "medium",
          detail: `Setting state to '${newState}' without validating transition — any state can be set from any other`,
        });
      }
    }

    // useState with multiple related booleans (React)
    if (/useState\s*<?\s*boolean\s*>?\s*\(\s*(?:true|false)\s*\)/.test(line)) {
      const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      const boolStateCount = (block.match(/useState\s*<?\s*boolean/g) || []).length;
      if (boolStateCount >= 3) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Too many boolean state variables",
          severity: "medium",
          detail: `${boolStateCount} boolean useState calls in proximity — use discriminated union or state machine to prevent impossible states`,
        });
      }
    }

    // Redux/Vuex: reducer with incomplete action handling
    if (/(?:createSlice|createReducer|reducer)\s*[(:]/.test(line)) {
      const block = lines.slice(i, Math.min(i + 40, lines.length)).join("\n");
      if (!/default\s*:|exhaustive|never/i.test(block)) {
        const caseCount = (block.match(/case\s+['"]?\w+['"]?\s*:|(\w+)\s*(?::\s*\(|:\s*\{)/g) || []).length;
        if (caseCount > 0 && caseCount < 3) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Reducer with few cases and no default",
            severity: "low",
            detail: "Reducer handles few actions — ensure all action types are covered",
          });
        }
      }
    }

    // State variable set to invalid value (magic string)
    if (/(?:state|status|phase|stage|mode)\s*[:=]\s*['"](\w+)['"]/.test(line)) {
      const value = line.match(/(?:state|status|phase|stage|mode)\s*[:=]\s*['"](\w+)['"]/)?.[1];
      if (value) {
        // Check if this value is defined in any state enum or type
        let isDefined = false;
        for (const [_name, { values }] of stateEnums) {
          if (values.includes(value)) {
            isDefined = true;
            break;
          }
        }
        // Check if value is used as a type somewhere
        if (!isDefined && fullText.includes(`'${value}'`) && !/test|spec|fixture/i.test(filepath)) {
          const occurrences = (fullText.match(new RegExp(`['"]${value}['"]`, "g")) || []).length;
          if (occurrences === 1) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "State value used only once",
              severity: "low",
              detail: `State '${value}' appears only once — may be an orphaned or transitional state`,
            });
          }
        }
      }
    }

    // Missing error state in async flow
    if (/async\s+(?:function|=>)/.test(line) && /state|status|phase/i.test(fullText)) {
      const block = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
      if (/loading|pending|fetching/i.test(block)) {
        if (!/error|failed|rejected|catch/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Async flow missing error state",
            severity: "medium",
            detail: "Async operation sets loading state but has no error state — failures leave UI in loading",
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runStateIntegrity(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges state-integrity — Validate state machine correctness and impossible states

Usage:
  judges state-integrity [dir]
  judges state-integrity src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: incomplete enum handling, impossible boolean combinations, state mutation without guards,
excessive boolean state, missing error states in async flows, orphaned state values.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: StateIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 4);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ SOUND" : score >= 50 ? "⚠️  FRAGILE" : "❌ BROKEN";
    console.log(`\n  State Integrity: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No state integrity issues detected.\n");
      return;
    }

    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);

    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
