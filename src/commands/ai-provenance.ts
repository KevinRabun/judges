/**
 * AI-provenance — detect and annotate which code regions were AI-generated.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProvenanceRegion {
  file: string;
  lineStart: number;
  lineEnd: number;
  confidence: number;
  signals: string[];
  probableSource: string;
}

interface ProvenanceReport {
  totalFiles: number;
  filesWithAiCode: number;
  aiRegions: ProvenanceRegion[];
  aiLinePercentage: number;
  totalLines: number;
  aiLines: number;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".cs", ".rs", ".rb"]);

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

// ─── AI detection signals ──────────────────────────────────────────────────

interface SignalDef {
  regex: RegExp;
  signal: string;
  source: string;
  weight: number;
}

const AI_SIGNALS: SignalDef[] = [
  // Explicit AI markers
  {
    regex:
      /(?:Generated|Created|Written)\s+(?:by|with|using)\s+(?:Copilot|ChatGPT|GPT-4|Claude|Gemini|Cursor|Codewhisperer|AI|LLM)/i,
    signal: "AI attribution comment",
    source: "comment-declared",
    weight: 90,
  },
  {
    regex: /(?:copilot|ai-generated|machine-generated|auto-generated)/i,
    signal: "AI tag/marker",
    source: "metadata-tag",
    weight: 85,
  },
  {
    regex: /@(?:generated|auto-generated|ai-generated)/,
    signal: "Generated annotation",
    source: "annotation",
    weight: 80,
  },

  // Common AI code patterns
  {
    regex: /\/\/\s*(?:TODO|FIXME):\s*(?:implement|add|replace|update)\s+(?:this|here|the)/i,
    signal: "Generic placeholder TODO",
    source: "pattern-heuristic",
    weight: 30,
  },
  {
    regex: /\/\/\s*(?:This|The)\s+(?:function|method|class|module)\s+(?:is|does|handles|provides)/i,
    signal: "Overly explanatory inline comment",
    source: "style-heuristic",
    weight: 25,
  },
  {
    regex: /\/\*\*\s*\n\s*\*\s+(?:This|The)\s+(?:function|method|class)\s+/m,
    signal: "Verbose JSDoc with article start",
    source: "style-heuristic",
    weight: 20,
  },

  // Structural patterns typical of AI
  {
    regex:
      /try\s*\{[^}]*\}\s*catch\s*\(\s*(?:error|err|e)\s*\)\s*\{\s*console\.(?:error|log)\s*\(\s*['"](?:Error|Failed|An error)/i,
    signal: "Template error handling",
    source: "pattern-heuristic",
    weight: 25,
  },
  {
    regex: /if\s*\(!.*\)\s*\{\s*throw\s+new\s+Error\s*\(\s*['"].*is required['"]\s*\)/i,
    signal: "Template validation pattern",
    source: "pattern-heuristic",
    weight: 20,
  },
  { regex: /(?:Example|Usage|How to use):/i, signal: "Example-style comments", source: "style-heuristic", weight: 15 },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string, baseDir: string): ProvenanceRegion[] {
  const regions: ProvenanceRegion[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return regions;
  }

  const lines = content.split("\n");
  const rel = relative(baseDir, filepath);

  // Track signal hits per line
  const lineSignals: Array<{ signals: string[]; source: string; weight: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hits: Array<{ signal: string; source: string; weight: number }> = [];

    for (const sig of AI_SIGNALS) {
      if (sig.regex.test(line)) {
        hits.push({ signal: sig.signal, source: sig.source, weight: sig.weight });
      }
    }

    lineSignals.push({
      signals: hits.map((h) => h.signal),
      source: hits.length > 0 ? hits[0].source : "",
      weight: hits.reduce((sum, h) => sum + h.weight, 0),
    });
  }

  // Merge adjacent high-signal lines into regions
  let regionStart = -1;
  let regionWeight = 0;
  let regionSignals: string[] = [];
  let regionSource = "";

  for (let i = 0; i <= lines.length; i++) {
    const ls = i < lines.length ? lineSignals[i] : { signals: [], source: "", weight: 0 };

    if (ls.weight > 0) {
      if (regionStart === -1) {
        regionStart = i;
        regionWeight = 0;
        regionSignals = [];
        regionSource = ls.source;
      }
      regionWeight += ls.weight;
      for (const s of ls.signals) {
        if (!regionSignals.includes(s)) regionSignals.push(s);
      }
      if (ls.source && !regionSource) regionSource = ls.source;
    } else if (regionStart !== -1) {
      // Gap — check if we should merge (gap of 1-3 lines)
      const lookAhead = lineSignals.slice(i, Math.min(i + 4, lines.length));
      const hasMore = lookAhead.some((la) => la.weight > 0);

      if (!hasMore || i - regionStart > 50) {
        // Close region
        const confidence = Math.min(95, Math.round((regionWeight / Math.max(1, i - regionStart)) * 2));
        if (confidence >= 15) {
          regions.push({
            file: rel,
            lineStart: regionStart + 1,
            lineEnd: i,
            confidence,
            signals: regionSignals,
            probableSource: regionSource || "unknown",
          });
        }
        regionStart = -1;
        regionSignals = [];
        regionSource = "";
      }
    }
  }

  return regions;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAiProvenance(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ai-provenance — Detect and annotate AI-generated code regions

Usage:
  judges ai-provenance [dir]
  judges ai-provenance src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --min-confidence <n>  Minimum confidence % to report (default: 20)
  --format json         JSON output
  --help, -h            Show this help

Identifies AI-generated code regions using: attribution comments,
metadata tags, coding style heuristics, structural patterns, and
template signatures. Outputs provenance annotations for compliance.

Note: All analysis is local — no data is sent externally.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minConfStr = argv.find((_a: string, i: number) => argv[i - 1] === "--min-confidence");
  const minConfidence = minConfStr ? parseInt(minConfStr, 10) : 20;
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        argv.indexOf(a) > 0 &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--min-confidence",
    ) || ".";

  const files = collectFiles(dir);
  const allRegions: ProvenanceRegion[] = [];
  let totalLines = 0;

  for (const f of files) {
    try {
      const content = readFileSync(f, "utf-8");
      totalLines += content.split("\n").length;
    } catch {
      /* skip */
    }
    allRegions.push(...analyzeFile(f, dir));
  }

  const filtered = allRegions.filter((r) => r.confidence >= minConfidence);
  const aiLines = filtered.reduce((sum, r) => sum + (r.lineEnd - r.lineStart + 1), 0);
  const filesWithAi = new Set(filtered.map((r) => r.file)).size;
  const aiPct = totalLines > 0 ? Math.round((aiLines / totalLines) * 1000) / 10 : 0;

  const report: ProvenanceReport = {
    totalFiles: files.length,
    filesWithAiCode: filesWithAi,
    aiRegions: filtered,
    aiLinePercentage: aiPct,
    totalLines,
    aiLines,
  };

  if (format === "json") {
    console.log(JSON.stringify({ ...report, timestamp: new Date().toISOString() }, null, 2));
  } else {
    console.log(`\n  AI Provenance Report\n  ─────────────────────────────`);
    console.log(`    Files scanned:     ${report.totalFiles}`);
    console.log(`    Files with AI code: ${report.filesWithAiCode}`);
    console.log(`    AI-attributed lines: ${report.aiLines}/${report.totalLines} (${report.aiLinePercentage}%)\n`);

    if (filtered.length === 0) {
      console.log("    No AI-generated code regions detected.\n");
      return;
    }

    for (const region of filtered.slice(0, 20)) {
      const confIcon = region.confidence >= 70 ? "🔴" : region.confidence >= 40 ? "🟡" : "🔵";
      console.log(
        `    ${confIcon} ${region.file}:${region.lineStart}-${region.lineEnd} (${region.confidence}% confidence)`,
      );
      console.log(`        Source: ${region.probableSource}`);
      console.log(`        Signals: ${region.signals.join(", ")}`);
    }
    if (filtered.length > 20) console.log(`\n    ... and ${filtered.length - 20} more regions`);
    console.log();
  }
}
