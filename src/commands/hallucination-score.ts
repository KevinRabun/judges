/**
 * Hallucination score — assign a hallucination risk score (0–100)
 * to AI-generated code based on detected patterns: generic naming,
 * suspicious imports, implausible logic, unverified API usage.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HallucinationSignal {
  id: string;
  description: string;
  weight: number;
  line?: number;
  evidence?: string;
}

interface FileScore {
  file: string;
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  signals: HallucinationSignal[];
}

// ─── Detectors ──────────────────────────────────────────────────────────────

function detectHallucinationSignals(content: string, lines: string[]): HallucinationSignal[] {
  const signals: HallucinationSignal[] = [];

  // 1. Non-existent or suspicious imports
  const importLines = lines
    .map((l, i) => ({ line: i + 1, text: l }))
    .filter((l) => /\bimport\s|require\s*\(/.test(l.text));
  for (const imp of importLines) {
    // Suspicious package names (very generic or implausible)
    if (/["'](?:utils|helpers|common|shared|lib|core|base)["']/.test(imp.text) && !/from\s*["']\./.test(imp.text)) {
      signals.push({
        id: "suspicious-import",
        description: "Generic import name — may reference non-existent package",
        weight: 15,
        line: imp.line,
        evidence: imp.text.trim(),
      });
    }
    // Version-specific imports (hallucinated API paths)
    if (/["'][^"']+\/v\d+\/[^"']+["']/.test(imp.text)) {
      signals.push({
        id: "versioned-import-path",
        description: "Version-specific import path — verify API exists",
        weight: 10,
        line: imp.line,
        evidence: imp.text.trim(),
      });
    }
  }

  // 2. Generic/placeholder variable names
  let genericNames = 0;
  for (let i = 0; i < lines.length; i++) {
    if (
      /\b(?:const|let|var)\s+(?:data|result|value|item|thing|stuff|temp|tmp|foo|bar|baz|x|y|z)\s*[=:]/.test(lines[i])
    ) {
      genericNames++;
    }
  }
  if (genericNames > 3) {
    signals.push({
      id: "generic-naming",
      description: `${genericNames} generic variable names — AI may have generated placeholder code`,
      weight: 10,
    });
  }

  // 3. TODO/FIXME comments left by AI
  let todoCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/\/\/\s*(?:TODO|FIXME|HACK|XXX|PLACEHOLDER)/i.test(lines[i])) {
      todoCount++;
    }
  }
  if (todoCount > 2) {
    signals.push({
      id: "excessive-todos",
      description: `${todoCount} TODO/FIXME comments — AI left implementation gaps`,
      weight: 20,
    });
  }

  // 4. Unreachable or dead code patterns
  for (let i = 0; i < lines.length; i++) {
    if (
      /\breturn\b/.test(lines[i]) &&
      i + 1 < lines.length &&
      /^\s*\S/.test(lines[i + 1]) &&
      !/^\s*[}\])]/.test(lines[i + 1]) &&
      !/^\s*(?:case|default|\/\/|\/?\*)/.test(lines[i + 1])
    ) {
      signals.push({
        id: "dead-code",
        description: "Code after return statement — likely hallucinated",
        weight: 15,
        line: i + 2,
        evidence: lines[i + 1].trim().substring(0, 60),
      });
    }
  }

  // 5. Contradictory logic
  for (let i = 0; i < lines.length; i++) {
    if (/if\s*\(\s*true\s*\)|if\s*\(\s*false\s*\)/.test(lines[i])) {
      signals.push({
        id: "tautology",
        description: "Tautological condition (always true/false)",
        weight: 20,
        line: i + 1,
      });
    }
    if (/=\s*null.*\.\w+|=\s*undefined.*\.\w+/.test(lines[i])) {
      signals.push({
        id: "null-access",
        description: "Property access on value just assigned null/undefined",
        weight: 25,
        line: i + 1,
      });
    }
  }

  // 6. Copy-paste artifacts
  const lineSet = new Map<string, number[]>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 20) {
      if (!lineSet.has(trimmed)) lineSet.set(trimmed, []);
      lineSet.get(trimmed)!.push(i + 1);
    }
  }
  let duplicateBlocks = 0;
  for (const [, lineNums] of lineSet) {
    if (lineNums.length >= 3) duplicateBlocks++;
  }
  if (duplicateBlocks > 2) {
    signals.push({
      id: "copy-paste-artifact",
      description: `${duplicateBlocks} repeated code blocks — AI may have duplicated patterns`,
      weight: 15,
    });
  }

  // 7. Magic numbers/strings
  let magicCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/\b(?:0x[0-9a-f]{4,}|\d{5,})\b/i.test(lines[i]) && !/\bconst\b/.test(lines[i]) && !/\/\//.test(lines[i])) {
      magicCount++;
    }
  }
  if (magicCount > 3) {
    signals.push({
      id: "magic-numbers",
      description: `${magicCount} unexplained magic numbers — AI may have hallucinated constants`,
      weight: 10,
    });
  }

  // 8. Inconsistent error handling
  const tryCatchCount = (content.match(/\btry\s*{/g) || []).length;
  const catchCount = (content.match(/\bcatch\s*\(/g) || []).length;
  const emptyHandlers = (content.match(/catch\s*\([^)]*\)\s*{\s*}/g) || []).length;
  if (emptyHandlers > 0) {
    signals.push({
      id: "empty-catch",
      description: `${emptyHandlers} empty catch block(s) — errors silently swallowed`,
      weight: 15,
    });
  }
  if (tryCatchCount > 0 && catchCount < tryCatchCount) {
    signals.push({
      id: "unmatched-try",
      description: "More try blocks than catch blocks — incomplete error handling",
      weight: 10,
    });
  }

  // 9. Commented-out code (AI artifact)
  let commentedCode = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\/\s*(?:const|let|var|function|class|import|return|if|for|while)\b/.test(lines[i])) {
      commentedCode++;
    }
  }
  if (commentedCode > 3) {
    signals.push({
      id: "commented-code",
      description: `${commentedCode} lines of commented-out code — AI left alternative implementations`,
      weight: 10,
    });
  }

  // 10. Functions with no implementation
  for (let i = 0; i < lines.length; i++) {
    if (/\bfunction\s+\w+\s*\([^)]*\)\s*{\s*}/.test(lines[i]) || /=>\s*{\s*}/.test(lines[i])) {
      signals.push({
        id: "empty-function",
        description: "Empty function body — stub not implemented",
        weight: 20,
        line: i + 1,
      });
    }
  }

  return signals;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const EXTS = new Set([".ts", ".js", ".py", ".java", ".cs", ".go", ".rb", ".php", ".rs", ".swift", ".kt"]);

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

function computeScore(signals: HallucinationSignal[]): number {
  const raw = signals.reduce((sum, s) => sum + s.weight, 0);
  return Math.min(100, raw);
}

function riskLevel(score: number): FileScore["riskLevel"] {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runHallucinationScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges hallucination-score — Assess hallucination risk in AI-generated code

Usage:
  judges hallucination-score <file-or-dir>
  judges hallucination-score src/ --min-risk medium

Options:
  --min-risk <level>  Only show files at or above this risk (low, medium, high, critical)
  --format json       JSON output
  --help, -h          Show this help

Signals detected:
  • Suspicious/non-existent imports
  • Generic placeholder naming
  • Excessive TODO/FIXME comments
  • Dead code after return statements
  • Tautological conditions
  • Copy-paste artifacts
  • Magic numbers
  • Empty catch blocks
  • Commented-out code
  • Empty function stubs
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minRisk = argv.find((_a: string, i: number) => argv[i - 1] === "--min-risk");
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  let files: string[];
  try {
    readdirSync(target);
    files = collectFiles(target);
  } catch {
    files = [target];
  }

  const scored: FileScore[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    const signals = detectHallucinationSignals(content, lines);
    const score = computeScore(signals);
    scored.push({ file: f, score, riskLevel: riskLevel(score), signals });
  }

  let filtered = scored;
  if (minRisk) {
    const order = ["low", "medium", "high", "critical"];
    const minIdx = order.indexOf(minRisk);
    if (minIdx >= 0) filtered = scored.filter((s) => order.indexOf(s.riskLevel) >= minIdx);
  }

  filtered.sort((a, b) => b.score - a.score);

  if (format === "json") {
    console.log(
      JSON.stringify({ files: filtered, scannedFiles: files.length, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    console.log(`\n  Hallucination Risk Assessment — ${files.length} files`);
    console.log(`  ──────────────────────────`);

    if (filtered.length === 0) {
      console.log(`    ✅ No hallucination risks above threshold\n`);
      return;
    }

    for (const f of filtered.slice(0, 20)) {
      const icon =
        f.riskLevel === "critical" ? "🔴" : f.riskLevel === "high" ? "🟠" : f.riskLevel === "medium" ? "🟡" : "🟢";
      console.log(`\n    ${icon} ${f.file} — Score: ${f.score}/100 (${f.riskLevel})`);
      for (const s of f.signals) {
        console.log(`        • ${s.description}${s.line ? ` (line ${s.line})` : ""}`);
      }
    }

    if (filtered.length > 20) console.log(`    ... and ${filtered.length - 20} more files`);

    const avgScore = Math.round(filtered.reduce((sum, f) => sum + f.score, 0) / filtered.length);
    console.log(`\n    Average risk score: ${avgScore}/100`);
    console.log(
      `    Critical: ${filtered.filter((f) => f.riskLevel === "critical").length} | High: ${filtered.filter((f) => f.riskLevel === "high").length} | Medium: ${filtered.filter((f) => f.riskLevel === "medium").length} | Low: ${filtered.filter((f) => f.riskLevel === "low").length}\n`,
    );
  }
}
