/**
 * Review-filter — Advanced multi-criteria finding filter.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";
import { matchWildcardText } from "../tools/command-safety.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FilterCriteria {
  severity: string[];
  ruleIds: string[];
  minConfidence: number;
  maxConfidence: number;
  titlePattern: string;
  hasRecommendation: boolean | null;
  hasPatch: boolean | null;
  minLine: number;
  maxLine: number;
}

function parseFilterCriteria(argv: string[]): FilterCriteria {
  const criteria: FilterCriteria = {
    severity: [],
    ruleIds: [],
    minConfidence: 0,
    maxConfidence: 1,
    titlePattern: "",
    hasRecommendation: null,
    hasPatch: null,
    minLine: 0,
    maxLine: Number.MAX_SAFE_INTEGER,
  };

  const severityArg = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");
  if (severityArg) criteria.severity = severityArg.split(",").map((s) => s.trim().toLowerCase());

  const ruleArg = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  if (ruleArg) criteria.ruleIds = ruleArg.split(",").map((s) => s.trim());

  const minConf = argv.find((_a: string, i: number) => argv[i - 1] === "--min-confidence");
  if (minConf) criteria.minConfidence = parseFloat(minConf);

  const maxConf = argv.find((_a: string, i: number) => argv[i - 1] === "--max-confidence");
  if (maxConf) criteria.maxConfidence = parseFloat(maxConf);

  const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title");
  if (title) criteria.titlePattern = title;

  if (argv.includes("--has-recommendation")) criteria.hasRecommendation = true;
  if (argv.includes("--no-recommendation")) criteria.hasRecommendation = false;

  if (argv.includes("--has-patch")) criteria.hasPatch = true;
  if (argv.includes("--no-patch")) criteria.hasPatch = false;

  const minLine = argv.find((_a: string, i: number) => argv[i - 1] === "--min-line");
  if (minLine) criteria.minLine = parseInt(minLine, 10);

  const maxLine = argv.find((_a: string, i: number) => argv[i - 1] === "--max-line");
  if (maxLine) criteria.maxLine = parseInt(maxLine, 10);

  return criteria;
}

function matchesCriteria(f: Finding, c: FilterCriteria): boolean {
  if (c.severity.length > 0 && !c.severity.includes((f.severity || "").toLowerCase())) return false;
  if (c.ruleIds.length > 0 && !c.ruleIds.includes(f.ruleId || "")) return false;

  const conf = f.confidence ?? 0;
  if (conf < c.minConfidence || conf > c.maxConfidence) return false;

  if (c.titlePattern) {
    const title = (f.title || "").toLowerCase();
    const pattern = c.titlePattern.toLowerCase();
    if (!title.includes(pattern) && !matchWildcardText(title, pattern)) return false;
  }

  if (c.hasRecommendation === true && !f.recommendation) return false;
  if (c.hasRecommendation === false && f.recommendation) return false;

  if (c.hasPatch === true && !f.patch) return false;
  if (c.hasPatch === false && f.patch) return false;

  if (f.lineNumbers && f.lineNumbers.length > 0) {
    const minL = Math.min(...f.lineNumbers);
    const maxL = Math.max(...f.lineNumbers);
    if (maxL < c.minLine || minL > c.maxLine) return false;
  }

  return true;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFilter(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-filter — Advanced multi-criteria finding filter

Usage:
  judges review-filter --file verdict.json --severity critical,high
  judges review-filter --file verdict.json --rule SQLI,XSS --has-patch
  judges review-filter --file verdict.json --min-confidence 0.8

Options:
  --file <path>            Verdict JSON to filter
  --severity <list>        Filter by severity (comma-separated)
  --rule <list>            Filter by rule ID (comma-separated)
  --min-confidence <n>     Minimum confidence threshold (0-1)
  --max-confidence <n>     Maximum confidence threshold (0-1)
  --title <pattern>        Filter by title text or wildcard pattern
  --has-recommendation     Only findings with recommendations
  --no-recommendation      Only findings without recommendations
  --has-patch              Only findings with patches
  --no-patch               Only findings without patches
  --min-line <n>           Minimum line number
  --max-line <n>           Maximum line number
  --format json            JSON output
  --help, -h               Show this help

Multiple criteria are combined with AND logic.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");

  if (!file) {
    console.error("Error: --file is required.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Could not parse ${file}`);
    process.exitCode = 1;
    return;
  }

  const criteria = parseFilterCriteria(argv);
  const allFindings = verdict.findings || [];
  const matched = allFindings.filter((f) => matchesCriteria(f, criteria));

  if (format === "json") {
    console.log(
      JSON.stringify({ total: allFindings.length, matched: matched.length, criteria, findings: matched }, null, 2),
    );
    return;
  }

  console.log(`\n  Filtered Findings\n  ─────────────────────────────`);
  console.log(`    Total: ${allFindings.length}`);
  console.log(`    Matched: ${matched.length}`);
  console.log(`    Excluded: ${allFindings.length - matched.length}`);
  console.log();

  if (criteria.severity.length > 0) console.log(`    Filter — severity: ${criteria.severity.join(", ")}`);
  if (criteria.ruleIds.length > 0) console.log(`    Filter — rules: ${criteria.ruleIds.join(", ")}`);
  if (criteria.minConfidence > 0) console.log(`    Filter — min confidence: ${criteria.minConfidence}`);
  if (criteria.titlePattern) console.log(`    Filter — title pattern: ${criteria.titlePattern}`);
  console.log();

  for (const f of matched) {
    const sev = f.severity || "unknown";
    const line = f.lineNumbers && f.lineNumbers.length > 0 ? ` (L${f.lineNumbers[0]})` : "";
    console.log(`    [${sev.toUpperCase()}] ${f.title || f.ruleId || "untitled"}${line}`);
  }

  if (matched.length === 0) {
    console.log("    No findings match the specified criteria.");
  }

  console.log();
}
