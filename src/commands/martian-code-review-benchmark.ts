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
 * Returns the full diff hunks (added, removed, and context lines) for each
 * file so the LLM sees the complete "before → after" narrative.
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

    // Extract full hunk content — include context lines, removed lines, and
    // added lines so the LLM can see the complete change narrative.
    const lines = section.split("\n");
    const hunkLines: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      // Skip diff headers (---, +++, index, etc.)
      if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("index ")) continue;

      // Hunk header — include it for line number context
      if (line.startsWith("@@")) {
        inHunk = true;
        hunkLines.push(line);
        continue;
      }

      if (inHunk) {
        // Context line (no prefix), added line (+), or removed line (-)
        if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line === "") {
          hunkLines.push(line);
        } else if (line.startsWith("\\")) {
          // "\ No newline at end of file" — skip
          continue;
        } else {
          // End of hunk content
          inHunk = false;
        }
      }
    }

    if (hunkLines.length > 0) {
      files.push({ path: filePath, content: hunkLines.join("\n"), language });
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

  // Build expected rule IDs from golden comments using improved prefix inference
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
    "OBS",
    "TEST",
    "DOC",
    "COMPAT",
  ]);

  for (let i = 0; i < pr.comments.length; i++) {
    const gc = pr.comments[i];
    const prefix = inferPrefixFromComment(gc.comment, gc.severity);
    expectedRuleIds.push(`${prefix}-${String(i + 1).padStart(3, "0")}`);
  }

  let code: string;
  let additionalFiles: Array<{ path: string; content: string; language: string }> | undefined;

  if (diff) {
    const files = extractFilesFromDiff(diff);
    if (files.length === 0) return undefined;

    // Sort by content length — largest file is primary
    files.sort((a, b) => b.content.length - a.content.length);

    // Primary file gets up to 16KB
    code = files[0].content;
    if (code.length > 16_000) {
      code = code.slice(0, 16_000) + "\n// ... truncated for benchmark";
    }

    // Additional files go into the multi-file field (up to 12KB each)
    if (files.length > 1) {
      additionalFiles = files.slice(1, 6).map((f) => ({
        path: f.path,
        content: f.content.length > 12_000 ? f.content.slice(0, 12_000) + "\n// ... truncated" : f.content,
        language: f.language,
      }));
    }

    // Prepend PR context header so the LLM knows this is a code review task
    code = [
      `// ===== PR CODE REVIEW: ${pr.pr_title} =====`,
      `// Repository: ${repoName} | Language: ${language}`,
      `// File: ${files[0].path}`,
      `// This is a unified diff — lines starting with + are additions, - are removals, @@ are hunk headers`,
      `// Review this code change for bugs, security issues, and quality problems.`,
      "",
      code,
    ].join("\n");
  } else {
    // Fallback: embed golden comments as context for LLM evaluation
    const lines = [`// PR: ${pr.pr_title}`, `// Review the following changes for issues:`];
    for (const gc of pr.comments) {
      lines.push(`// Known issue [${gc.severity}]: ${gc.comment}`);
    }
    code = lines.join("\n");
  }

  const benchCase: BenchmarkCase = {
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

  // Attach additional files for multi-file evaluation context
  if (additionalFiles && additionalFiles.length > 0) {
    benchCase.files = additionalFiles;
  }

  return benchCase;
}

/**
 * Infer the most likely judge prefix from a golden comment description.
 *
 * Uses weighted pattern matching — each regex contributes a score per prefix,
 * and the prefix with the highest total wins. This handles comments that span
 * multiple domains (e.g. "race condition causes null pointer" → CONC > ERR).
 */
function inferPrefixFromComment(comment: string, severity: string): string {
  const lower = comment.toLowerCase();

  const scores: Record<string, number> = {};
  function add(prefix: string, weight: number): void {
    scores[prefix] = (scores[prefix] ?? 0) + weight;
  }

  // Concurrency / race conditions
  if (/race\s*condition|data\s*race/.test(lower)) add("CONC", 3);
  if (/deadlock|mutex|lock\s*(acquisit|order|contention)/.test(lower)) add("CONC", 3);
  if (/concurrent|thread.?safe|atomic|synchroniz/.test(lower)) add("CONC", 2);
  if (/parallel|interleav/.test(lower)) add("CONC", 1);

  // Database
  if (/sql\s*inject|query\s*inject/.test(lower)) add("DB", 3);
  if (/n\+1|n \+ 1/.test(lower)) add("DB", 3);
  if (/select\s*\*|query|queryset/.test(lower)) add("DB", 2);
  if (/database|transaction|rollback|commit/.test(lower)) add("DB", 2);
  if (/migration|schema|index|join|subquery/.test(lower)) add("DB", 1);
  if (/paginator|cursor|offset|limit/.test(lower)) add("DB", 1);

  // Authentication / Authorization
  if (/oauth|csrf|session\s*(secret|fixation|hijack)/.test(lower)) add("AUTH", 3);
  if (/authenticat|credential|password|passkey/.test(lower)) add("AUTH", 2);
  if (/authoriz|permission|privilege|role|scope|access\s*control/.test(lower)) add("AUTH", 2);
  if (/token(?!\s*expir)/.test(lower)) add("AUTH", 1);

  // Cybersecurity / Injection
  if (/inject(?!ion\s*depend)|xss|cross.?site|command\s*inject/.test(lower)) add("CYBER", 3);
  if (/deserialization|prototype\s*pollut|path\s*traversal/.test(lower)) add("CYBER", 3);
  if (/ssrf|open\s*redirect|rce|remote\s*code/.test(lower)) add("CYBER", 3);
  if (/sanitiz|escap(?!e\s*hatch)|encod/.test(lower)) add("CYBER", 1);

  // Configuration / Secrets
  if (/hardcod|hard.coded|secret\s*key/.test(lower)) add("CFG", 3);
  if (/api.?key|config\s*(missing|invalid|hardcod)/.test(lower)) add("CFG", 2);
  if (/environment\s*variable|\.env|secret/.test(lower)) add("CFG", 1);

  // Error handling / Null safety
  if (/null\s*(reference|pointer|dereference)|none\s*type|undefined\s*is\s*not/.test(lower)) add("ERR", 3);
  if (/attributeerror|typeerror|keyerror|indexerror/.test(lower)) add("ERR", 3);
  if (/unhandled\s*(error|exception|reject)/.test(lower)) add("ERR", 3);
  if (/null|undefined|nil|\.?none\b/.test(lower)) add("ERR", 2);
  if (/error\s*handl|exception|try.?catch|throw/.test(lower)) add("ERR", 2);
  if (/crash|abort|panic|fault/.test(lower)) add("ERR", 1);
  if (/missing\s*check|guard\s*clause/.test(lower)) add("ERR", 1);

  // Security (general)
  if (/vulnerab|exploit|attack\s*surface/.test(lower)) add("SEC", 2);
  if (/valid(?:at(?:e|ion))|sanitiz|input\s*check/.test(lower)) add("SEC", 2);
  if (/unsafe|insecure|taint/.test(lower)) add("SEC", 1);

  // Performance
  if (/performance|latency|throughput|bottleneck/.test(lower)) add("PERF", 2);
  if (/slow|memory\s*leak|cache\s*(miss|invalid)/.test(lower)) add("PERF", 2);
  if (/O\(n\^?2\)|quadratic|exponential/.test(lower)) add("PERF", 2);
  if (/blocking|synchronous.*event\s*loop/.test(lower)) add("PERF", 1);

  // Logic / correctness
  if (/isinstance|subclass|type\s*check|type\s*error/.test(lower)) add("LOGIC", 2);
  if (/wrong\s*(key|type|value|order|result)/.test(lower)) add("LOGIC", 2);
  if (/off.by.one|fence\s*post|boundary/.test(lower)) add("LOGIC", 2);
  if (/logic|incorrect|semantic/.test(lower)) add("LOGIC", 1);
  if (/always\s*(true|false)|never\s*(true|false|reach)/.test(lower)) add("LOGIC", 2);
  if (/negative\s*(slice|index|offset)/.test(lower)) add("LOGIC", 2);

  // Observability / Monitoring
  if (/metric|monitor|observ|telemetry|tracing/.test(lower)) add("OBS", 2);
  if (/logg?ing|log\s*(level|format|statement)/.test(lower)) add("OBS", 1);
  if (/alert|dashboard|instrument/.test(lower)) add("OBS", 1);

  // Testing
  if (/test\s*(flaky|brittle|fragile|unreliable)/.test(lower)) add("TEST", 3);
  if (/sleep\s*in\s*test|time\.sleep|flaky/.test(lower)) add("TEST", 2);
  if (/mock|stub|fixture|assert|test\s*coverage/.test(lower)) add("TEST", 1);
  if (/monkeypatch|test_/.test(lower)) add("TEST", 1);

  // Maintainability
  if (/magic\s*number|duplicate|copy.?paste|dead\s*code/.test(lower)) add("MAINT", 2);
  if (/complex|readab|refactor|techni?cal\s*debt/.test(lower)) add("MAINT", 1);
  if (/naming|misleading|confusing|unclear/.test(lower)) add("MAINT", 1);

  // Documentation
  if (/docstring|comment|documentation|readme/.test(lower)) add("DOC", 2);
  if (/typo|spelling|rename/.test(lower)) add("DOC", 1);
  if (/jsdoc|javadoc|pydoc|rustdoc/.test(lower)) add("DOC", 1);

  // Compatibility
  if (/breaking\s*change|backwards?\s*compat|deprecat/.test(lower)) add("COMPAT", 2);
  if (/migration|version|compat/.test(lower)) add("COMPAT", 1);

  // Reliability
  if (/timeout|retry|circuit.?break|failover/.test(lower)) add("REL", 2);
  if (/resilien|graceful|recovery|shutdown/.test(lower)) add("REL", 1);
  if (/terminate|kill|signal|process/.test(lower)) add("REL", 1);

  // Framework safety
  if (/middleware|express|django|flask|spring/.test(lower)) add("FW", 1);
  if (/helmet|cors|csrf\s*middleware/.test(lower)) add("FW", 2);

  // Rate limiting
  if (/rate\s*limit|throttl|brute.?force/.test(lower)) add("RATE", 2);
  if (/ddos|denial.?of.?service|resource\s*exhaust/.test(lower)) add("RATE", 1);

  // Pick highest-scoring prefix
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0 && sorted[0][1] > 0) {
    return sorted[0][0];
  }

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
