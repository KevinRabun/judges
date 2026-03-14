/**
 * Perf compare — before/after performance comparison of code changes.
 * Compares algorithmic complexity, loop nesting, allocation patterns,
 * and async anti-patterns between two code versions.
 *
 * All analysis local.
 */

import { existsSync, readFileSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PerfMetric {
  name: string;
  before: number;
  after: number;
  delta: number;
  verdict: "improved" | "regressed" | "unchanged";
  severity?: "critical" | "high" | "medium" | "low";
  detail?: string;
}

interface PerfAnalysis {
  loopDepth: number;
  loopCount: number;
  allocations: number;
  asyncAntiPatterns: number;
  recursiveCalls: number;
  regexCount: number;
  stringConcat: number;
  nestedCallbacks: number;
  bigOEstimate: string;
  lineCount: number;
}

// ─── Analysers ──────────────────────────────────────────────────────────────

function analyzePerformance(content: string): PerfAnalysis {
  const lines = content.split("\n");

  // Loop depth
  let maxLoopDepth = 0;
  let currentDepth = 0;
  let loopCount = 0;
  for (const line of lines) {
    if (/\b(?:for|while|do)\s*\(/.test(line) || /\.(?:forEach|map|filter|reduce|flatMap|some|every)\s*\(/.test(line)) {
      currentDepth++;
      loopCount++;
      maxLoopDepth = Math.max(maxLoopDepth, currentDepth);
    }
    // Rough depth tracking by braces
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    if (closes > opens && currentDepth > 0) currentDepth--;
  }

  // Allocations (new, object/array literals in loops)
  let allocations = 0;
  for (const line of lines) {
    if (/\bnew\s+\w+/.test(line)) allocations++;
    if (/(?:new\s+Array|new\s+Object|\[\s*\]|\{\s*\})\s*;?\s*$/.test(line.trim())) allocations++;
  }

  // Async anti-patterns
  let asyncAntiPatterns = 0;
  for (let i = 0; i < lines.length; i++) {
    // await in loop
    if (/\bawait\b/.test(lines[i]) && currentDepth > 0) asyncAntiPatterns++;
    // sequential awaits that could be parallel
    if (/\bawait\b/.test(lines[i]) && i > 0 && /\bawait\b/.test(lines[i - 1])) asyncAntiPatterns++;
  }

  // Recursive calls
  let recursiveCalls = 0;
  const fnNames: string[] = [];
  for (const line of lines) {
    const fnMatch = line.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|function))/);
    if (fnMatch) fnNames.push(fnMatch[1] || fnMatch[2]);
  }
  for (const line of lines) {
    for (const fn of fnNames) {
      if (fn && new RegExp(`\\b${fn}\\s*\\(`).test(line)) {
        const fnDef = lines.find((l) => l.includes(`function ${fn}`) || l.includes(`${fn} =`));
        if (fnDef && fnDef !== line) recursiveCalls++;
      }
    }
  }

  // Regex count (complex regex can be perf bottleneck)
  let regexCount = 0;
  for (const line of lines) {
    if (/new\s+RegExp|\/[^/]+\/[gimsuy]*/.test(line)) regexCount++;
  }

  // String concatenation in loops
  let stringConcat = 0;
  for (const line of lines) {
    if (/\+=\s*["'`]|["'`]\s*\+/.test(line)) stringConcat++;
  }

  // Nested callbacks
  let nestedCallbacks = 0;
  let callbackDepth = 0;
  for (const line of lines) {
    if (/\bcallback\b|function\s*\(|=>\s*{/.test(line)) {
      callbackDepth++;
      if (callbackDepth >= 3) nestedCallbacks++;
    }
    if (/}\s*\)/.test(line) && callbackDepth > 0) callbackDepth--;
  }

  // Big-O estimate
  let bigO = "O(n)";
  if (maxLoopDepth >= 3) bigO = "O(n³+)";
  else if (maxLoopDepth === 2) bigO = "O(n²)";
  else if (recursiveCalls > 0 && maxLoopDepth > 0) bigO = "O(n log n)";
  else if (loopCount === 0) bigO = "O(1)";

  return {
    loopDepth: maxLoopDepth,
    loopCount,
    allocations,
    asyncAntiPatterns,
    recursiveCalls,
    regexCount,
    stringConcat,
    nestedCallbacks,
    bigOEstimate: bigO,
    lineCount: lines.length,
  };
}

function compareAnalyses(before: PerfAnalysis, after: PerfAnalysis): PerfMetric[] {
  const metrics: PerfMetric[] = [];

  function add(name: string, b: number, a: number, higherIsWorse: boolean, severity: PerfMetric["severity"]): void {
    const delta = a - b;
    let verdict: PerfMetric["verdict"] = "unchanged";
    if (delta !== 0) verdict = delta > 0 === higherIsWorse ? "regressed" : "improved";
    metrics.push({
      name,
      before: b,
      after: a,
      delta,
      verdict,
      severity: verdict === "regressed" ? severity : undefined,
    });
  }

  add("Loop nesting depth", before.loopDepth, after.loopDepth, true, "high");
  add("Loop count", before.loopCount, after.loopCount, true, "medium");
  add("Allocations", before.allocations, after.allocations, true, "medium");
  add("Async anti-patterns", before.asyncAntiPatterns, after.asyncAntiPatterns, true, "high");
  add("Recursive calls", before.recursiveCalls, after.recursiveCalls, true, "medium");
  add("Regex operations", before.regexCount, after.regexCount, true, "low");
  add("String concatenations", before.stringConcat, after.stringConcat, true, "low");
  add("Nested callbacks", before.nestedCallbacks, after.nestedCallbacks, true, "medium");
  add("Lines of code", before.lineCount, after.lineCount, true, "low");

  // Big-O change
  const oOrder = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(n³+)"];
  const bIdx = oOrder.indexOf(before.bigOEstimate);
  const aIdx = oOrder.indexOf(after.bigOEstimate);
  metrics.push({
    name: "Algorithmic complexity",
    before: bIdx,
    after: aIdx,
    delta: aIdx - bIdx,
    verdict: aIdx > bIdx ? "regressed" : aIdx < bIdx ? "improved" : "unchanged",
    severity: aIdx > bIdx ? "critical" : undefined,
    detail: `${before.bigOEstimate} → ${after.bigOEstimate}`,
  });

  return metrics;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPerfCompare(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges perf-compare — Before/after performance comparison

Usage:
  judges perf-compare <before-file> <after-file>
  judges perf-compare old.ts new.ts --format json

Options:
  --format json   JSON output
  --help, -h      Show this help

Analyses:
  • Loop nesting depth & count
  • Memory allocations
  • Async anti-patterns (await in loop, sequential awaits)
  • Recursive call patterns
  • Regex operation count
  • String concatenation patterns
  • Callback nesting depth
  • Algorithmic complexity estimate (Big-O)
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const positional = argv.filter((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--"));

  if (positional.length < 2) {
    console.error("  Usage: judges perf-compare <before-file> <after-file>");
    return;
  }

  const [beforeFile, afterFile] = positional;
  if (!existsSync(beforeFile)) {
    console.error(`  File not found: ${beforeFile}`);
    return;
  }
  if (!existsSync(afterFile)) {
    console.error(`  File not found: ${afterFile}`);
    return;
  }

  let beforeContent: string, afterContent: string;
  try {
    beforeContent = readFileSync(beforeFile, "utf-8");
  } catch {
    console.error(`  Cannot read: ${beforeFile}`);
    return;
  }
  try {
    afterContent = readFileSync(afterFile, "utf-8");
  } catch {
    console.error(`  Cannot read: ${afterFile}`);
    return;
  }

  const beforeAnalysis = analyzePerformance(beforeContent);
  const afterAnalysis = analyzePerformance(afterContent);
  const metrics = compareAnalyses(beforeAnalysis, afterAnalysis);

  const regressions = metrics.filter((m) => m.verdict === "regressed");
  const improvements = metrics.filter((m) => m.verdict === "improved");

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          before: { file: beforeFile, analysis: beforeAnalysis },
          after: { file: afterFile, analysis: afterAnalysis },
          metrics,
          summary: {
            regressions: regressions.length,
            improvements: improvements.length,
            unchanged: metrics.filter((m) => m.verdict === "unchanged").length,
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\n  Performance Comparison`);
    console.log(`  Before: ${beforeFile} (${beforeAnalysis.bigOEstimate})`);
    console.log(`  After:  ${afterFile} (${afterAnalysis.bigOEstimate})\n  ──────────────────────────`);

    console.log(`\n    ${"Metric".padEnd(30)} ${"Before".padEnd(8)} ${"After".padEnd(8)} ${"Delta".padEnd(8)} Verdict`);
    console.log(`    ${"─".repeat(70)}`);

    for (const m of metrics) {
      const icon = m.verdict === "improved" ? "✅" : m.verdict === "regressed" ? "❌" : "➖";
      const deltaStr = m.delta > 0 ? `+${m.delta}` : String(m.delta);
      const detail = m.detail ? ` (${m.detail})` : "";
      console.log(
        `    ${m.name.padEnd(30)} ${String(m.before).padEnd(8)} ${String(m.after).padEnd(8)} ${deltaStr.padEnd(8)} ${icon}${detail}`,
      );
    }

    console.log(
      `\n    Summary: ${improvements.length} improved, ${regressions.length} regressed, ${metrics.length - improvements.length - regressions.length} unchanged`,
    );

    if (regressions.length > 0) {
      console.log(`\n    ⚠️  Performance regressions detected:`);
      for (const r of regressions) {
        console.log(
          `      • ${r.name}: ${r.before} → ${r.after}${r.severity ? ` [${r.severity}]` : ""}${r.detail ? ` (${r.detail})` : ""}`,
        );
      }
    }
    console.log("");
  }
}
