/**
 * CWE / OWASP Rule Mapping — Structured Security Identifiers
 *
 * Maps rule prefixes and specific rule IDs to CWE and OWASP identifiers.
 * These are attached to findings so downstream tools (SARIF viewers,
 * compliance dashboards, etc.) can cross-reference industry standards.
 */

import type { Finding } from "./types.js";

// ─── Mapping Tables ─────────────────────────────────────────────────────────

interface SecurityMapping {
  cweIds?: string[];
  owaspIds?: string[];
  learnMoreUrl?: string;
}

/**
 * Prefix-level mappings — applies to all rules under a judge.
 */
const PREFIX_MAP: Record<string, SecurityMapping> = {
  SEC: {
    cweIds: ["CWE-79", "CWE-89"],
    owaspIds: ["A03:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A03_2021-Injection/",
  },
  AUTH: {
    cweIds: ["CWE-287", "CWE-798"],
    owaspIds: ["A07:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/",
  },
  CRYPTO: {
    cweIds: ["CWE-327", "CWE-328"],
    owaspIds: ["A02:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A02_2021-Cryptographic_Failures/",
  },
  DATA: {
    cweIds: ["CWE-200", "CWE-312", "CWE-798"],
    owaspIds: ["A02:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A02_2021-Cryptographic_Failures/",
  },
  CYBER: {
    cweIds: ["CWE-284", "CWE-269"],
    owaspIds: ["A01:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/",
  },
  INJ: {
    cweIds: ["CWE-89", "CWE-78"],
    owaspIds: ["A03:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A03_2021-Injection/",
  },
  XSS: {
    cweIds: ["CWE-79"],
    owaspIds: ["A03:2021"],
    learnMoreUrl: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
  },
  SSRF: {
    cweIds: ["CWE-918"],
    owaspIds: ["A10:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/",
  },
  DB: {
    cweIds: ["CWE-89", "CWE-943"],
    owaspIds: ["A03:2021"],
    learnMoreUrl: "https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html",
  },
  CFG: {
    cweIds: ["CWE-16", "CWE-1188"],
    owaspIds: ["A05:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/",
  },
  RATE: {
    cweIds: ["CWE-770"],
    owaspIds: ["A04:2021"],
    learnMoreUrl: "https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html",
  },
  LOGPRIV: {
    cweIds: ["CWE-532", "CWE-117"],
    owaspIds: ["A09:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/",
  },
  COMP: {
    cweIds: ["CWE-1059"],
    owaspIds: ["A04:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A04_2021-Insecure_Design/",
  },
  DEPS: {
    cweIds: ["CWE-1104"],
    owaspIds: ["A06:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/",
  },
  ERR: {
    cweIds: ["CWE-209", "CWE-755"],
    learnMoreUrl: "https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html",
  },
  SOV: {
    learnMoreUrl: "https://gdpr-info.eu/art-44-gdpr/",
  },
  PERF: {
    learnMoreUrl: "https://web.dev/performance/",
  },
  A11Y: {
    learnMoreUrl: "https://www.w3.org/WAI/standards-guidelines/wcag/",
  },
  DOC: {
    learnMoreUrl: "https://jsdoc.app/",
  },
  TEST: {
    learnMoreUrl: "https://martinfowler.com/articles/practical-test-pyramid.html",
  },
  API: {
    learnMoreUrl: "https://swagger.io/resources/articles/best-practices-in-api-design/",
  },
  SCALE: {
    learnMoreUrl: "https://12factor.net/",
  },
  REL: {
    learnMoreUrl: "https://sre.google/sre-book/table-of-contents/",
  },
  OBS: {
    learnMoreUrl: "https://opentelemetry.io/docs/",
  },
  MAINT: {
    learnMoreUrl: "https://refactoring.guru/refactoring",
  },
  CONC: {
    cweIds: ["CWE-362", "CWE-667"],
    learnMoreUrl: "https://cheatsheetseries.owasp.org/cheatsheets/Race_Conditions_Cheat_Sheet.html",
  },
  STRUCT: {
    learnMoreUrl: "https://refactoring.guru/refactoring/smells",
  },
  I18N: {
    learnMoreUrl:
      "https://developer.mozilla.org/en-US/docs/Mozilla/Localization/Web_Localizability/Creating_localizable_web_applications",
  },
  CLOUD: {
    learnMoreUrl: "https://12factor.net/",
  },
  COST: {
    learnMoreUrl: "https://aws.amazon.com/architecture/cost-optimization/",
  },
  CACHE: {
    learnMoreUrl: "https://redis.io/docs/manual/client-side-caching/",
  },
  COMPAT: {
    learnMoreUrl: "https://semver.org/",
  },
  CICD: {
    learnMoreUrl: "https://docs.github.com/en/actions",
  },
  PORTA: {
    learnMoreUrl: "https://12factor.net/dev-prod-parity",
  },
  UX: {
    learnMoreUrl: "https://www.nngroup.com/articles/usability-heuristics/",
  },
  ETHICS: {
    learnMoreUrl: "https://www.microsoft.com/en-us/ai/responsible-ai",
  },
  AGENT: {
    learnMoreUrl:
      "https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot",
  },
  AICS: {
    owaspIds: ["OWASP-AI-Security"],
    learnMoreUrl: "https://owasp.org/www-project-ai-security-and-privacy-guide/",
  },
  IAC: {
    cweIds: ["CWE-1004"],
    learnMoreUrl: "https://cheatsheetseries.owasp.org/cheatsheets/Infrastructure_as_Code_Security_Cheat_Sheet.html",
  },
  INTENT: {
    learnMoreUrl: "https://docs.github.com/en/copilot/using-github-copilot/best-practices-for-using-github-copilot",
  },
  DSEC: {
    cweIds: ["CWE-1104"],
    owaspIds: ["A06:2021"],
    learnMoreUrl: "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/",
  },
  HALLU: {
    learnMoreUrl: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
  },
  COH: {
    learnMoreUrl: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
  },
  MFPR: {
    learnMoreUrl: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
  },
};

/**
 * Rule-specific overrides — more precise than prefix-level mappings.
 */
const RULE_MAP: Record<string, SecurityMapping> = {
  "SEC-001": { cweIds: ["CWE-89"], owaspIds: ["A03:2021"] },
  "SEC-002": { cweIds: ["CWE-78"], owaspIds: ["A03:2021"] },
  "SEC-003": { cweIds: ["CWE-79"], owaspIds: ["A03:2021"] },
  "AUTH-001": { cweIds: ["CWE-798"], owaspIds: ["A07:2021"] },
  "AUTH-002": { cweIds: ["CWE-287"], owaspIds: ["A07:2021"] },
  "AUTH-003": { cweIds: ["CWE-257"], owaspIds: ["A07:2021"] },
  "DATA-001": { cweIds: ["CWE-312", "CWE-798"], owaspIds: ["A02:2021"] },
  "DATA-002": { cweIds: ["CWE-200"], owaspIds: ["A01:2021"] },
  "CYBER-001": { cweIds: ["CWE-78"], owaspIds: ["A03:2021"] },
  "CYBER-002": { cweIds: ["CWE-94"], owaspIds: ["A03:2021"] },
  "CYBER-003": { cweIds: ["CWE-502"], owaspIds: ["A08:2021"] },
  "CYBER-004": { cweIds: ["CWE-327"], owaspIds: ["A02:2021"] },
  "DB-001": { cweIds: ["CWE-89"], owaspIds: ["A03:2021"] },
  "DB-002": { cweIds: ["CWE-798"], owaspIds: ["A07:2021"] },
  "CFG-001": { cweIds: ["CWE-798"], owaspIds: ["A07:2021"] },
  "CFG-002": { cweIds: ["CWE-16"], owaspIds: ["A05:2021"] },
  "LOGPRIV-001": { cweIds: ["CWE-532"], owaspIds: ["A09:2021"] },
  "LOGPRIV-002": { cweIds: ["CWE-117"], owaspIds: ["A09:2021"] },
  "ERR-001": { cweIds: ["CWE-209"] },
  "ERR-002": { cweIds: ["CWE-755"] },
  "CONC-001": { cweIds: ["CWE-362"] },
  "CONC-002": { cweIds: ["CWE-667"] },
  "RATE-001": { cweIds: ["CWE-770"], owaspIds: ["A04:2021"] },
};

// ─── Enrichment Function ────────────────────────────────────────────────────

/**
 * Enrich findings with structured CWE/OWASP IDs and Learn More URLs.
 * Non-mutating — returns a new array of enriched findings.
 */
export function enrichWithSecurityIds(findings: Finding[]): Finding[] {
  return findings.map((f) => {
    const prefix = f.ruleId.replace(/-\d+$/, "");
    const ruleMapping = RULE_MAP[f.ruleId];
    const prefixMapping = PREFIX_MAP[prefix];

    const cweIds = ruleMapping?.cweIds ?? prefixMapping?.cweIds;
    const owaspIds = ruleMapping?.owaspIds ?? prefixMapping?.owaspIds;
    const learnMoreUrl = ruleMapping?.learnMoreUrl ?? prefixMapping?.learnMoreUrl;

    if (!cweIds && !owaspIds && !learnMoreUrl) return f;

    return {
      ...f,
      ...(cweIds && !f.cweIds ? { cweIds } : {}),
      ...(owaspIds && !f.owaspIds ? { owaspIds } : {}),
      ...(learnMoreUrl && !f.learnMoreUrl ? { learnMoreUrl } : {}),
    };
  });
}

/**
 * Get the security mapping for a specific rule or prefix.
 */
export function getSecurityMapping(ruleId: string): SecurityMapping | undefined {
  const ruleMapping = RULE_MAP[ruleId];
  if (ruleMapping) return ruleMapping;
  const prefix = ruleId.replace(/-\d+$/, "");
  return PREFIX_MAP[prefix];
}
