/**
 * Cross-PR pattern regression — track flagged patterns and alert
 * when they recur in new code. Prevents AI from reintroducing
 * known bugs.
 *
 * All data stored locally in `.judges-pr-patterns/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PatternSignature {
  id: string;
  pattern: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  language: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

interface RegressionHit {
  file: string;
  line: number;
  patternId: string;
  patternDescription: string;
  severity: string;
  matchedText: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-pr-patterns";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadPatterns(): PatternSignature[] {
  const file = join(DATA_DIR, "patterns.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function savePatterns(patterns: PatternSignature[]): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, "patterns.json"), JSON.stringify(patterns, null, 2));
}

// ─── Built-in patterns ─────────────────────────────────────────────────────

const BUILTIN_PATTERNS: PatternSignature[] = [
  {
    id: "bp-sql-concat",
    pattern: "\\$\\{.*\\}.*(?:SELECT|INSERT|UPDATE|DELETE)",
    description: "SQL string interpolation",
    severity: "critical",
    language: "any",
    occurrences: 0,
    firstSeen: "",
    lastSeen: "",
  },
  {
    id: "bp-eval",
    pattern: "\\beval\\s*\\(",
    description: "eval() usage",
    severity: "critical",
    language: "any",
    occurrences: 0,
    firstSeen: "",
    lastSeen: "",
  },
  {
    id: "bp-innerhtml",
    pattern: "\\.innerHTML\\s*=",
    description: "Direct innerHTML assignment",
    severity: "high",
    language: "javascript",
    occurrences: 0,
    firstSeen: "",
    lastSeen: "",
  },
  {
    id: "bp-empty-catch",
    pattern: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}",
    description: "Empty catch block",
    severity: "medium",
    language: "any",
    occurrences: 0,
    firstSeen: "",
    lastSeen: "",
  },
  {
    id: "bp-hardcoded-secret",
    pattern: "(?:password|secret|api.?key|token)\\s*[:=]\\s*[\"'][^\"']{8,}",
    description: "Hardcoded secret",
    severity: "critical",
    language: "any",
    occurrences: 0,
    firstSeen: "",
    lastSeen: "",
  },
  {
    id: "bp-debug-log",
    pattern: "console\\.(?:log|debug)\\(",
    description: "Debug logging in production",
    severity: "low",
    language: "javascript",
    occurrences: 0,
    firstSeen: "",
    lastSeen: "",
  },
];

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

function scanForRegressions(files: string[], patterns: PatternSignature[], baseDir: string): RegressionHit[] {
  const hits: RegressionHit[] = [];

  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    const rel = relative(baseDir, f) || f;

    for (const pat of patterns) {
      try {
        const re = new RegExp(pat.pattern, "gi");
        for (let i = 0; i < lines.length; i++) {
          const m = re.exec(lines[i]);
          if (m) {
            hits.push({
              file: rel,
              line: i + 1,
              patternId: pat.id,
              patternDescription: pat.description,
              severity: pat.severity,
              matchedText: m[0].slice(0, 80),
            });
          }
          re.lastIndex = 0;
        }
      } catch {
        /* invalid regex, skip */
      }
    }
  }

  return hits;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCrossPrRegression(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges cross-pr-regression — Detect recurring problem patterns

Usage:
  judges cross-pr-regression <dir>
  judges cross-pr-regression src/ --init
  judges cross-pr-regression src/ --add --pattern "TODO:" --desc "Unfinished TODO" --severity medium

Options:
  --init                Initialize with built-in patterns
  --add                 Add a custom pattern
  --pattern <regex>     Regex pattern to detect
  --desc <text>         Pattern description
  --severity <level>    critical, high, medium, low
  --lang <language>     Language filter (default: any)
  --list                List tracked patterns
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isInit = argv.includes("--init");
  const isAdd = argv.includes("--add");
  const isList = argv.includes("--list");
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";

  if (isInit) {
    const patterns = loadPatterns();
    let added = 0;
    for (const bp of BUILTIN_PATTERNS) {
      if (!patterns.some((p) => p.id === bp.id)) {
        patterns.push({ ...bp, firstSeen: new Date().toISOString() });
        added++;
      }
    }
    savePatterns(patterns);
    console.log(`  ✅ Initialized with ${added} built-in patterns (${patterns.length} total)`);
    return;
  }

  if (isAdd) {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern") || "";
    const desc = argv.find((_a: string, i: number) => argv[i - 1] === "--desc") || "";
    const severity = (argv.find((_a: string, i: number) => argv[i - 1] === "--severity") ||
      "medium") as PatternSignature["severity"];
    const lang = argv.find((_a: string, i: number) => argv[i - 1] === "--lang") || "any";

    if (!pattern || !desc) {
      console.error("  --pattern and --desc are required");
      return;
    }

    const patterns = loadPatterns();
    patterns.push({
      id: `custom-${Date.now()}`,
      pattern,
      description: desc,
      severity,
      language: lang,
      occurrences: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: "",
    });
    savePatterns(patterns);
    console.log(`  ✅ Added pattern: ${desc}`);
    return;
  }

  if (isList) {
    const patterns = loadPatterns();
    if (format === "json") {
      console.log(JSON.stringify(patterns, null, 2));
    } else {
      console.log(`\n  Tracked Patterns — ${patterns.length}\n  ──────────────────────────`);
      for (const p of patterns) {
        const sev =
          p.severity === "critical" ? "🔴" : p.severity === "high" ? "🟠" : p.severity === "medium" ? "🟡" : "⚪";
        console.log(`    ${sev} [${p.id}] ${p.description} (${p.occurrences} hits)`);
      }
      console.log("");
    }
    return;
  }

  // Scan
  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  const patterns = loadPatterns();
  if (patterns.length === 0) {
    console.log("  No patterns tracked. Use --init or --add to add patterns.");
    return;
  }

  let files: string[];
  try {
    readdirSync(target);
    files = collectFiles(target);
  } catch {
    files = [target];
  }

  const hits = scanForRegressions(files, patterns, target);

  // Update occurrence counts
  for (const hit of hits) {
    const pat = patterns.find((p) => p.id === hit.patternId);
    if (pat) {
      pat.occurrences++;
      pat.lastSeen = new Date().toISOString();
    }
  }
  savePatterns(patterns);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { hits, scannedFiles: files.length, patterns: patterns.length, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `\n  Cross-PR Pattern Regression — ${files.length} files, ${patterns.length} patterns\n  ──────────────────────────`,
    );

    if (hits.length === 0) {
      console.log(`    ✅ No pattern regressions detected\n`);
      return;
    }

    console.log(`    ⚠ ${hits.length} regression(s) found:\n`);
    const byFile = new Map<string, RegressionHit[]>();
    for (const h of hits) {
      const list = byFile.get(h.file) || [];
      list.push(h);
      byFile.set(h.file, list);
    }

    for (const [file, fileHits] of byFile) {
      console.log(`    📄 ${file}`);
      for (const h of fileHits) {
        const sev =
          h.severity === "critical" ? "🔴" : h.severity === "high" ? "🟠" : h.severity === "medium" ? "🟡" : "⚪";
        console.log(`        ${sev} L${h.line}: ${h.patternDescription} — "${h.matchedText}"`);
      }
    }
    console.log("");
  }
}
