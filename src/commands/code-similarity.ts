/**
 * Code similarity — compare code against internal implementations
 * to detect when AI generates near-identical copies of known
 * problematic patterns or unsafe implementations.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimilarityPair {
  fileA: string;
  fileB: string;
  similarity: number;
  sharedLines: number;
  totalLines: number;
  sharedBlocks: string[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function normalizeLines(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith("//") &&
        !l.startsWith("*") &&
        !l.startsWith("/*") &&
        l !== "{" &&
        l !== "}" &&
        l !== "",
    );
}

function computeSimilarity(
  linesA: string[],
  linesB: string[],
): { similarity: number; sharedLines: number; sharedBlocks: string[] } {
  const setA = new Set(linesA);
  const setB = new Set(linesB);

  let shared = 0;
  const sharedBlocks: string[] = [];

  for (const line of setA) {
    if (setB.has(line) && line.length > 10) {
      shared++;
      if (sharedBlocks.length < 5) sharedBlocks.push(line.slice(0, 80));
    }
  }

  const total = Math.max(setA.size, setB.size);
  const similarity = total > 0 ? Math.round((shared / total) * 100) : 0;

  return { similarity, sharedLines: shared, sharedBlocks };
}

// n-gram structural similarity
function computeStructuralSimilarity(linesA: string[], linesB: string[], n: number = 3): number {
  if (linesA.length < n || linesB.length < n) return 0;

  const ngramsA = new Set<string>();
  for (let i = 0; i <= linesA.length - n; i++) {
    ngramsA.add(linesA.slice(i, i + n).join("\n"));
  }

  const ngramsB = new Set<string>();
  for (let i = 0; i <= linesB.length - n; i++) {
    ngramsB.add(linesB.slice(i, i + n).join("\n"));
  }

  let overlap = 0;
  for (const ng of ngramsA) {
    if (ngramsB.has(ng)) overlap++;
  }

  const total = Math.max(ngramsA.size, ngramsB.size);
  return total > 0 ? Math.round((overlap / total) * 100) : 0;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const EXTS = new Set([".ts", ".js", ".py", ".java", ".cs", ".go", ".rb", ".php", ".rs"]);

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (EXTS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCodeSimilarity(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges code-similarity — Detect similar/duplicate code across files

Usage:
  judges code-similarity <dir>
  judges code-similarity src/ --threshold 60
  judges code-similarity --compare fileA.ts fileB.ts

Options:
  --threshold <n>      Minimum similarity % to report (default: 50)
  --compare <a> <b>    Compare two specific files
  --max-pairs <n>      Maximum pairs to report (default: 20)
  --format json        JSON output
  --help, -h           Show this help

Algorithm:
  • Line-level deduplication (normalized, comments stripped)
  • N-gram structural similarity (3-line blocks)
  • Combined score with shared block identification
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const threshold = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--threshold") || "50");
  const maxPairs = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--max-pairs") || "20");
  const isCompare = argv.includes("--compare");

  if (isCompare) {
    const compareIdx = argv.indexOf("--compare");
    const fileA = argv[compareIdx + 1];
    const fileB = argv[compareIdx + 2];
    if (!fileA || !fileB) {
      console.error("  --compare requires two file paths");
      return;
    }
    if (!existsSync(fileA) || !existsSync(fileB)) {
      console.error("  One or both files not found");
      return;
    }

    const linesA = normalizeLines(readFileSync(fileA, "utf-8"));
    const linesB = normalizeLines(readFileSync(fileB, "utf-8"));
    const { similarity, sharedLines, sharedBlocks } = computeSimilarity(linesA, linesB);
    const structural = computeStructuralSimilarity(linesA, linesB);
    const combined = Math.round((similarity + structural) / 2);

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            fileA,
            fileB,
            lineSimilarity: similarity,
            structuralSimilarity: structural,
            combined,
            sharedLines,
            sharedBlocks,
          },
          null,
          2,
        ),
      );
    } else {
      const icon = combined >= 80 ? "🔴" : combined >= 50 ? "🟡" : "🟢";
      console.log(`\n    ${icon} Similarity: ${combined}%`);
      console.log(`        Line-level: ${similarity}% | Structural: ${structural}%`);
      console.log(`        Shared lines: ${sharedLines} / ${Math.max(linesA.length, linesB.length)}`);
      if (sharedBlocks.length > 0) {
        console.log(`        Shared blocks:`);
        for (const b of sharedBlocks) console.log(`          ${b}`);
      }
      console.log("");
    }
    return;
  }

  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  const files = collectFiles(target);
  if (files.length < 2) {
    console.log("  Need at least 2 files to compare.");
    return;
  }

  // Pre-compute normalized lines
  const fileLines = new Map<string, string[]>();
  for (const f of files) {
    try {
      fileLines.set(f, normalizeLines(readFileSync(f, "utf-8")));
    } catch {
      /* skip */
    }
  }

  const pairs: SimilarityPair[] = [];
  const fileList = Array.from(fileLines.keys());

  // Compare pairs (limit to avoid O(n^2) on large codebases)
  const maxFiles = Math.min(fileList.length, 100);
  for (let i = 0; i < maxFiles; i++) {
    for (let j = i + 1; j < maxFiles; j++) {
      const lA = fileLines.get(fileList[i]);
      const lB = fileLines.get(fileList[j]);
      if (!lA || !lB || lA.length < 5 || lB.length < 5) continue;

      const { similarity, sharedLines, sharedBlocks } = computeSimilarity(lA, lB);
      if (similarity >= threshold) {
        const structural = computeStructuralSimilarity(lA, lB);
        const combined = Math.round((similarity + structural) / 2);
        if (combined >= threshold) {
          pairs.push({
            fileA: relative(target, fileList[i]) || fileList[i],
            fileB: relative(target, fileList[j]) || fileList[j],
            similarity: combined,
            sharedLines,
            totalLines: Math.max(lA.length, lB.length),
            sharedBlocks,
          });
        }
      }
    }
  }

  pairs.sort((a, b) => b.similarity - a.similarity);
  const shown = pairs.slice(0, maxPairs);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { pairs: shown, scannedFiles: files.length, totalPairs: pairs.length, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `\n  Code Similarity — ${files.length} files, ${pairs.length} pairs above ${threshold}%\n  ──────────────────────────`,
    );

    if (shown.length === 0) {
      console.log(`    ✅ No high-similarity pairs found\n`);
      return;
    }

    for (const p of shown) {
      const icon = p.similarity >= 80 ? "🔴" : p.similarity >= 60 ? "🟠" : "🟡";
      console.log(`\n    ${icon} ${p.similarity}% — ${p.fileA} ↔ ${p.fileB}`);
      console.log(`        Shared: ${p.sharedLines}/${p.totalLines} lines`);
      if (p.sharedBlocks.length > 0) {
        console.log(`        Examples: ${p.sharedBlocks.slice(0, 2).join(" | ")}`);
      }
    }

    if (pairs.length > maxPairs) console.log(`\n    ... and ${pairs.length - maxPairs} more pairs`);
    console.log("");
  }
}
