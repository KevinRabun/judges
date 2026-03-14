/**
 * PII scan — detect personally-identifiable information patterns
 * in source code: string literals, logs, config files.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PiiMatch {
  file: string;
  line: number;
  column: number;
  type: string;
  snippet: string;
  confidence: "high" | "medium" | "low";
}

interface PiiPattern {
  id: string;
  label: string;
  regex: RegExp;
  confidence: PiiMatch["confidence"];
  validate?: (match: string) => boolean;
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const PII_PATTERNS: PiiPattern[] = [
  {
    id: "ssn",
    label: "Social Security Number",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: "high",
    validate: (m) => {
      const parts = m.split("-");
      return parseInt(parts[0]) > 0 && parseInt(parts[0]) < 900;
    },
  },
  {
    id: "credit-card",
    label: "Credit Card Number",
    regex: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{1,4}\b/g,
    confidence: "high",
    validate: (m) => {
      const digits = m.replace(/[- ]/g, "");
      if (digits.length < 13 || digits.length > 19) return false;
      // Luhn check
      let sum = 0;
      let alt = false;
      for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i]);
        if (alt) {
          n *= 2;
          if (n > 9) n -= 9;
        }
        sum += n;
        alt = !alt;
      }
      return sum % 10 === 0;
    },
  },
  {
    id: "email",
    label: "Email Address",
    regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    confidence: "medium",
    validate: (m) => {
      // Exclude common non-PII patterns
      if (m.endsWith("@example.com") || m.endsWith("@test.com")) return false;
      if (m.startsWith("noreply@") || m.startsWith("info@")) return false;
      return true;
    },
  },
  {
    id: "phone-us",
    label: "US Phone Number",
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    confidence: "medium",
    validate: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 11;
    },
  },
  {
    id: "ip-address",
    label: "IP Address",
    regex:
      /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    confidence: "low",
    validate: (m) => {
      // Skip loopback and private ranges that are typically non-PII
      if (m.startsWith("127.") || m.startsWith("0.") || m === "255.255.255.255") return false;
      return true;
    },
  },
  {
    id: "date-of-birth",
    label: "Date of Birth Pattern",
    regex: /\b(?:dob|date_?of_?birth|birth_?date|birthday)\s*[:=]\s*["']?\d{1,4}[-/]\d{1,2}[-/]\d{1,4}["']?/gi,
    confidence: "high",
  },
  {
    id: "passport",
    label: "Passport Number Pattern",
    regex: /\b(?:passport(?:_?(?:no|num|number))?)\s*[:=]\s*["']?[A-Z0-9]{6,9}["']?/gi,
    confidence: "high",
  },
  {
    id: "drivers-license",
    label: "Drivers License Pattern",
    regex: /\b(?:drivers?_?(?:license|licence)(?:_?(?:no|num|number))?)\s*[:=]\s*["']?[A-Z0-9-]{5,15}["']?/gi,
    confidence: "high",
  },
  {
    id: "logging-pii",
    label: "PII in Logging Statement",
    regex:
      /(?:console\.(?:log|warn|error|info)|logger?\.\w+|print|println)\s*\(.*(?:email|phone|ssn|social|password|name|address|dob|birth)/gi,
    confidence: "medium",
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "__pycache__"]);
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rb",
  ".php",
  ".rs",
  ".swift",
  ".kt",
  ".scala",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".env",
  ".cfg",
  ".ini",
  ".conf",
]);

function collectSourceFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (CODE_EXTENSIONS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

function maskPii(text: string): string {
  if (text.length <= 4) return "****";
  return text.slice(0, 2) + "*".repeat(text.length - 4) + text.slice(-2);
}

function scanFile(filePath: string): PiiMatch[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const matches: PiiMatch[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // Skip comments that look like documentation/patterns
    if (/^\s*(?:\/\/|#|\/?\*)\s*(?:example|test|sample|pattern|regex|format)/i.test(line)) continue;

    for (const pattern of PII_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.regex.exec(line)) !== null) {
        if (pattern.validate && !pattern.validate(m[0])) continue;
        matches.push({
          file: filePath,
          line: lineIdx + 1,
          column: m.index + 1,
          type: pattern.id,
          snippet: maskPii(m[0]),
          confidence: pattern.confidence,
        });
      }
    }
  }

  return matches;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPiiScan(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges pii-scan — Detect personally-identifiable information in source code

Usage:
  judges pii-scan [dir]
  judges pii-scan src/ --confidence high
  judges pii-scan . --format json --output pii-report.json

Options:
  --confidence <level>  Filter by confidence (high, medium, low)
  --type <types>        Filter by PII type (comma-separated: ssn,credit-card,email,...)
  --patterns            List all PII detection patterns
  --format json         JSON output
  --output <file>       Write report to file
  --help, -h            Show this help

PII Types: ${PII_PATTERNS.map((p) => p.id).join(", ")}
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");

  if (argv.includes("--patterns")) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          PII_PATTERNS.map(({ regex: _r, validate: _v, ...rest }) => rest),
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  PII Detection Patterns (${PII_PATTERNS.length})\n  ──────────────────────────`);
      for (const p of PII_PATTERNS) {
        console.log(`    [${p.confidence.toUpperCase().padEnd(6)}] ${p.id.padEnd(20)} — ${p.label}`);
      }
      console.log("");
    }
    return;
  }

  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  const confFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--confidence");
  const typeFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--type");

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  const files = collectSourceFiles(target);
  let allMatches: PiiMatch[] = [];

  for (const f of files) {
    allMatches.push(...scanFile(f));
  }

  if (confFilter) {
    allMatches = allMatches.filter((m) => m.confidence === confFilter);
  }
  if (typeFilter) {
    const allowed = typeFilter.split(",");
    allMatches = allMatches.filter((m) => allowed.includes(m.type));
  }

  const report = {
    matches: allMatches,
    scannedFiles: files.length,
    summary: {
      total: allMatches.length,
      byType: Object.fromEntries(
        PII_PATTERNS.map((p) => [p.id, allMatches.filter((m) => m.type === p.id).length]).filter(
          ([, count]) => (count as number) > 0,
        ),
      ),
      byConfidence: {
        high: allMatches.filter((m) => m.confidence === "high").length,
        medium: allMatches.filter((m) => m.confidence === "medium").length,
        low: allMatches.filter((m) => m.confidence === "low").length,
      },
    },
    timestamp: new Date().toISOString(),
  };

  if (outputFile) {
    const dir = join(".", ".judges-pii-scan");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, outputFile), JSON.stringify(report, null, 2));
    console.log(`  Report saved to .judges-pii-scan/${outputFile}`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  PII Scan — ${files.length} files scanned`);
    console.log(`  Found: ${allMatches.length} potential PII occurrences\n  ──────────────────────────`);

    if (allMatches.length === 0) {
      console.log(`    ✅ No PII detected\n`);
      return;
    }

    for (const conf of ["high", "medium", "low"] as const) {
      const items = allMatches.filter((m) => m.confidence === conf);
      if (items.length === 0) continue;
      console.log(`\n    ${conf.toUpperCase()} CONFIDENCE (${items.length})`);
      for (const m of items) {
        const piiDef = PII_PATTERNS.find((p) => p.id === m.type);
        console.log(`      ${m.file}:${m.line}:${m.column} — ${piiDef?.label || m.type}`);
        console.log(`        Masked: ${m.snippet}`);
      }
    }
    console.log("");
  }
}
