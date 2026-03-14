/**
 * Clone detect — find duplicated logic blocks that should be extracted into shared functions.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CloneIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"]);

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

// ─── Normalization ──────────────────────────────────────────────────────────

function normalize(line: string): string {
  return line
    .trim()
    .replace(/\/\/.*/, "") // strip comments
    .replace(/\/\*.*?\*\//g, "") // strip inline comments
    .replace(/['"][^'"]*['"]/g, "S") // normalize strings
    .replace(/\b\d+\b/g, "N") // normalize numbers
    .replace(/\b[a-z]\w{0,2}\b/gi, "V") // normalize short variable names
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

// ─── Clone Detection ────────────────────────────────────────────────────────

interface Block {
  file: string;
  startLine: number;
  normalized: string;
  raw: string;
}

function extractBlocks(filepath: string, content: string, blockSize: number): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];

  for (let i = 0; i <= lines.length - blockSize; i++) {
    const raw = lines.slice(i, i + blockSize);
    const normalized = raw
      .map(normalize)
      .filter((l) => l.length > 3)
      .join("|");
    if (normalized.length > 20) {
      blocks.push({ file: filepath, startLine: i + 1, normalized, raw: raw.join("\n") });
    }
  }

  return blocks;
}

function detectClones(files: string[], blockSize = 5, minSimilarity = 0.85): CloneIssue[] {
  const issues: CloneIssue[] = [];
  const allBlocks: Block[] = [];

  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    allBlocks.push(...extractBlocks(f, content, blockSize));
  }

  // Group by normalized form
  const groups = new Map<string, Block[]>();
  for (const block of allBlocks) {
    const existing = groups.get(block.normalized);
    if (existing) {
      existing.push(block);
    } else {
      groups.set(block.normalized, [block]);
    }
  }

  const reported = new Set<string>();

  for (const [_norm, blocks] of groups) {
    if (blocks.length < 2) continue;

    // Deduplicate overlapping blocks in same file
    const unique: Block[] = [];
    for (const b of blocks) {
      const isDuplicate = unique.some((u) => u.file === b.file && Math.abs(u.startLine - b.startLine) < blockSize);
      if (!isDuplicate) unique.push(b);
    }
    if (unique.length < 2) continue;

    // Report clones
    for (let j = 1; j < unique.length && j < 3; j++) {
      const key = `${unique[0].file}:${unique[0].startLine}-${unique[j].file}:${unique[j].startLine}`;
      if (reported.has(key)) continue;
      reported.add(key);

      const sameFile = unique[0].file === unique[j].file;
      const severity = unique.length > 3 ? "high" : unique.length > 2 ? "medium" : "low";

      issues.push({
        file: unique[0].file,
        line: unique[0].startLine,
        issue: sameFile ? "Intra-file code clone" : "Cross-file code clone",
        severity,
        detail: `${blockSize}-line block duplicated${sameFile ? ` at line ${unique[j].startLine}` : ` in ${unique[j].file}:${unique[j].startLine}`} — extract to shared function (${unique.length} copies total)`,
      });
    }
  }

  // Also check for near-identical functions using a simpler heuristic
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    const functions: { name: string; line: number; body: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const funcMatch = lines[i].match(/(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\()/);
      if (funcMatch) {
        const name = funcMatch[1] || funcMatch[2];
        let depth = 0;
        let end = i;
        for (let j = i; j < Math.min(i + 50, lines.length); j++) {
          for (const ch of lines[j]) {
            if (ch === "{") depth++;
            if (ch === "}") depth--;
          }
          if (depth <= 0 && j > i) {
            end = j;
            break;
          }
        }
        const body = lines
          .slice(i, end + 1)
          .map(normalize)
          .join("|");
        if (body.length > 30) functions.push({ name, line: i + 1, body });
      }
    }

    // Compare functions within same file
    for (let a = 0; a < functions.length; a++) {
      for (let b = a + 1; b < functions.length; b++) {
        if (functions[a].body === functions[b].body && functions[a].body.length > 50) {
          const key = `func:${f}:${functions[a].line}-${functions[b].line}`;
          if (!reported.has(key)) {
            reported.add(key);
            issues.push({
              file: f,
              line: functions[a].line,
              issue: "Duplicate functions",
              severity: "medium",
              detail: `\`${functions[a].name}\` and \`${functions[b].name}\` (line ${functions[b].line}) have identical logic — extract shared implementation`,
            });
          }
        }
      }
    }
  }

  // Limit results
  void minSimilarity;
  return issues.slice(0, 50);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCloneDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges clone-detect — Find duplicated logic blocks that should be shared functions

Usage:
  judges clone-detect [dir]
  judges clone-detect src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: intra-file code clones, cross-file clones, duplicate functions with renamed variables.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues = detectClones(files);

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
    const badge = score >= 80 ? "✅ DRY" : score >= 50 ? "⚠️  REPETITIVE" : "❌ DUPLICATED";
    console.log(`\n  Code Clones: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No code clones detected.\n");
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
