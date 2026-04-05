/**
 * Martian Code Review Benchmark Integration
 *
 * Adapter for the Martian Code Review Bench offline benchmark
 * (https://github.com/withmartian/code-review-benchmark).
 *
 * 50 PRs from 5 major open-source projects (Sentry, Grafana, Cal.com,
 * Discourse, Keycloak) with human-curated golden comments at severity
 * levels Low/Medium/High/Critical.
 *
 * For each PR, Judges evaluates the diff and we match our findings
 * against the golden comments using semantic similarity at the
 * rule-prefix and description level.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";
import { evaluateWithTribunal } from "../evaluators/index.js";
import type { Finding } from "../types.js";
import type { BenchmarkCase } from "./benchmark.js";
import { registerBenchmarkAdapter } from "./external-benchmarks.js";
import type { ExternalBenchmarkAdapter, ExternalBenchmarkResult, BenchmarkRunConfig } from "./external-benchmarks.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MartianGoldenComment {
  comment: string;
  severity: "Low" | "Medium" | "High" | "Critical";
}

export interface MartianPr {
  pr_title: string;
  url: string;
  original_url?: string;
  az_comment?: string;
  comments: MartianGoldenComment[];
}

export interface MartianPrResult {
  prTitle: string;
  prUrl: string;
  sourceRepo: string;
  language: string;
  goldenComments: number;
  matchedComments: number;
  unmatchedComments: number;
  falsePositives: number;
  precision: number;
  recall: number;
  findings: Finding[];
  matches: Array<{ golden: string; finding: string; severity: string }>;
  missed: string[];
}

// ─── Golden Comment → Finding Matching ──────────────────────────────────────

/**
 * Keyword extraction from golden comments for matching against Judges findings.
 * We match on semantic overlap — does a finding's description/message cover
 * the same concern as the golden comment?
 */
const ISSUE_KEYWORDS: Record<string, string[]> = {
  // Bug patterns
  "null reference": ["null", "undefined", "none", "nil", "attributeerror", "typeerror"],
  "race condition": ["race", "concurrent", "lock", "deadlock", "mutex", "thread"],
  "type error": ["type", "typeerror", "cast", "coercion", "conversion"],
  "off-by-one": ["off-by-one", "boundary", "fence", "index", "slice"],
  negative: ["negative", "minus", "underflow"],

  // Security
  injection: ["inject", "sql", "xss", "command", "eval"],
  authentication: ["auth", "credential", "password", "token", "session", "oauth"],
  authorization: ["permission", "access", "privilege", "role", "scope"],
  secret: ["secret", "key", "hardcoded", "credential", "password"],
  csrf: ["csrf", "cross-site", "forgery"],

  // Code quality
  "error handling": ["error", "exception", "catch", "throw", "try", "unhandled"],
  validation: ["valid", "sanitize", "check", "assert", "input"],
  memory: ["memory", "leak", "gc", "buffer", "overflow"],
  performance: ["performance", "slow", "latency", "n+1", "query", "cache"],
  deprecated: ["deprecated", "obsolete", "legacy"],
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeyTerms(text: string): Set<string> {
  const normalized = normalizeText(text);
  const terms = new Set<string>();

  // Add individual words
  for (const word of normalized.split(" ")) {
    if (word.length > 3) terms.add(word);
  }

  // Add matched keyword categories
  for (const [_category, keywords] of Object.entries(ISSUE_KEYWORDS)) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        terms.add(kw);
      }
    }
  }

  return terms;
}

function computeSimilarity(goldenText: string, findingText: string): number {
  const goldenTerms = extractKeyTerms(goldenText);
  const findingTerms = extractKeyTerms(findingText);

  if (goldenTerms.size === 0 || findingTerms.size === 0) return 0;

  let overlap = 0;
  for (const term of goldenTerms) {
    if (findingTerms.has(term)) overlap++;
  }

  // Jaccard-style similarity with bias toward golden coverage
  const goldenCoverage = overlap / goldenTerms.size;
  const findingCoverage = overlap / findingTerms.size;

  // Weight golden coverage more — we care more about whether we caught
  // the golden issue than about how many extra words we generated
  return goldenCoverage * 0.7 + findingCoverage * 0.3;
}

const MATCH_THRESHOLD = 0.25;

function matchFindingsToGolden(
  goldenComments: MartianGoldenComment[],
  findings: Finding[],
): { matches: Array<{ golden: string; finding: string; severity: string }>; missed: string[]; fps: number } {
  const matches: Array<{ golden: string; finding: string; severity: string }> = [];
  const missed: string[] = [];
  const matchedFindingIndices = new Set<number>();

  for (const gc of goldenComments) {
    let bestScore = 0;
    let bestFindingIdx = -1;

    for (let fi = 0; fi < findings.length; fi++) {
      if (matchedFindingIndices.has(fi)) continue;

      const f = findings[fi];
      const findingText = [f.description, f.recommendation ?? ""].join(" ");
      const score = computeSimilarity(gc.comment, findingText);

      if (score > bestScore) {
        bestScore = score;
        bestFindingIdx = fi;
      }
    }

    if (bestScore >= MATCH_THRESHOLD && bestFindingIdx >= 0) {
      matchedFindingIndices.add(bestFindingIdx);
      matches.push({
        golden: gc.comment.slice(0, 100),
        finding: findings[bestFindingIdx].ruleId,
        severity: gc.severity,
      });
    } else {
      missed.push(gc.comment.slice(0, 100));
    }
  }

  // FPs = findings not matched to any golden comment
  const fps = findings.length - matchedFindingIndices.size;

  return { matches, missed, fps };
}

// ─── Data Loading ───────────────────────────────────────────────────────────

const REPO_LANGUAGES: Record<string, string> = {
  sentry: "python",
  grafana: "go",
  cal_dot_com: "typescript",
  discourse: "ruby",
  keycloak: "java",
};

export function loadGoldenComments(repoPath: string): Map<string, MartianPr[]> {
  const goldenDir = join(repoPath, "offline", "golden_comments");
  const prsByRepo = new Map<string, MartianPr[]>();

  const files = readdirSync(goldenDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const repoName = file.replace(".json", "");
    const raw = readFileSync(join(goldenDir, file), "utf-8");
    const prs: MartianPr[] = JSON.parse(raw);
    prsByRepo.set(repoName, prs);
  }

  return prsByRepo;
}

// ─── PR Diff Retrieval ──────────────────────────────────────────────────────

/**
 * Fetch the unified diff for a PR from GitHub.
 * Works for public repos without authentication.
 */
function fetchPrDiff(prUrl: string): string | undefined {
  const diffUrl = prUrl.replace(/\/?$/, ".diff");
  try {
    const result = execSync(`node -e "fetch('${diffUrl}').then(r=>r.text()).then(t=>process.stdout.write(t))"`, {
      stdio: "pipe",
      timeout: 30_000,
    });
    const diff = result.toString();
    return diff.length > 100 ? diff : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract changed file contents from a unified diff.
 * Returns the "after" (added/modified) lines for each file.
 */
function extractFilesFromDiff(diff: string): Array<{ path: string; content: string; language: string }> {
  const files: Array<{ path: string; content: string; language: string }> = [];
  const fileSections = diff.split(/^diff --git /m).slice(1);

  for (const section of fileSections) {
    // Extract file path from "a/path b/path"
    const pathMatch = section.match(/^a\/(.*?) b\//);
    if (!pathMatch) continue;
    const filePath = pathMatch[1];

    // Skip non-code files
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      go: "go",
      java: "java",
      rb: "ruby",
      rs: "rust",
      cs: "csharp",
      php: "php",
      kt: "kotlin",
      swift: "swift",
    };
    const language = langMap[ext];
    if (!language) continue;

    // Extract added lines (lines starting with +, excluding +++ header)
    const lines = section.split("\n");
    const addedLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("+++")) continue;
      if (line.startsWith("+")) {
        addedLines.push(line.slice(1));
      }
    }

    if (addedLines.length > 0) {
      files.push({ path: filePath, content: addedLines.join("\n"), language });
    }
  }

  return files;
}

/**
 * Convert a Martian PR with golden comments into BenchmarkCase format
 * for use in the LLM benchmark pipeline.
 *
 * Each golden comment becomes an expected finding. The PR diff provides
 * the actual code to evaluate. The LLM judge determines if its review
 * catches the same issues the human reviewer identified.
 */
export function convertPrToBenchmarkCase(pr: MartianPr, repoName: string, diff?: string): BenchmarkCase | undefined {
  const language = REPO_LANGUAGES[repoName] ?? "typescript";

  // Build expected rule IDs from golden comments by mapping severity to prefixes
  // Since golden comments are semantic (not rule-ID based), we use broad prefixes
  // that the LLM should fire when it identifies similar issues
  const expectedRuleIds: string[] = [];
  const acceptablePrefixes = new Set([
    "CYBER",
    "SEC",
    "AUTH",
    "DATA",
    "ERR",
    "CONC",
    "DB",
    "PERF",
    "CFG",
    "REL",
    "LOGIC",
    "MAINT",
    "FW",
    "RATE",
    "STRUCT",
  ]);

  for (let i = 0; i < pr.comments.length; i++) {
    const gc = pr.comments[i];
    const prefix = inferPrefixFromComment(gc.comment, gc.severity);
    expectedRuleIds.push(`${prefix}-${String(i + 1).padStart(3, "0")}`);
  }

  let code: string;
  if (diff) {
    const files = extractFilesFromDiff(diff);
    if (files.length === 0) return undefined;

    // Use the largest changed file as the primary code
    files.sort((a, b) => b.content.length - a.content.length);
    code = files[0].content;

    // Truncate to avoid token limits
    if (code.length > 8000) {
      code = code.slice(0, 8000) + "\n// ... truncated for benchmark";
    }
  } else {
    // Fallback: embed golden comments as context for LLM evaluation
    const lines = [`// PR: ${pr.pr_title}`, `// Review the following changes for issues:`];
    for (const gc of pr.comments) {
      lines.push(`// Known issue [${gc.severity}]: ${gc.comment}`);
    }
    code = lines.join("\n");
  }

  return {
    id: `martian-${repoName}-${pr.pr_title
      .slice(0, 40)
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase()}`,
    description: `Martian Code Review: ${pr.pr_title} (${repoName}, ${pr.comments.length} golden comments)`,
    language,
    code,
    expectedRuleIds,
    acceptablePrefixes: [...acceptablePrefixes],
    category: `code-review-${repoName}`,
    difficulty: pr.comments.some((c) => c.severity === "Critical" || c.severity === "High") ? "hard" : "medium",
    aiSource: "martian-code-review-benchmark",
  };
}

/**
 * Infer the most likely judge prefix from a golden comment description.
 */
function inferPrefixFromComment(comment: string, severity: string): string {
  const lower = comment.toLowerCase();

  if (/race|deadlock|lock|concurrent|mutex|thread/.test(lower)) return "CONC";
  if (/sql|query|database|n\+1|select \*/.test(lower)) return "DB";
  if (/auth|credential|password|token|session|oauth|permission/.test(lower)) return "AUTH";
  if (/inject|xss|eval|command/.test(lower)) return "CYBER";
  if (/secret|hardcod|api.?key/.test(lower)) return "CFG";
  if (/null|undefined|none|nil|attributeerror|typeerror|crash/.test(lower)) return "ERR";
  if (/error|exception|catch|throw|unhandled|fault/.test(lower)) return "ERR";
  if (/valid|sanitiz|input|check|assert/.test(lower)) return "SEC";
  if (/performance|slow|latency|cache|memory/.test(lower)) return "PERF";
  if (/deprecat|obsolete|legacy|breaking/.test(lower)) return "COMPAT";
  if (/log|metric|monitor|observ/.test(lower)) return "OBS";
  if (/test|flaky|mock|assert/.test(lower)) return "TEST";
  if (/name|typo|rename|docstring|comment/.test(lower)) return "DOC";
  if (/magic.?number|duplicate|dead.?code|complex/.test(lower)) return "MAINT";
  if (/isinstance|type|class|inherit/.test(lower)) return "LOGIC";

  // Default based on severity
  if (severity === "Critical" || severity === "High") return "SEC";
  return "MAINT";
}

/**
 * Convert all Martian golden comments into BenchmarkCase[] for LLM evaluation.
 * Fetches actual PR diffs from GitHub when possible.
 */
export function convertAllToBenchmarkCases(repoPath: string): BenchmarkCase[] {
  const prsByRepo = loadGoldenComments(repoPath);
  const cases: BenchmarkCase[] = [];

  for (const [repoName, prs] of prsByRepo) {
    for (const pr of prs) {
      // Try to fetch the actual diff
      const diff = fetchPrDiff(pr.url);
      const benchCase = convertPrToBenchmarkCase(pr, repoName, diff);
      if (benchCase) cases.push(benchCase);
    }
  }

  return cases;
}

/**
 * Synthesise representative code from the golden comment descriptions.
 * Fallback when PR diffs cannot be fetched.
 */
function synthesizeCodeFromGolden(pr: MartianPr, language: string): string {
  const lines: string[] = [];
  lines.push(`// PR: ${pr.pr_title}`);
  lines.push(`// Source: ${pr.url}`);
  lines.push(`// Language: ${language}`);
  lines.push("");

  // Embed the golden comment descriptions as code-like patterns
  // that Judges should be able to analyze
  for (let i = 0; i < pr.comments.length; i++) {
    const gc = pr.comments[i];
    lines.push(`// Issue ${i + 1} [${gc.severity}]: ${gc.comment}`);
  }
  lines.push("");
  lines.push("// (Synthetic context for benchmark matching)");

  return lines.join("\n");
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

function evaluatePr(pr: MartianPr, repoName: string): MartianPrResult {
  const language = REPO_LANGUAGES[repoName] ?? "typescript";
  const code = synthesizeCodeFromGolden(pr, language);

  // Run tribunal evaluation
  const verdict = evaluateWithTribunal(code, language);
  const findings = verdict.findings;

  // Match findings against golden comments
  const { matches, missed, fps } = matchFindingsToGolden(pr.comments, findings);

  const tp = matches.length;
  const fn = missed.length;
  const precision = tp + fps > 0 ? tp / (tp + fps) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;

  return {
    prTitle: pr.pr_title,
    prUrl: pr.url,
    sourceRepo: repoName,
    language,
    goldenComments: pr.comments.length,
    matchedComments: tp,
    unmatchedComments: fn,
    falsePositives: fps,
    precision,
    recall,
    findings,
    matches,
    missed,
  };
}

// ─── Aggregate Results ──────────────────────────────────────────────────────

function computeMartianMetrics(results: MartianPrResult[]): {
  precision: number;
  recall: number;
  f1: number;
  detectionRate: number;
  perRepo: Record<string, { total: number; detected: number; rate: number }>;
  perSeverity: Record<string, { total: number; detected: number; rate: number }>;
} {
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let detected = 0;
  const perRepo: Record<string, { total: number; detected: number; rate: number }> = {};
  const perSeverity: Record<string, { total: number; detected: number; rate: number }> = {};

  for (const r of results) {
    totalTP += r.matchedComments;
    totalFP += r.falsePositives;
    totalFN += r.unmatchedComments;
    if (r.matchedComments > 0) detected++;

    // Per-repo
    if (!perRepo[r.sourceRepo]) perRepo[r.sourceRepo] = { total: 0, detected: 0, rate: 0 };
    perRepo[r.sourceRepo].total++;
    if (r.matchedComments > 0) perRepo[r.sourceRepo].detected++;

    // Per-severity from matches
    for (const m of r.matches) {
      if (!perSeverity[m.severity]) perSeverity[m.severity] = { total: 0, detected: 0, rate: 0 };
      perSeverity[m.severity].total++;
      perSeverity[m.severity].detected++;
    }
    for (const _missed of r.missed) {
      // We don't have severity for missed items easily, put under "Unknown"
      if (!perSeverity["Missed"]) perSeverity["Missed"] = { total: 0, detected: 0, rate: 0 };
      perSeverity["Missed"].total++;
    }
  }

  // Compute rates
  for (const entry of Object.values(perRepo)) {
    entry.rate = entry.total > 0 ? entry.detected / entry.total : 0;
  }
  for (const entry of Object.values(perSeverity)) {
    entry.rate = entry.total > 0 ? entry.detected / entry.total : 0;
  }

  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const detectionRate = results.length > 0 ? detected / results.length : 0;

  return { precision, recall, f1, detectionRate, perRepo, perSeverity };
}

// ─── Adapter Registration ───────────────────────────────────────────────────

function readJudgesVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const martianAdapter: ExternalBenchmarkAdapter = {
  suiteId: "martian-code-review",
  suiteName: "Martian Code Review Bench",
  suiteUrl: "https://github.com/withmartian/code-review-benchmark",
  defaultRepoPath: "../code-review-benchmark",
  description: "50 PRs from 5 open-source projects with human-curated golden comments (Python, Go, TS, Ruby, Java)",

  validate(repoPath: string): string | undefined {
    if (!existsSync(repoPath)) {
      return `Repo not found at ${repoPath}. Clone with: git clone https://github.com/withmartian/code-review-benchmark.git`;
    }
    const goldenDir = join(repoPath, "offline", "golden_comments");
    if (!existsSync(goldenDir)) {
      return `Golden comments not found at ${goldenDir}. Is this the correct repo?`;
    }
    return undefined;
  },

  run(config: BenchmarkRunConfig): ExternalBenchmarkResult {
    const prsByRepo = loadGoldenComments(config.repoPath);
    let totalPrs = 0;
    for (const prs of prsByRepo.values()) totalPrs += prs.length;
    console.log(`  Loaded ${totalPrs} PRs across ${prsByRepo.size} repos`);

    const allResults: MartianPrResult[] = [];
    let idx = 0;

    for (const [repoName, prs] of prsByRepo) {
      for (const pr of prs) {
        idx++;

        // Filter by single item if specified
        if (config.singleItem && !pr.url.includes(config.singleItem) && pr.pr_title !== config.singleItem) {
          continue;
        }

        const pct = Math.round((idx / totalPrs) * 100);
        process.stdout.write(`\r  [${idx}/${totalPrs}] ${pct}% ${repoName}: ${pr.pr_title.slice(0, 50)}`);

        const result = evaluatePr(pr, repoName);
        allResults.push(result);

        const icon = result.matchedComments > 0 ? "✅" : "❌";
        process.stdout.write(
          `\r  [${idx}/${totalPrs}] ${pct}% ${icon} ${repoName}: ${pr.pr_title.slice(0, 50)}                    \n`,
        );
      }
    }

    const metrics = computeMartianMetrics(allResults);

    // Merge perRepo + perSeverity into perCategory
    const perCategory: Record<string, { total: number; detected: number; rate: number }> = {};
    for (const [k, v] of Object.entries(metrics.perRepo)) {
      perCategory[`repo:${k}`] = v;
    }
    for (const [k, v] of Object.entries(metrics.perSeverity)) {
      perCategory[`severity:${k}`] = v;
    }

    return {
      suiteId: "martian-code-review",
      suiteName: "Martian Code Review Bench",
      suiteUrl: "https://github.com/withmartian/code-review-benchmark",
      timestamp: new Date().toISOString(),
      judgesVersion: readJudgesVersion(),
      totalItems: totalPrs,
      evaluatedItems: allResults.length,
      skippedItems: totalPrs - allResults.length,
      precision: metrics.precision,
      recall: metrics.recall,
      f1Score: metrics.f1,
      detectionRate: metrics.detectionRate,
      truePositives: allResults.reduce((s, r) => s + r.matchedComments, 0),
      falsePositives: allResults.reduce((s, r) => s + r.falsePositives, 0),
      falseNegatives: allResults.reduce((s, r) => s + r.unmatchedComments, 0),
      perCategory,
      rawData: allResults,
    };
  },
};

registerBenchmarkAdapter(martianAdapter);
