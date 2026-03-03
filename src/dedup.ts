/**
 * Cross-Evaluator Deduplication
 *
 * Extracted from the evaluators monolith. Uses union-find to cluster findings
 * from different evaluators that flag the same line(s) for the same root cause,
 * keeping the highest-severity instance and annotating cross-references.
 */

import type { Finding, Severity } from "./types.js";

// ─── Severity Ranking (shared with app-builder flow) ─────────────────────────

export function severityRank(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

// ─── Topic Detection ─────────────────────────────────────────────────────────

/**
 * Known semantic topic patterns for cross-evaluator deduplication.
 * When multiple evaluators flag the same line(s) for the same root cause,
 * these patterns identify the canonical topic so duplicates can be merged.
 */
const DEDUP_TOPIC_PATTERNS: Array<[RegExp, string]> = [
  [/sql\s*inject|inject.*sql|query.*concat.*input|unsanitized.*query/i, "sql-injection"],
  [/cross.?site\s*script|\bxss\b|unsanitized.*html|\.innerHTML/i, "xss"],
  [/command\s*inject|shell\s*inject|os\s*command|exec.*inject/i, "cmd-injection"],
  [/path\s*travers|directory\s*travers/i, "path-traversal"],
  [/empty\s*catch|catch.*(?:empty|block)|error.*(?:swallow|silent|suppress|ignor)/i, "empty-catch"],
  [
    /hardcod.*(?:secret|cred|password|key|token)|(?:secret|cred|password|api.?key|token).*(?:hardcod|plain|literal|embed)/i,
    "hardcoded-secret",
  ],
  [/magic\s*(?:number|value)|unnamed\s*constant/i, "magic-number"],
  [/\bn\s*\+\s*1\b|loop.*(?:query|request|fetch)|(?:query|request|fetch).*(?:inside|within|in)\s*loop/i, "n-plus-one"],
  [/rate\s*limit|throttl/i, "rate-limiting"],
  [/input\s*(?:valid|sanitiz)|(?:valid|sanitiz).*input/i, "input-validation"],
  [/timeout/i, "timeout"],
  [/synchronous.*(?:i\/o|io|call)|blocking\s*(?:i\/o|io|call)|Sync\s*\(/i, "sync-io"],
  [/(?:insecure|weak)\s*(?:hash|crypto|algorithm|cipher)/i, "weak-crypto"],
  [/prototype\s*pollut/i, "prototype-pollution"],
  [/open\s*redirect/i, "open-redirect"],
  [/csrf|cross.?site\s*request\s*forg/i, "csrf"],
  [/(?:eval|dynamic\s*code\s*exec)/i, "code-injection"],

  // ── Cross-judge overlap patterns (v3.18.0) ────────────────────────────────
  [/deeply?\s*nest|nesting.*(?:level|depth|complex)|callback.*(?:hell|pyramid)/i, "deep-nesting"],
  [/no\s*test|test.*(?:not|without|missing)|test\s*infra/i, "missing-tests"],
  [/weak.*type|dynamic.*type|type.*(?:safe|usage)|any\s*type|untyped/i, "type-safety"],
  [/no\s*health|health\s*check|healthcheck/i, "missing-healthcheck"],
  [/no\s*lint|linting.*config|formatting.*config|eslint|prettier/i, "missing-linting"],
  [/no\s*build|build\s*script|missing.*build/i, "missing-build-script"],
  [/(?:doc|documentation).*(?:missing|without|absent|lack)/i, "missing-documentation"],
  [/error.*(?:log|report|track|monitor).*(?:missing|without|absent)/i, "missing-error-tracking"],
];

const TOPIC_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "be",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "no",
  "not",
  "but",
  "or",
  "and",
  "if",
  "it",
  "its",
  "has",
  "have",
  "had",
  "do",
  "does",
  "may",
  "can",
  "could",
  "should",
  "will",
  "use",
  "used",
  "using",
  "without",
  "missing",
  "detected",
  "found",
  "via",
  "into",
  "that",
]);

/**
 * Extract a semantic topic string from a finding's title.
 * First checks known topic patterns, then falls back to normalized title words.
 */
function extractFindingTopic(finding: Finding): string {
  const title = finding.title;
  for (const [pattern, topic] of DEDUP_TOPIC_PATTERNS) {
    if (pattern.test(title)) return topic;
  }
  // Fallback: normalize title to sorted core words
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w: string) => w.length > 2 && !TOPIC_STOP_WORDS.has(w))
    .sort()
    .join("-");
}

// ─── Union-Find Deduplication ────────────────────────────────────────────────

/**
 * Deduplicate findings across evaluators. When different judges flag the same
 * line(s) for the same root cause, keeps the highest-severity instance and
 * annotates it with cross-references to the other rule IDs.
 *
 * Uses union-find to cluster findings that share any (topic, lineNumber) pair,
 * then picks the best finding from each cluster.
 */
export function crossEvaluatorDedup(findings: Finding[]): Finding[] {
  if (findings.length <= 1) return findings;

  // Map each finding to (topic, line) keys
  const groups = new Map<string, number[]>();
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const topic = extractFindingTopic(f);

    if (f.lineNumbers && f.lineNumbers.length > 0) {
      const seen = new Set<string>();
      for (const line of f.lineNumbers) {
        const key = `${topic}:L${line}`;
        if (!seen.has(key)) {
          const group = groups.get(key) ?? [];
          group.push(i);
          groups.set(key, group);
          seen.add(key);
        }
      }
    } else {
      const key = `${topic}:noLine`;
      const group = groups.get(key) ?? [];
      group.push(i);
      groups.set(key, group);
    }
  }

  // Union-Find to merge findings sharing any (topic, line) key
  const parent = Array.from({ length: findings.length }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (const indices of groups.values()) {
    for (let j = 1; j < indices.length; j++) {
      union(indices[0], indices[j]);
    }
  }

  // Collect connected components
  const components = new Map<number, number[]>();
  for (let i = 0; i < findings.length; i++) {
    const root = find(i);
    const comp = components.get(root) ?? [];
    comp.push(i);
    components.set(root, comp);
  }

  // Pick the best finding from each component
  const result: Finding[] = [];
  for (const indices of components.values()) {
    if (indices.length === 1) {
      result.push(findings[indices[0]]);
      continue;
    }

    // Sort: severity desc → suggestedFix → confidence → description length
    const sorted = indices
      .map((i) => findings[i])
      .sort((a, b) => {
        const sevDiff = severityRank(b.severity) - severityRank(a.severity);
        if (sevDiff !== 0) return sevDiff;
        const fixDiff = (b.suggestedFix ? 1 : 0) - (a.suggestedFix ? 1 : 0);
        if (fixDiff !== 0) return fixDiff;
        const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
        if (confDiff !== 0) return confDiff;
        return b.description.length - a.description.length;
      });

    const best = { ...sorted[0] };

    // Annotate with cross-references
    const otherRuleIds = sorted.slice(1).map((f) => f.ruleId);
    best.description += `\n\n_Also identified by: ${otherRuleIds.join(", ")}_`;

    // Merge line numbers from all findings in the cluster
    const allLines = new Set<number>();
    for (const f of sorted) {
      for (const l of f.lineNumbers ?? []) allLines.add(l);
    }
    if (allLines.size > 0) {
      best.lineNumbers = [...allLines].sort((a, b) => a - b);
    }

    result.push(best);
  }

  return result;
}
