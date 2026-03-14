/**
 * Completion audit — verify AI-generated code is complete and not truncated.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CompletionIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs"]);

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

function analyzeFile(filepath: string): CompletionIssue[] {
  const issues: CompletionIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  // Check bracket balance (unmatched braces, parens, brackets)
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : "";
    if (inString) {
      if (ch === stringChar && prev !== "\\") inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "/" && (content[i + 1] === "/" || content[i + 1] === "*")) {
      if (content[i + 1] === "/") {
        while (i < content.length && content[i] !== "\n") i++;
      } else {
        i += 2;
        while (i < content.length - 1 && !(content[i] === "*" && content[i + 1] === "/")) i++;
        i++;
      }
      continue;
    }
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (ch === "(") parens++;
    if (ch === ")") parens--;
    if (ch === "[") brackets++;
    if (ch === "]") brackets--;
  }

  if (braces > 0) {
    issues.push({
      file: filepath,
      line: lines.length,
      issue: "Unmatched opening brace(s)",
      severity: "high",
      detail: `${braces} unclosed \`{\` — code may be truncated mid-block`,
    });
  }
  if (parens > 0) {
    issues.push({
      file: filepath,
      line: lines.length,
      issue: "Unmatched opening parenthesis",
      severity: "high",
      detail: `${parens} unclosed \`(\` — function call or expression may be incomplete`,
    });
  }
  if (brackets > 0) {
    issues.push({
      file: filepath,
      line: lines.length,
      issue: "Unmatched opening bracket",
      severity: "high",
      detail: `${brackets} unclosed \`[\` — array literal may be truncated`,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // "... rest of implementation" style truncation markers
    if (
      /\/\/\s*\.{3}\s*(?:rest|remaining|more|other|additional|etc|and so on|similar|same as|continue|implement)/i.test(
        trimmed,
      )
    ) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Truncation marker comment",
        severity: "high",
        detail: 'AI left a "... rest" placeholder — code is incomplete',
      });
    }

    // TODO/FIXME indicating incomplete implementation
    if (/(?:\/\/|#)\s*TODO:?\s*(?:implement|add|finish|complete|fill|write|handle)/i.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "TODO indicates unfinished implementation",
        severity: "medium",
        detail: "TODO comment suggests code needs additional implementation",
      });
    }

    // throw new Error("not implemented")
    if (
      /throw\s+new\s+Error\s*\(\s*['"](?:not implemented|todo|fixme|implement me|unimplemented|stub)/i.test(trimmed)
    ) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Not-implemented error thrown",
        severity: "high",
        detail: "Function throws 'not implemented' — AI left a stub that will crash at runtime",
      });
    }

    // pass/NotImplementedError (Python)
    if (/raise\s+NotImplementedError/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "NotImplementedError raised",
        severity: "high",
        detail: "Python function raises NotImplementedError — implementation is missing",
      });
    }

    // Empty function/method bodies
    if (/(?:function|def|fn)\s+\w+/.test(trimmed)) {
      const block = lines
        .slice(i + 1, Math.min(i + 4, lines.length))
        .join("\n")
        .trim();
      if (/^(?:\{[\s]*\}|pass\s*$)/.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Empty function body",
          severity: "medium",
          detail: "Function declared but body is empty — may be unfinished stub",
        });
      }
    }

    // Ellipsis in code (not in strings or comments)
    if (/^\s*\.{3}\s*$/.test(trimmed) && !/['"]/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Ellipsis placeholder",
        severity: "high",
        detail: "Bare `...` on its own line — indicates truncated AI output",
      });
    }

    // Comment indicating AI truncation
    if (/\/\*\s*\.\.\.\s*\*\//.test(trimmed) || /\/\/\s*\.\.\.\s*$/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Ellipsis comment",
        severity: "medium",
        detail: "Comment with just `...` — AI may have truncated output here",
      });
    }

    // "your code here" / "add your logic"
    if (/(?:your|add|put|insert|write)\s+(?:code|logic|implementation|handling)\s+here/i.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Placeholder instruction comment",
        severity: "high",
        detail: 'AI left a "your code here" placeholder — implementation required',
      });
    }

    // Interface/type with no usage
    if (/(?:interface|type)\s+(\w+)\s*[={<]/.test(trimmed)) {
      const typeName = trimmed.match(/(?:interface|type)\s+(\w+)/)?.[1];
      if (typeName) {
        const usageCount = (content.match(new RegExp(`\\b${typeName}\\b`, "g")) || []).length;
        if (usageCount <= 1 && !/export/.test(trimmed)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Declared type never used",
            severity: "low",
            detail: `\`${typeName}\` declared but never referenced — may be leftover scaffold`,
          });
        }
      }
    }
  }

  // File ends abruptly (last non-empty line is not a closing bracket/brace)
  const lastNonEmpty = lines.filter((l) => l.trim()).pop() || "";
  if (lastNonEmpty.trim() && !/^[}\])]|^$|^\/\/|^\*\/|^#/.test(lastNonEmpty.trim()) && braces !== 0) {
    issues.push({
      file: filepath,
      line: lines.length,
      issue: "File may end abruptly",
      severity: "medium",
      detail: "File ends with unclosed blocks — output may have been truncated",
    });
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCompletionAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges completion-audit — Verify AI-generated code is complete and not truncated

Usage:
  judges completion-audit [dir]
  judges completion-audit src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: unmatched brackets/braces, truncation markers, TODO stubs, NotImplementedError,
empty function bodies, ellipsis placeholders, "your code here" comments, unused types.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: CompletionIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 15 - medCount * 5);

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
    const badge = score >= 80 ? "✅ COMPLETE" : score >= 50 ? "⚠️  GAPS" : "❌ INCOMPLETE";
    console.log(`\n  Completion Audit: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No completeness issues detected.\n");
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
