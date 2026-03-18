/**
 * Recall Booster — Additional detection patterns for weak-recall categories
 *
 * This module provides supplementary pattern detection for judge categories
 * where the deterministic evaluators have recall below 85%. It acts as
 * a second-pass augmentation applied after the primary evaluator.
 *
 * Categories strengthened (by recall gap analysis):
 * - hallucination-detection (46.2% → improved)
 * - ci-cd (41.7% → improved)
 * - internationalization (42.9% → improved)
 * - cost-effectiveness (57.1% → improved)
 * - documentation (63.6% → improved)
 * - iac-security (66.7% → improved)
 * - cloud/cloud-readiness (50-73% → improved)
 */

import type { Finding } from "../types.js";
import { getLangFamily } from "./shared.js";

// ─── Hallucination Detection Extras ──────────────────────────────────────────

const EXTRA_HALLUCINATION_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  fix: string;
  languages: string[];
}> = [
  // Python: common hallucinated built-in functions
  {
    pattern: /\bstr\.isinteger\s*\(/,
    title: "Hallucinated Python str.isinteger()",
    description: "Python str has no isinteger() method. LLMs confuse this with float.is_integer() or str.isdigit().",
    fix: "Use str.isdigit() for digit check, or float(s).is_integer() for integer check.",
    languages: ["python"],
  },
  {
    pattern: /\blist\.contains\s*\(/,
    title: "Hallucinated Python list.contains()",
    description: "Python lists have no contains() method. Use the `in` operator instead.",
    fix: "Replace `list.contains(x)` with `x in list`.",
    languages: ["python"],
  },
  {
    pattern: /\bdict\.has_key\s*\(/,
    title: "Deprecated/hallucinated dict.has_key()",
    description: "dict.has_key() was removed in Python 3. LLMs trained on mixed Python 2/3 code still generate it.",
    fix: "Use `key in dict` instead of `dict.has_key(key)`.",
    languages: ["python"],
  },
  {
    pattern: /\bimport\s+asyncio\b[\s\S]{0,200}\basyncio\.sleep_ms\s*\(/,
    title: "Hallucinated asyncio.sleep_ms()",
    description: "asyncio has no sleep_ms(). LLMs confuse this with asyncio.sleep() which takes seconds.",
    fix: "Use `await asyncio.sleep(ms / 1000)` for millisecond sleep.",
    languages: ["python"],
  },
  // Node.js: fabricated API patterns
  {
    pattern: /\bprocess\.env\.getAll\s*\(/,
    title: "Hallucinated process.env.getAll()",
    description: "Node.js process.env has no getAll() method. It's a plain object.",
    fix: "Use Object.entries(process.env) to get all environment variables.",
    languages: ["javascript", "typescript"],
  },
  {
    pattern: /\bJSON\.tryParse\s*\(/,
    title: "Hallucinated JSON.tryParse()",
    description: "JavaScript has no JSON.tryParse(). This is a common .NET/C# pattern hallucinated into JS.",
    fix: "Wrap JSON.parse() in a try/catch block for safe parsing.",
    languages: ["javascript", "typescript"],
  },
  {
    pattern: /\bArray\.flatten\s*\(/,
    title: "Hallucinated Array.flatten()",
    description: "JavaScript Array has no static flatten() method. The instance method is .flat().",
    fix: "Use `array.flat()` or `array.flat(Infinity)` for deep flattening.",
    languages: ["javascript", "typescript"],
  },
  // Go: common hallucinations
  {
    pattern: /\bstrings\.Reverse\s*\(/,
    title: "Hallucinated strings.Reverse()",
    description: "Go strings package has no Reverse function. LLMs frequently hallucinate this.",
    fix: "Implement string reversal manually using rune conversion: []rune(s).",
    languages: ["go"],
  },
  {
    pattern: /\berrors\.Wrapf?\s*\(/,
    title: "Hallucinated errors.Wrap()",
    description: "Go standard errors package has no Wrap function. This was from pkg/errors (deprecated).",
    fix: 'Use fmt.Errorf("%w", err) for error wrapping (Go 1.13+).',
    languages: ["go"],
  },
  // Rust: hallucinated trait methods
  {
    pattern: /\.to_str\(\)\s*\.unwrap\(\)/,
    title: "Potentially hallucinated .to_str().unwrap() chain",
    description:
      "LLMs frequently chain .to_str().unwrap() on types that don't implement to_str(). Verify the type has this method.",
    fix: "Consider using .to_string() or .as_str() depending on the actual type.",
    languages: ["rust"],
  },
  // Java: hallucinated APIs
  {
    pattern: /\bString\.isEmpty\s*\(\s*\w+\s*\)/,
    title: "Hallucinated static String.isEmpty()",
    description: "Java String.isEmpty() is an instance method, not static. LLMs sometimes generate static calls.",
    fix: "Use `str.isEmpty()` as an instance method call.",
    languages: ["java"],
  },
];

// ─── CI/CD Detection Extras ──────────────────────────────────────────────────

const EXTRA_CICD_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  languages: string[];
}> = [
  {
    pattern: /\bpipeline\b[\s\S]{0,100}checkout:\s*none/i,
    title: "Pipeline skips source checkout",
    description: "CI pipeline configured to skip source checkout. This may indicate a misconfiguration.",
    languages: ["yaml"],
  },
  {
    pattern: /\bcurl\b[\s\S]{0,50}\|\s*(?:bash|sh)\b/,
    title: "Piping curl to shell in CI",
    description: "Downloading and directly executing scripts via curl|bash is a supply-chain risk in CI/CD pipelines.",
    languages: ["yaml", "bash", "dockerfile"],
  },
  {
    pattern: /\b(?:npm|pip|cargo)\s+install\b[\s\S]{0,30}--no-verify/i,
    title: "Package install with verification disabled",
    description: "Installing packages with verification disabled weakens supply-chain integrity in CI.",
    languages: ["yaml", "bash", "dockerfile"],
  },
  {
    pattern: /\bsudo\s+.*\b(?:chmod\s+777|chmod\s+a\+rwx)\b/,
    title: "Overly permissive chmod in CI script",
    description: "Setting 777 permissions in CI/CD scripts creates security risks on shared runners.",
    languages: ["yaml", "bash"],
  },
];

// ─── Internationalization Detection Extras ────────────────────────────────────

const EXTRA_I18N_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  languages: string[];
}> = [
  {
    pattern: /\.toLocaleDateString\s*\(\s*\)/,
    title: "toLocaleDateString() without explicit locale",
    description:
      "Calling toLocaleDateString() without a locale parameter uses the system default, producing inconsistent date formats across environments.",
    languages: ["javascript", "typescript"],
  },
  {
    pattern: /new\s+Intl\.NumberFormat\s*\(\s*\)/,
    title: "Intl.NumberFormat without explicit locale",
    description: "Creating NumberFormat without a locale uses system default, inconsistent across deployments.",
    languages: ["javascript", "typescript"],
  },
  {
    pattern: /\bcurrency\s*[:=]\s*["'](?:USD|EUR|GBP)["'][\s\S]{0,100}(?:format|display|render)/i,
    title: "Hardcoded currency code",
    description: "Currency code is hardcoded rather than derived from user locale or configuration.",
    languages: ["javascript", "typescript", "python", "java"],
  },
  {
    pattern: /\.(?:trim|split|substring)\([\s\S]{0,30}(?:first|last)\s*name/i,
    title: "Culturally-biased name parsing",
    description:
      "Splitting names into first/last assumes Western naming conventions. Many cultures use single names, family-name-first order, or multiple name components.",
    languages: ["javascript", "typescript", "python", "java", "csharp"],
  },
];

// ─── Cost-Effectiveness Detection Extras ─────────────────────────────────────

const EXTRA_COST_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  languages: string[];
}> = [
  {
    pattern: /\bnew\s+Date\(\)[\s\S]{0,30}while\s*\(/,
    title: "Busy-wait loop with Date() polling",
    description: "Busy-wait loops waste CPU cycles and increase compute costs. Use async timers instead.",
    languages: ["javascript", "typescript"],
  },
  {
    pattern: /\bsetInterval\s*\([^,]+,\s*(?:100|50|10|1)\s*\)/,
    title: "Very frequent interval (≤100ms)",
    description:
      "Very frequent setInterval polling wastes CPU/battery. Consider event-driven approaches or longer intervals.",
    languages: ["javascript", "typescript"],
  },
  {
    pattern: /SELECT\s+\*\s+FROM[\s\S]{0,50}(?:JOIN|,\s*\w+)/i,
    title: "SELECT * with JOINs",
    description:
      "Using SELECT * with JOINs retrieves all columns from all joined tables, significantly increasing data transfer and memory costs.",
    languages: ["sql", "python", "javascript", "typescript", "java", "csharp"],
  },
  {
    pattern: /\.(?:map|forEach|filter)\s*\([\s\S]{0,100}\.(?:map|forEach|filter)\s*\(/,
    title: "Nested array iterations",
    description:
      "Chained .map/.filter/.forEach calls iterate the array multiple times. Consider combining into a single pass with .reduce().",
    languages: ["javascript", "typescript"],
  },
];

// ─── IaC Security Extras ─────────────────────────────────────────────────────

const EXTRA_IAC_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  languages: string[];
}> = [
  {
    pattern: /\bpublic_network_access_enabled\s*=\s*true/i,
    title: "Public network access enabled on Azure resource",
    description: "Enabling public network access exposes the resource to the internet. Use private endpoints instead.",
    languages: ["terraform", "bicep"],
  },
  {
    pattern: /\bingress\b[\s\S]{0,100}\bcidr_blocks\s*=\s*\[\s*["']0\.0\.0\.0\/0["']\s*\]/,
    title: "Security group allows all inbound traffic (0.0.0.0/0)",
    description: "Ingress rule allows traffic from any IP. Restrict to specific CIDR ranges.",
    languages: ["terraform"],
  },
  {
    pattern: /\bsku\b[\s\S]{0,30}(?:Basic|Free)\b/i,
    title: "Using Basic/Free SKU in production IaC",
    description:
      "Basic/Free tier SKUs often lack security features like encryption, private endpoints, and SLA guarantees.",
    languages: ["terraform", "bicep", "arm"],
  },
  {
    pattern: /\bretention_in_days\s*[:=]\s*(?:0|1|7)\b/,
    title: "Short log retention period",
    description:
      "Log retention of 7 days or less may be insufficient for security investigation and compliance requirements.",
    languages: ["terraform", "bicep"],
  },
];

// ─── Documentation Detection Extras ──────────────────────────────────────────

const EXTRA_DOC_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  languages: string[];
}> = [
  {
    pattern: /(?:TODO|FIXME|HACK|XXX|TEMP)\s*[:!]/i,
    title: "Unresolved TODO/FIXME/HACK comment",
    description:
      "Code contains unresolved TODO/FIXME/HACK markers indicating incomplete implementation or known issues.",
    languages: ["javascript", "typescript", "python", "java", "csharp", "go", "rust", "ruby", "php"],
  },
  {
    pattern: /export\s+(?:default\s+)?(?:function|class|const)\s+\w+[\s\S]{0,50}\{[\s\S]{50,}(?:throw|return|if)\b/,
    title: "Complex exported function without JSDoc/docstring",
    description:
      "Public API function with complex logic lacks documentation. This makes the API hard to use correctly.",
    languages: ["javascript", "typescript"],
  },
];

// ─── Cloud Readiness Extras ──────────────────────────────────────────────────

const EXTRA_CLOUD_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  languages: string[];
}> = [
  {
    pattern: /\bfs\.(?:writeFileSync|appendFileSync)\s*\(\s*["']\/(?:tmp|var|data)\//,
    title: "Writing to local filesystem path",
    description:
      "Writing to local filesystem paths (/tmp, /var, /data) is not reliable in containerized or serverless environments. Use object storage or managed databases.",
    languages: ["javascript", "typescript"],
  },
  {
    pattern: /\bopen\s*\(\s*["']\/(?:tmp|var|data)\//,
    title: "Writing to local filesystem path",
    description: "Writing to local filesystem paths is not reliable in cloud/container environments.",
    languages: ["python"],
  },
  {
    pattern: /\b(?:127\.0\.0\.1|localhost)\b[\s\S]{0,30}(?:connect|host|url|endpoint)/i,
    title: "Hardcoded localhost reference",
    description:
      "Hardcoded localhost/127.0.0.1 references will fail in containerized deployments where services run on separate hosts.",
    languages: ["javascript", "typescript", "python", "java", "go", "csharp"],
  },
];

// ─── Main Recall Boost Function ──────────────────────────────────────────────

interface BoostResult {
  findings: Finding[];
  boostedCategories: string[];
}

/**
 * Apply recall-boosting patterns to detect issues that primary evaluators miss.
 * Returns additional findings (does not modify existing ones).
 */
export function applyRecallBoost(code: string, language: string): BoostResult {
  const lang = getLangFamily(language);
  const findings: Finding[] = [];
  const boostedCategories: string[] = [];
  const lines = code.split("\n");

  function getMatchLines(pattern: RegExp): number[] {
    const matched: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) matched.push(i + 1);
      pattern.lastIndex = 0;
    }
    return matched;
  }

  // Hallucination boost
  let halluNum = 900;
  for (const p of EXTRA_HALLUCINATION_PATTERNS) {
    if (!p.languages.includes(lang)) continue;
    const matchLines = getMatchLines(p.pattern);
    if (matchLines.length > 0) {
      if (!boostedCategories.includes("hallucination-detection")) boostedCategories.push("hallucination-detection");
      findings.push({
        ruleId: `HALLU-${String(halluNum++).padStart(3, "0")}`,
        severity: "high",
        title: p.title,
        description: p.description,
        lineNumbers: matchLines,
        recommendation: p.fix,
        reference: "AI Code Generation: Hallucinated API Detection",
        confidence: 0.85,
        provenance: "regex-pattern-match",
      });
    }
  }

  // CI/CD boost
  let cicdNum = 900;
  for (const p of EXTRA_CICD_PATTERNS) {
    if (!p.languages.includes(lang)) continue;
    if (p.pattern.test(code)) {
      if (!boostedCategories.includes("ci-cd")) boostedCategories.push("ci-cd");
      findings.push({
        ruleId: `CICD-${String(cicdNum++).padStart(3, "0")}`,
        severity: "medium",
        title: p.title,
        description: p.description,
        lineNumbers: getMatchLines(p.pattern),
        recommendation: "Review and remediate this CI/CD configuration issue.",
        confidence: 0.75,
        provenance: "regex-pattern-match",
      });
    }
  }

  // I18N boost
  let i18nNum = 900;
  for (const p of EXTRA_I18N_PATTERNS) {
    if (!p.languages.includes(lang)) continue;
    const matchLines = getMatchLines(p.pattern);
    if (matchLines.length > 0) {
      if (!boostedCategories.includes("internationalization")) boostedCategories.push("internationalization");
      findings.push({
        ruleId: `I18N-${String(i18nNum++).padStart(3, "0")}`,
        severity: "medium",
        title: p.title,
        description: p.description,
        lineNumbers: matchLines,
        recommendation: "Ensure locale-awareness for international users.",
        confidence: 0.7,
        provenance: "regex-pattern-match",
      });
    }
  }

  // Cost-effectiveness boost
  let costNum = 900;
  for (const p of EXTRA_COST_PATTERNS) {
    if (!p.languages.includes(lang)) continue;
    if (p.pattern.test(code)) {
      if (!boostedCategories.includes("cost-effectiveness")) boostedCategories.push("cost-effectiveness");
      findings.push({
        ruleId: `COST-${String(costNum++).padStart(3, "0")}`,
        severity: "medium",
        title: p.title,
        description: p.description,
        lineNumbers: getMatchLines(p.pattern),
        recommendation: "Consider more cost-efficient alternatives.",
        confidence: 0.75,
        provenance: "regex-pattern-match",
      });
    }
  }

  // IaC security boost
  let iacNum = 900;
  for (const p of EXTRA_IAC_PATTERNS) {
    if (!p.languages.includes(lang)) continue;
    if (p.pattern.test(code)) {
      if (!boostedCategories.includes("iac-security")) boostedCategories.push("iac-security");
      findings.push({
        ruleId: `IAC-${String(iacNum++).padStart(3, "0")}`,
        severity: "high",
        title: p.title,
        description: p.description,
        lineNumbers: getMatchLines(p.pattern),
        recommendation: "Apply infrastructure security best practices.",
        confidence: 0.8,
        provenance: "regex-pattern-match",
      });
    }
  }

  // Documentation boost
  let docNum = 900;
  for (const p of EXTRA_DOC_PATTERNS) {
    if (!p.languages.includes(lang)) continue;
    if (p.pattern.test(code)) {
      if (!boostedCategories.includes("documentation")) boostedCategories.push("documentation");
      findings.push({
        ruleId: `DOC-${String(docNum++).padStart(3, "0")}`,
        severity: "low",
        title: p.title,
        description: p.description,
        lineNumbers: getMatchLines(p.pattern),
        recommendation: "Improve documentation for maintainability.",
        confidence: 0.7,
        provenance: "regex-pattern-match",
      });
    }
  }

  // Cloud readiness boost
  let cloudNum = 900;
  for (const p of EXTRA_CLOUD_PATTERNS) {
    if (!p.languages.includes(lang)) continue;
    if (p.pattern.test(code)) {
      if (!boostedCategories.includes("cloud-readiness")) boostedCategories.push("cloud-readiness");
      findings.push({
        ruleId: `CLOUD-${String(cloudNum++).padStart(3, "0")}`,
        severity: "medium",
        title: p.title,
        description: p.description,
        lineNumbers: getMatchLines(p.pattern),
        recommendation: "Design for cloud-native deployment.",
        confidence: 0.75,
        provenance: "regex-pattern-match",
      });
    }
  }

  return { findings, boostedCategories };
}
