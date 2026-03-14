/**
 * Comment drift — detect stale, misleading, or contradictory inline comments.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CommentIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs"]);

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

function analyzeFile(filepath: string): CommentIssue[] {
  const issues: CommentIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const commentMatch = line.match(/\/\/\s*(.+)|#\s*(.+)/);
    if (!commentMatch) continue;
    const comment = (commentMatch[1] || commentMatch[2] || "").trim();
    if (!comment || comment.length < 5) continue;

    // TODO/FIXME/HACK without ticket reference
    if (/\b(?:TODO|FIXME|HACK|XXX|TEMP)\b/i.test(comment)) {
      if (!/[A-Z]+-\d+|#\d+|https?:\/\//i.test(comment)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "TODO/FIXME without ticket reference",
          severity: "medium",
          detail: `"${comment.slice(0, 60)}" — link to issue tracker for accountability`,
        });
      }
    }

    // Comment says "returns X" but function returns different
    if (/returns?\s+(?:true|false|null|undefined|void|nothing|string|number|array)/i.test(comment)) {
      const nextLines = lines.slice(i + 1, Math.min(i + 10, lines.length)).join("\n");
      const returnMatch = comment.match(/returns?\s+(true|false|null|undefined|void|nothing)/i);
      if (returnMatch) {
        const stated = returnMatch[1].toLowerCase();
        if (stated === "true" && /return\s+false/i.test(nextLines)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Comment contradicts return value",
            severity: "high",
            detail: `Comment says "returns true" but code returns false`,
          });
        }
        if (stated === "false" && /return\s+true/i.test(nextLines)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Comment contradicts return value",
            severity: "high",
            detail: `Comment says "returns false" but code returns true`,
          });
        }
      }
    }

    // Comment references variable name not in nearby code
    const varRefs = comment.match(/`(\w+)`/g);
    if (varRefs) {
      const contextBlock = lines.slice(Math.max(0, i - 3), Math.min(i + 5, lines.length)).join("\n");
      for (const ref of varRefs) {
        const name = ref.replace(/`/g, "");
        if (
          name.length > 2 &&
          !contextBlock.includes(name) &&
          !/(?:true|false|null|undefined|string|number|boolean)/i.test(name)
        ) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Comment references renamed/deleted variable",
            severity: "high",
            detail: `\`${name}\` mentioned in comment but not found in surrounding code`,
          });
        }
      }
    }

    // Commented-out code (heuristic: looks like code, not English)
    if (/^\s*\/\/\s*(?:const|let|var|function|if|for|while|return|import|export)\s+/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Commented-out code",
        severity: "low",
        detail: "Remove dead code — use version control to preserve history",
      });
    }

    // Obvious/tautological comments
    if (/\/\/\s*(?:increment|add one|set|assign|declare|initialize|create|return)/i.test(line)) {
      const codePart = line.replace(/\/\/.*/, "").trim();
      if (codePart) {
        const commentLower = comment.toLowerCase();
        // "increment i" on line "i++"
        if (/\+\+|i\s*\+=\s*1/.test(codePart) && /increment/i.test(commentLower)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Tautological comment",
            severity: "low",
            detail: "Comment restates the obvious — add 'why' not 'what'",
          });
        }
        // "return result" on line "return result"
        if (/^return\s+\w+/.test(codePart) && /^return\s/i.test(commentLower)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Tautological comment",
            severity: "low",
            detail: "Comment restates the code — add context about why",
          });
        }
      }
    }

    // Outdated parameter names in JSDoc-style comments
    if (/\*\s*@param\s+\{?\w*\}?\s+(\w+)/.test(line)) {
      const paramName = line.match(/@param\s+(?:\{[^}]*\}\s+)?(\w+)/)?.[1];
      if (paramName) {
        // Look for the function definition nearby
        const funcBlock = lines.slice(Math.max(0, i - 5), Math.min(i + 15, lines.length)).join("\n");
        const funcMatch = funcBlock.match(/(?:function|=>|\()\s*\(([^)]*)\)/);
        if (funcMatch && !funcMatch[1].includes(paramName)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "@param references unknown parameter",
            severity: "high",
            detail: `@param ${paramName} not found in function signature — was it renamed?`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCommentDrift(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges comment-drift — Detect stale, misleading, or contradictory comments

Usage:
  judges comment-drift [dir]
  judges comment-drift src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: TODO without tickets, contradictory return comments, renamed variable references,
commented-out code, tautological comments, outdated @param names.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: CommentIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 8 - medCount * 3);

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
    const badge = score >= 80 ? "✅ FRESH" : score >= 50 ? "⚠️  DRIFTED" : "❌ STALE";
    console.log(`\n  Comment Quality: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No comment drift detected.\n");
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
