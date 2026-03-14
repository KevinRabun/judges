/**
 * Over-abstraction — detect unnecessary abstractions and premature generalization from AI.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AbstractionIssue {
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

// ─── Cross-file data ────────────────────────────────────────────────────────

function buildUsageIndex(files: string[]): Map<string, number> {
  const usageCount = new Map<string, number>();
  const allContent = new Map<string, string>();

  for (const f of files) {
    try {
      allContent.set(f, readFileSync(f, "utf-8"));
    } catch {
      /* skip */
    }
  }

  // Count how many files reference each exported name
  for (const [_file, content] of allContent) {
    const exportNames = [
      ...content.matchAll(
        /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum|abstract\s+class)\s+(\w+)/g,
      ),
    ].map((m) => m[1]);
    for (const name of exportNames) {
      let count = 0;
      for (const [otherFile, otherContent] of allContent) {
        if (otherFile === _file) continue;
        if (new RegExp(`\\b${name}\\b`).test(otherContent)) count++;
      }
      usageCount.set(name, count);
    }
  }

  return usageCount;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(
  filepath: string,
  usageCount: Map<string, number>,
  allContents: Map<string, string>,
): AbstractionIssue[] {
  const issues: AbstractionIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Abstract class with single subclass
    if (/(?:export\s+)?abstract\s+class\s+(\w+)/.test(line)) {
      const className = line.match(/abstract\s+class\s+(\w+)/)?.[1];
      if (className) {
        let subclassCount = 0;
        for (const [_f, c] of allContents) {
          const extends_ = (c.match(new RegExp(`extends\\s+${className}\\b`, "g")) || []).length;
          subclassCount += extends_;
        }
        if (subclassCount <= 1) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Abstract class with single implementation",
            severity: "medium",
            detail: `\`${className}\` has ${subclassCount} subclass(es) — abstract base is premature; inline into the concrete class`,
          });
        }
      }
    }

    // Interface with single implementation
    if (/(?:export\s+)?interface\s+(\w+)\s*\{/.test(line)) {
      const ifaceName = line.match(/interface\s+(\w+)/)?.[1];
      if (
        ifaceName &&
        !ifaceName.endsWith("Props") &&
        !ifaceName.endsWith("Options") &&
        !ifaceName.endsWith("Config")
      ) {
        let implCount = 0;
        for (const [_f, c] of allContents) {
          if (new RegExp(`implements\\s+${ifaceName}\\b`).test(c)) implCount++;
          if (new RegExp(`:\\s*${ifaceName}\\b`).test(c)) implCount++;
        }
        const uses = usageCount.get(ifaceName) || 0;
        if (implCount <= 1 && uses <= 1 && !/export/.test(line)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Interface used only once",
            severity: "low",
            detail: `\`${ifaceName}\` has single implementation and minimal usage — may be premature abstraction`,
          });
        }
      }
    }

    // Generic type parameter used in one instantiation
    if (/(?:function|class)\s+\w+\s*<(\w+)/.test(line)) {
      const genericParam = line.match(/<(\w+)(?:\s+extends)?/)?.[1];
      if (genericParam && genericParam !== "T") {
        // This is a heuristic — single-letter generics are normal
        const body = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
        const usages = (body.match(new RegExp(`\\b${genericParam}\\b`, "g")) || []).length;
        if (usages <= 2) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Generic type parameter barely used",
            severity: "low",
            detail: `Generic \`<${genericParam}>\` used only ${usages} times in body — concrete type may suffice`,
          });
        }
      }
    }

    // Factory function that creates only one type
    if (/(?:function|const)\s+create(\w+)\s*(?:=\s*\(|\()/.test(line)) {
      const factoryName = line.match(/(?:function|const)\s+(create\w+)/)?.[1];
      if (factoryName) {
        const block = lines.slice(i, Math.min(i + 20, lines.length)).join("\n");
        const newCount = (block.match(/new\s+\w+/g) || []).length;
        const returnCount = (block.match(/return\s+(?:new\s+)?\w+/g) || []).length;
        if (newCount === 1 && returnCount <= 1) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Factory that creates single type",
            severity: "low",
            detail: `\`${factoryName}\` creates one concrete type — factory pattern adds unnecessary indirection`,
          });
        }
      }
    }

    // Wrapper function that only delegates
    if (/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/.test(line)) {
      const funcName = line.match(/function\s+(\w+)/)?.[1];
      const block = lines
        .slice(i + 1, Math.min(i + 5, lines.length))
        .join("\n")
        .trim();
      // Function body is just "return otherFunc(args)" or similar
      if (/^(?:\{?\s*)?return\s+\w+\s*\([^)]*\)\s*;?\s*\}?\s*$/.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Wrapper function with no added logic",
          severity: "medium",
          detail: `\`${funcName}\` only delegates to another function — remove the wrapper and call directly`,
        });
      }
    }

    // Config object for single value
    if (/(?:interface|type)\s+(\w*Config\w*|\w*Options\w*)\s*[={]/.test(line)) {
      const configName = line.match(/(?:interface|type)\s+(\w+)/)?.[1];
      if (configName) {
        let depth = 0;
        let end = i;
        let started = false;
        for (let j = i; j < Math.min(i + 20, lines.length); j++) {
          for (const ch of lines[j]) {
            if (ch === "{") {
              depth++;
              started = true;
            }
            if (ch === "}") depth--;
          }
          if (started && depth <= 0) {
            end = j;
            break;
          }
        }
        const body = lines.slice(i + 1, end).join("\n");
        const fieldCount = (body.match(/\w+\s*[?:]?\s*:/g) || []).length;
        if (fieldCount === 1) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Config type with single field",
            severity: "low",
            detail: `\`${configName}\` has only 1 field — pass the value directly instead of wrapping in config object`,
          });
        }
      }
    }

    // Strategy pattern with single strategy
    if (/(?:Strategy|Handler|Provider|Adapter)\s*[{<\]]/.test(line) && /interface|type/.test(line)) {
      const patternName = line.match(/(\w+(?:Strategy|Handler|Provider|Adapter))/)?.[1];
      if (patternName) {
        let implCount = 0;
        for (const [_f, c] of allContents) {
          if (new RegExp(`implements\\s+${patternName}\\b`).test(c)) implCount++;
          if (new RegExp(`class\\s+\\w+${patternName.replace(/^I/, "")}\\b`).test(c)) implCount++;
        }
        if (implCount <= 1) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Pattern interface with single implementation",
            severity: "medium",
            detail: `\`${patternName}\` has ${implCount} implementation(s) — strategy/adapter pattern is premature`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runOverAbstraction(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges over-abstraction — Detect unnecessary abstractions from AI-generated code

Usage:
  judges over-abstraction [dir]
  judges over-abstraction src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: abstract classes with single subclass, single-implementation interfaces,
barely-used generics, single-type factories, delegation-only wrappers,
single-field config types, single-impl strategy/adapter patterns.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const usageCount = buildUsageIndex(files);
  const allContents = new Map<string, string>();
  for (const f of files) {
    try {
      allContents.set(f, readFileSync(f, "utf-8"));
    } catch {
      /* skip */
    }
  }

  const allIssues: AbstractionIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f, usageCount, allContents));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(
    0,
    100 - highCount * 10 - medCount * 5 - allIssues.filter((i) => i.severity === "low").length * 2,
  );

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
    const badge = score >= 80 ? "✅ LEAN" : score >= 50 ? "⚠️  OVER-BUILT" : "❌ OVER-ENGINEERED";
    console.log(`\n  Over-Abstraction: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No over-abstraction detected.\n");
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
