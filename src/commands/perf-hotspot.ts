/**
 * Performance hotspot detection — scans code for common
 * performance anti-patterns using pattern-based analysis.
 *
 * All data stored locally.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PerfPattern {
  id: string;
  name: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  regex: RegExp;
  extensions: string[];
  recommendation: string;
}

interface PerfHotspot {
  file: string;
  line: number;
  patternId: string;
  patternName: string;
  severity: string;
  snippet: string;
  recommendation: string;
}

interface PerfReport {
  hotspots: PerfHotspot[];
  scannedFiles: number;
  patternsChecked: number;
  timestamp: string;
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const PERF_PATTERNS: PerfPattern[] = [
  {
    id: "n-plus-one",
    name: "N+1 Query Pattern",
    severity: "critical",
    description: "Database query inside a loop",
    regex: /for\s*\(.*\)\s*\{[^}]*(?:\.query|\.execute|\.find|\.fetch|\.select|await\s+db\.|await\s+prisma\.)/s,
    extensions: [".ts", ".js", ".py", ".java", ".go", ".rb"],
    recommendation: "Batch queries outside the loop or use eager loading / JOIN",
  },
  {
    id: "unbounded-collection",
    name: "Unbounded Collection Fetch",
    severity: "high",
    description: "Fetching all records without limit/pagination",
    regex: /\.findAll\(\s*\)|\.find\(\s*\{\s*\}\s*\)|SELECT\s+\*\s+FROM\s+\w+\s*(?:WHERE|;|\)|$)/i,
    extensions: [".ts", ".js", ".py", ".java", ".go", ".rb"],
    recommendation: "Add LIMIT/pagination or use cursor-based fetching",
  },
  {
    id: "sync-io-hot-path",
    name: "Synchronous I/O in Hot Path",
    severity: "high",
    description: "Synchronous file/network I/O that could block event loop",
    regex: /readFileSync|writeFileSync|execSync|spawnSync/,
    extensions: [".ts", ".js"],
    recommendation: "Use async variants (readFile, writeFile, exec) in request handlers",
  },
  {
    id: "string-concat-loop",
    name: "String Concatenation in Loop",
    severity: "medium",
    description: "String concatenation inside a loop (O(n²) in some languages)",
    regex: /for\s*\(.*\)\s*\{[^}]*\+=\s*["'`]|for\s*\(.*\)\s*\{[^}]*\+=\s*\w+/s,
    extensions: [".ts", ".js", ".py", ".java", ".go", ".cs"],
    recommendation: "Use array.join(), StringBuilder, or strings.Builder",
  },
  {
    id: "missing-index-hint",
    name: "Missing Index Hint",
    severity: "medium",
    description: "Query with WHERE clause on non-obvious columns",
    regex: /WHERE\s+\w+\.\w+\s*(?:=|LIKE|IN|>|<)\s*/i,
    extensions: [".sql", ".ts", ".js", ".py", ".java"],
    recommendation: "Ensure queried columns have appropriate database indexes",
  },
  {
    id: "excessive-json-parse",
    name: "Repeated JSON Parse/Stringify",
    severity: "medium",
    description: "JSON.parse/stringify inside loops or frequently called functions",
    regex: /for\s*\(.*\)\s*\{[^}]*JSON\.(?:parse|stringify)/s,
    extensions: [".ts", ".js"],
    recommendation: "Parse once and reuse the object; consider streaming parsers for large data",
  },
  {
    id: "regex-in-loop",
    name: "Regex Compilation in Loop",
    severity: "low",
    description: "Creating new RegExp objects inside loops",
    regex: /for\s*\(.*\)\s*\{[^}]*new\s+RegExp\(/s,
    extensions: [".ts", ".js", ".py", ".java"],
    recommendation: "Compile regex once outside the loop and reuse",
  },
  {
    id: "large-object-spread",
    name: "Large Object Spread in Loop",
    severity: "medium",
    description: "Object spread operator inside loops creates many copies",
    regex: /for\s*\(.*\)\s*\{[^}]*\.\.\.\w+/s,
    extensions: [".ts", ".js"],
    recommendation: "Mutate directly or use Object.assign for better performance",
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────────

function scanFile(filePath: string, patterns: PerfPattern[]): PerfHotspot[] {
  const ext = extname(filePath);
  const applicable = patterns.filter((p) => p.extensions.includes(ext));
  if (applicable.length === 0) return [];

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const hotspots: PerfHotspot[] = [];

  for (const pattern of applicable) {
    const match = pattern.regex.exec(content);
    if (match) {
      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split("\n").length;
      hotspots.push({
        file: filePath,
        line: lineNum,
        patternId: pattern.id,
        patternName: pattern.name,
        severity: pattern.severity,
        snippet: lines[lineNum - 1]?.trim() || "",
        recommendation: pattern.recommendation,
      });
    }
  }

  return hotspots;
}

function collectFiles(dir: string, exts: string[], maxFiles: number): string[] {
  const result: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

  function walk(d: string): void {
    if (result.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(d, { withFileTypes: true }).map((e) => (typeof e === "string" ? e : e.name));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (result.length >= maxFiles) return;
      const full = join(d, entry);
      if (skipDirs.has(entry)) continue;
      try {
        const stat = readFileSync(full, "utf-8"); // test readable
        void stat;
        if (exts.includes(extname(entry))) {
          result.push(full);
        }
      } catch {
        // might be a directory
        try {
          const sub = readdirSync(full);
          void sub;
          walk(full);
        } catch {
          // skip
        }
      }
    }
  }

  walk(dir);
  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-perf-hotspots";

export function runPerfHotspot(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges perf-hotspot — Performance hotspot detection

Usage:
  judges perf-hotspot [dir]
  judges perf-hotspot src/ --severity critical,high
  judges perf-hotspot --patterns
  judges perf-hotspot --history

Options:
  --severity <levels>   Filter by severity (comma-separated)
  --patterns            List all performance patterns
  --history             Show scan history
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List patterns
  if (argv.includes("--patterns")) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          PERF_PATTERNS.map(({ regex: _r, ...rest }) => rest),
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Performance Anti-Patterns (${PERF_PATTERNS.length})\n  ──────────────────────────`);
      for (const p of PERF_PATTERNS) {
        console.log(`    [${p.severity.toUpperCase().padEnd(8)}] ${p.id.padEnd(25)} ${p.name}`);
      }
      console.log("");
    }
    return;
  }

  // History
  if (argv.includes("--history")) {
    const histPath = join(STORE, "scan-history.json");
    const history = existsSync(histPath) ? JSON.parse(readFileSync(histPath, "utf-8")) : [];
    if (format === "json") {
      console.log(JSON.stringify(history, null, 2));
    } else {
      if (history.length === 0) {
        console.log("  No scan history.");
        return;
      }
      console.log(`\n  Scan History\n  ──────────────────────────`);
      for (const h of history.slice(-10)) {
        console.log(`    ${h.timestamp}  ${h.scannedFiles} files  ${h.hotspots} hotspots`);
      }
      console.log("");
    }
    return;
  }

  // Scan
  const scanDir = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  const sevFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");
  const allowedSev = sevFilter ? sevFilter.split(",") : null;

  const allExts = [...new Set(PERF_PATTERNS.flatMap((p) => p.extensions))];
  const files = collectFiles(scanDir, allExts, 500);
  let hotspots: PerfHotspot[] = [];

  for (const file of files) {
    hotspots.push(...scanFile(file, PERF_PATTERNS));
  }

  if (allowedSev) {
    hotspots = hotspots.filter((h) => allowedSev.includes(h.severity));
  }

  const report: PerfReport = {
    hotspots,
    scannedFiles: files.length,
    patternsChecked: PERF_PATTERNS.length,
    timestamp: new Date().toISOString(),
  };

  // Save history
  if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
  const histPath = join(STORE, "scan-history.json");
  const history = existsSync(histPath) ? JSON.parse(readFileSync(histPath, "utf-8")) : [];
  history.push({ timestamp: report.timestamp, scannedFiles: report.scannedFiles, hotspots: hotspots.length });
  writeFileSync(histPath, JSON.stringify(history, null, 2));

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Performance Hotspot Scan`);
    console.log(`  Scanned: ${report.scannedFiles} files  Patterns: ${report.patternsChecked}`);
    console.log(`  Found: ${hotspots.length} hotspots\n  ──────────────────────────`);

    if (hotspots.length === 0) {
      console.log(`    ✅ No performance hotspots detected\n`);
      return;
    }

    const grouped = new Map<string, PerfHotspot[]>();
    for (const h of hotspots) {
      const key = h.severity;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(h);
    }

    for (const sev of ["critical", "high", "medium", "low"]) {
      const items = grouped.get(sev);
      if (!items) continue;
      console.log(`\n    ${sev.toUpperCase()} (${items.length})`);
      for (const h of items) {
        console.log(`      ${h.file}:${h.line} — ${h.patternName}`);
        console.log(`        ${h.snippet}`);
        console.log(`        → ${h.recommendation}`);
      }
    }
    console.log("");
  }
}
