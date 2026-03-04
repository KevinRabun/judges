/**
 * Cross-Evaluator Deduplication
 *
 * Extracted from the evaluators monolith. Uses union-find to cluster findings
 * from different evaluators that flag the same line(s) for the same root cause,
 * keeping the highest-severity instance and annotating cross-references.
 *
 * Also provides cross-file deduplication for project-level analysis, merging
 * identical-topic findings across different files into single consolidated entries.
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

  // ── Additional cross-judge overlap patterns (v3.19.5) ─────────────────────
  [/api.*version|version.*api|endpoint.*version/i, "api-versioning"],
  [/pagination|paginate|without.*paginat|unbounded.*(?:data|fetch|query|result)/i, "pagination"],
  [
    /abrupt.*(?:termination|exit|shutdown)|(?:process|hard).*(?:termination|exit)|panic.*exit|process\.exit|graceful.*(?:shutdown|lifecycle)/i,
    "abrupt-termination",
  ],

  // ── Extended coverage (v3.22.0) ───────────────────────────────────────────
  // Authentication & session
  [/session\s*(?:fixation|hijack|management)|insecure.*session/i, "session-vulnerability"],
  [/auth(?:entication)?\s*bypass|bypass.*auth/i, "auth-bypass"],
  [/\bJWT\b.*(?:verif|valid|exp)|token.*expir|expired?\s*token/i, "jwt-validation"],
  [/password.*(?:plain|clear|unhash|weak)|plain.*password|bcrypt|argon2|pbkdf/i, "password-handling"],

  // Concurrency
  [/race\s*condition|data\s*race|toctou|time.*of.*check/i, "race-condition"],
  [/deadlock|dead\s*lock|circular.*(?:wait|lock)/i, "deadlock"],
  [/(?:thread|goroutine|async)\s*(?:safe|safety|unsafe)|shared\s*(?:state|mutable)/i, "thread-safety"],

  // Database & data
  [/connection\s*pool|pool.*(?:exhaust|leak|size)|max.*connect/i, "connection-pooling"],
  [/(?:missing|no)\s*(?:db\s*)?(?:transact|commit|rollback)|transact.*(?:missing|absent)/i, "missing-transaction"],
  [/(?:missing|no)\s*(?:db\s*)?(?:index|indices)|table\s*scan|full\s*scan/i, "missing-index"],
  [/(?:unescaped|unsanitized).*(?:output|render|template)|template\s*inject/i, "template-injection"],

  // Logging & privacy
  [/(?:log|print|console).*(?:sensitive|pii|credential|password|secret|token)/i, "sensitive-data-logging"],
  [/\bpii\b|personal.*(?:data|information)|data.*(?:privacy|protection)/i, "pii-exposure"],

  // Configuration & infrastructure
  [/(?:cors|cross.?origin).*(?:permissive|wildcard|\*)|allow.*origin.*\*/i, "cors-misconfiguration"],
  [
    /tls|ssl|https.*(?:missing|disabled|insecure)|(?:insecure|plain|cleartext)\s*(?:http|connect)/i,
    "insecure-transport",
  ],
  [/debug.*(?:mode|enabled|production)|(?:production|prod).*debug/i, "debug-in-production"],
  [/env(?:ironment)?\s*var.*(?:missing|unset|undefined|fallback)|missing.*env/i, "missing-env-var"],

  // Dependency & supply-chain
  [/(?:outdated|vulnerable)\s*(?:dep|package|lib)|known\s*vulnerabilit/i, "vulnerable-dependency"],
  [/unpinned.*(?:dep|version)|version.*(?:range|wildcard|\^|~)/i, "unpinned-dependency"],
  [/(?:unused|dead)\s*(?:dep|import|require|package)/i, "unused-dependency"],

  // Resource management
  [
    /(?:resource|file|handle|stream|socket)\s*leak|(?:unclosed|leaked)\s*(?:resource|file|handle|connection)/i,
    "resource-leak",
  ],
  [/memory\s*leak|(?:unbounded|growing)\s*(?:cache|queue|buffer|array)/i, "memory-leak"],

  // Error handling
  [/(?:unchecked|unhandled)\s*(?:error|exception|rejection|promise)/i, "unhandled-error"],
  [/(?:generic|bare)\s*(?:catch|except)|catch.*(?:Exception|Error)\s*[^a-z]/i, "generic-catch"],
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

  // Bridge same-known-topic findings regardless of line numbers.
  // When different evaluators flag the same conceptual issue (e.g., "rate-limiting")
  // but detect different lines (AST vs regex, or one is noLine), union them
  // so only the best finding per root cause survives.
  const knownTopics = new Set(DEDUP_TOPIC_PATTERNS.map(([, t]) => t));
  const topicBridgeGroups = new Map<string, number[]>();
  for (let i = 0; i < findings.length; i++) {
    const topic = extractFindingTopic(findings[i]);
    if (knownTopics.has(topic)) {
      const group = topicBridgeGroups.get(topic) ?? [];
      group.push(i);
      topicBridgeGroups.set(topic, group);
    }
  }
  for (const indices of topicBridgeGroups.values()) {
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

// ─── Cross-File Deduplication (Project Level) ────────────────────────────────

/**
 * Deduplicate non-absence findings across files in project-level analysis.
 *
 * When the same concrete issue (e.g., sql-injection, xss, hardcoded-secret) is
 * identified with the SAME rule ID in multiple files, the finding is likely a
 * repeated pattern rather than independent vulnerabilities. This function
 * consolidates those into a single representative finding annotated with the
 * list of affected files and combined line counts.
 *
 * Only groups findings that share BOTH a known topic AND the same ruleId.
 * Findings with fallback topics (no known-pattern match) are left as-is since
 * fallback topic collisions are unreliable.
 *
 * @param fileFindings Array of per-file findings with their source file paths
 * @returns Deduplicated findings with file-count annotations
 */
export function crossFileDedup(fileFindings: Array<{ path: string; findings: Finding[] }>): Finding[] {
  if (fileFindings.length <= 1) {
    return fileFindings.flatMap((f) => f.findings);
  }

  const knownTopics = new Set(DEDUP_TOPIC_PATTERNS.map(([, t]) => t));

  // Index: (topic + ruleId) → list of { path, finding }
  const topicRuleGroups = new Map<string, Array<{ path: string; finding: Finding }>>();
  const ungrouped: Finding[] = [];

  for (const ff of fileFindings) {
    for (const finding of ff.findings) {
      const topic = extractFindingTopic(finding);

      // Only group on known topics with a ruleId — fallback topics are too noisy
      if (knownTopics.has(topic) && finding.ruleId) {
        const key = `${topic}::${finding.ruleId}`;
        const group = topicRuleGroups.get(key) ?? [];
        group.push({ path: ff.path, finding });
        topicRuleGroups.set(key, group);
      } else {
        ungrouped.push(finding);
      }
    }
  }

  const result: Finding[] = [...ungrouped];

  for (const entries of topicRuleGroups.values()) {
    if (entries.length === 1) {
      // Single occurrence — keep as-is
      result.push(entries[0].finding);
      continue;
    }

    // Multiple files have the same topic + ruleId — consolidate
    // Sort by severity desc → confidence desc → description length desc
    const sorted = entries.sort((a, b) => {
      const sevDiff = severityRank(b.finding.severity) - severityRank(a.finding.severity);
      if (sevDiff !== 0) return sevDiff;
      const confDiff = (b.finding.confidence ?? 0) - (a.finding.confidence ?? 0);
      if (confDiff !== 0) return confDiff;
      return b.finding.description.length - a.finding.description.length;
    });

    const best = { ...sorted[0].finding };

    // Collect all affected file paths (deduplicated, sorted)
    const affectedFiles = [...new Set(sorted.map((e) => e.path))].sort();

    // Merge all line numbers (per-file line numbers aren't meaningful
    // in a cross-file context, but keep them for reference)
    const allLines = new Set<number>();
    for (const entry of sorted) {
      for (const l of entry.finding.lineNumbers ?? []) allLines.add(l);
    }
    if (allLines.size > 0) {
      best.lineNumbers = [...allLines].sort((a, b) => a - b);
    }

    // Annotate description with cross-file information
    best.description += `\n\n_Pattern repeated in ${affectedFiles.length} file(s): ${affectedFiles.join(", ")}_`;

    // Boost confidence slightly for findings confirmed across multiple files
    if (best.confidence !== undefined) {
      best.confidence = Math.min(1.0, best.confidence + 0.05 * Math.min(affectedFiles.length - 1, 3));
    }

    result.push(best);
  }

  return result;
}
