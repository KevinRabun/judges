/**
 * Resource cleanup — validate that allocated resources are properly
 * freed: file handles, DB connections, timers, event listeners,
 * streams with try-finally or equivalent cleanup mechanisms.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ResourceIssue {
  file: string;
  line: number;
  kind: string;
  resource: string;
  message: string;
  severity: "high" | "medium" | "low";
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".java", ".cs", ".go"]);

function collectFiles(dir: string, max = 500): string[] {
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

// ─── Resource Patterns ──────────────────────────────────────────────────────

interface ResourcePattern {
  name: string;
  openRegex: RegExp;
  closeRegex: RegExp;
  guardRegex: RegExp;
  severity: "high" | "medium" | "low";
}

const RESOURCE_PATTERNS: ResourcePattern[] = [
  {
    name: "file-handle",
    openRegex: /\b(openSync|createReadStream|createWriteStream|fs\.open)\s*\(/,
    closeRegex: /\b(closeSync|\.close\(|\.destroy\(|\.end\()/,
    guardRegex: /\b(finally|using|dispose|\.close\(|\.destroy\()/,
    severity: "high",
  },
  {
    name: "db-connection",
    openRegex: /\b(createConnection|createPool|\.connect\(|new\s+Client\(|getConnection\()/,
    closeRegex: /\b(\.end\(|\.close\(|\.release\(|\.disconnect\(|\.destroy\()/,
    guardRegex: /\b(finally|\.release\(|\.end\(|pool\.end|disconnect)/,
    severity: "high",
  },
  {
    name: "timer",
    openRegex: /\b(setInterval|setTimeout)\s*\(/,
    closeRegex: /\b(clearInterval|clearTimeout)\s*\(/,
    guardRegex: /\b(clearInterval|clearTimeout|finally)/,
    severity: "medium",
  },
  {
    name: "event-listener",
    openRegex: /\b(addEventListener|\.on\(|\.addListener\()/,
    closeRegex: /\b(removeEventListener|\.off\(|\.removeListener\(|\.removeAllListeners\()/,
    guardRegex: /\b(removeEventListener|\.off\(|\.removeListener\(|dispose|finally)/,
    severity: "medium",
  },
  {
    name: "stream",
    openRegex: /\b(createReadStream|createWriteStream|new\s+Readable|new\s+Writable|pipeline\()/,
    closeRegex: /\b(\.end\(|\.destroy\(|\.close\(|pipeline\()/,
    guardRegex: /\b(finally|\.destroy\(|\.end\(|pipeline|using)/,
    severity: "high",
  },
  {
    name: "child-process",
    openRegex: /\b(spawn|exec|execFile|fork)\s*\(/,
    closeRegex: /\b(\.kill\(|\.disconnect\()/,
    guardRegex: /\b(\.kill\(|finally|\.on\(\s*['"]exit)/,
    severity: "medium",
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filePath: string): ResourceIssue[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const issues: ResourceIssue[] = [];

  for (const pattern of RESOURCE_PATTERNS) {
    // Find all opens
    for (let i = 0; i < lines.length; i++) {
      if (pattern.openRegex.test(lines[i])) {
        // Check if a corresponding close or guard exists in the surrounding function
        const functionBlock = extractFunctionBlock(lines, i);
        const hasClose = pattern.closeRegex.test(functionBlock);
        const hasGuard = pattern.guardRegex.test(functionBlock);

        if (!hasClose) {
          issues.push({
            file: filePath,
            line: i + 1,
            kind: `${pattern.name}-no-close`,
            resource: pattern.name,
            message: `${pattern.name} opened but no corresponding close/cleanup found in surrounding scope`,
            severity: pattern.severity,
          });
        } else if (!hasGuard) {
          issues.push({
            file: filePath,
            line: i + 1,
            kind: `${pattern.name}-no-guard`,
            resource: pattern.name,
            message: `${pattern.name} is closed but not in a finally/dispose block — may leak on exception`,
            severity: "low",
          });
        }
      }
    }
  }

  // Detect try blocks without finally when resources are opened inside
  const tryRegex = /\btry\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = tryRegex.exec(content)) !== null) {
    const pos = match.index;
    const lineNum = content.substring(0, pos).split("\n").length;
    const remaining = content.substring(pos);

    // Check if this try block has a finally
    const hasFinally = /\bfinally\s*\{/.test(remaining.substring(0, 500));
    if (!hasFinally) {
      // Check if resource operations exist inside the try
      const tryBlock = remaining.substring(0, 500);
      const hasResourceOp = RESOURCE_PATTERNS.some((p) => p.openRegex.test(tryBlock));
      if (hasResourceOp) {
        issues.push({
          file: filePath,
          line: lineNum,
          kind: "try-without-finally",
          resource: "mixed",
          message: "try block contains resource operations but no finally block for cleanup",
          severity: "medium",
        });
      }
    }
  }

  return issues;
}

function extractFunctionBlock(lines: string[], startLine: number): string {
  // Walk backwards to find function/method boundary, then forward to end
  let start = Math.max(0, startLine - 30);
  const end = Math.min(lines.length, startLine + 50);
  for (let i = startLine; i >= Math.max(0, startLine - 30); i--) {
    if (/\b(function|async\s+function|=>\s*\{|class\s|constructor|ngOnInit|componentDidMount)/.test(lines[i])) {
      start = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runResourceCleanup(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges resource-cleanup — Validate resource cleanup patterns

Usage:
  judges resource-cleanup [dir]
  judges resource-cleanup src/ --severity high
  judges resource-cleanup --format json

Options:
  [dir]                 Directory to scan (default: .)
  --severity <level>    Filter by minimum severity (high|medium|low)
  --format json         JSON output
  --help, -h            Show this help

Resources checked:
  • File handles (open/close)
  • Database connections (connect/end)
  • Timers (setInterval/clearInterval)
  • Event listeners (on/off)
  • Streams (createReadStream/destroy)
  • Child processes (spawn/kill)
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const severityFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "low";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const minSev = severityOrder[severityFilter] || 1;

  const files = collectFiles(dir);
  const allIssues: ResourceIssue[] = [];
  for (const f of files) {
    const issues = analyzeFile(f);
    allIssues.push(...issues.filter((x) => severityOrder[x.severity] >= minSev));
  }

  allIssues.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  if (format === "json") {
    console.log(
      JSON.stringify({ issues: allIssues, filesScanned: files.length, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    console.log(
      `\n  Resource Cleanup — ${files.length} files scanned, ${allIssues.length} issue(s)\n  ──────────────────────────`,
    );

    if (allIssues.length === 0) {
      console.log("  ✅ No resource cleanup issues detected");
    } else {
      const byResource = new Map<string, number>();
      for (const issue of allIssues) {
        byResource.set(issue.resource, (byResource.get(issue.resource) || 0) + 1);
      }

      console.log("\n  By resource type:");
      for (const [res, count] of byResource) {
        console.log(`    ${res}: ${count} issue(s)`);
      }

      console.log("\n  Details:");
      for (const issue of allIssues.slice(0, 50)) {
        const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "⚪";
        console.log(`    ${icon} [${issue.severity}] ${issue.file}:${issue.line}`);
        console.log(`        ${issue.message}`);
      }

      if (allIssues.length > 50) {
        console.log(`\n    ... and ${allIssues.length - 50} more issue(s)`);
      }
    }
    console.log("");
  }
}
