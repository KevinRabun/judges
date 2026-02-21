// ─── Evaluators Module ───────────────────────────────────────────────────────
// Re-exports the evaluation engine: analyser routing, scoring, formatting.
// ──────────────────────────────────────────────────────────────────────────────

import {
  JudgeDefinition,
  JudgeEvaluation,
  TribunalVerdict,
  ProjectVerdict,
  DiffVerdict,
  DependencyVerdict,
  DependencyEntry,
  Finding,
  Verdict,
  Severity,
  AppBuilderWorkflowResult,
  PlainLanguageFinding,
  WorkflowTask,
} from "../types.js";
import { JUDGES } from "../judges/index.js";

// ─── Shared Utilities ────────────────────────────────────────────────────────
import {
  calculateScore,
  deriveVerdict,
  buildSummary,
  buildTribunalSummary,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "./shared.js";

// ─── Individual Analyzers ────────────────────────────────────────────────────
import { analyzeDataSecurity } from "./data-security.js";
import { analyzeCybersecurity } from "./cybersecurity.js";
import { analyzeCostEffectiveness } from "./cost-effectiveness.js";
import { analyzeScalability } from "./scalability.js";
import { analyzeCloudReadiness } from "./cloud-readiness.js";
import { analyzeSoftwarePractices } from "./software-practices.js";
import { analyzeAccessibility } from "./accessibility.js";
import { analyzeApiDesign } from "./api-design.js";
import { analyzeReliability } from "./reliability.js";
import { analyzeObservability } from "./observability.js";
import { analyzePerformance } from "./performance.js";
import { analyzeCompliance } from "./compliance.js";
import { analyzeDataSovereignty } from "./data-sovereignty.js";
import { analyzeTesting } from "./testing.js";
import { analyzeDocumentation } from "./documentation.js";
import { analyzeInternationalization } from "./internationalization.js";
import { analyzeDependencyHealth } from "./dependency-health.js";
import { analyzeConcurrency } from "./concurrency.js";
import { analyzeEthicsBias } from "./ethics-bias.js";
import { analyzeMaintainability } from "./maintainability.js";
import { analyzeErrorHandling } from "./error-handling.js";
import { analyzeAuthentication } from "./authentication.js";
import { analyzeDatabase } from "./database.js";
import { analyzeCaching } from "./caching.js";
import { analyzeConfigurationManagement } from "./configuration-management.js";
import { analyzeBackwardsCompatibility } from "./backwards-compatibility.js";
import { analyzePortability } from "./portability.js";
import { analyzeUx } from "./ux.js";
import { analyzeLoggingPrivacy } from "./logging-privacy.js";
import { analyzeRateLimiting } from "./rate-limiting.js";
import { analyzeCiCd } from "./ci-cd.js";
import { analyzeCodeStructure } from "./code-structure.js";
import { analyzeAgentInstructions } from "./agent-instructions.js";

// ─── Evaluation Engine ──────────────────────────────────────────────────────

/**
 * Run a single judge against the provided code.
 */
export function evaluateWithJudge(
  judge: JudgeDefinition,
  code: string,
  language: string,
  context?: string
): JudgeEvaluation {
  const findings: Finding[] = [];

  switch (judge.id) {
    case "data-security":
      findings.push(...analyzeDataSecurity(code, language));
      break;
    case "cybersecurity":
      findings.push(...analyzeCybersecurity(code, language));
      break;
    case "cost-effectiveness":
      findings.push(...analyzeCostEffectiveness(code, language));
      break;
    case "scalability":
      findings.push(...analyzeScalability(code, language));
      break;
    case "cloud-readiness":
      findings.push(...analyzeCloudReadiness(code, language));
      break;
    case "software-practices":
      findings.push(...analyzeSoftwarePractices(code, language));
      break;
    case "accessibility":
      findings.push(...analyzeAccessibility(code, language));
      break;
    case "api-design":
      findings.push(...analyzeApiDesign(code, language));
      break;
    case "reliability":
      findings.push(...analyzeReliability(code, language));
      break;
    case "observability":
      findings.push(...analyzeObservability(code, language));
      break;
    case "performance":
      findings.push(...analyzePerformance(code, language));
      break;
    case "compliance":
      findings.push(...analyzeCompliance(code, language));
      break;
    case "data-sovereignty":
      findings.push(...analyzeDataSovereignty(code, language));
      break;
    case "testing":
      findings.push(...analyzeTesting(code, language));
      break;
    case "documentation":
      findings.push(...analyzeDocumentation(code, language));
      break;
    case "internationalization":
      findings.push(...analyzeInternationalization(code, language));
      break;
    case "dependency-health":
      findings.push(...analyzeDependencyHealth(code, language));
      break;
    case "concurrency":
      findings.push(...analyzeConcurrency(code, language));
      break;
    case "ethics-bias":
      findings.push(...analyzeEthicsBias(code, language));
      break;
    case "maintainability":
      findings.push(...analyzeMaintainability(code, language));
      break;
    case "error-handling":
      findings.push(...analyzeErrorHandling(code, language));
      break;
    case "authentication":
      findings.push(...analyzeAuthentication(code, language));
      break;
    case "database":
      findings.push(...analyzeDatabase(code, language));
      break;
    case "caching":
      findings.push(...analyzeCaching(code, language));
      break;
    case "configuration-management":
      findings.push(...analyzeConfigurationManagement(code, language));
      break;
    case "backwards-compatibility":
      findings.push(...analyzeBackwardsCompatibility(code, language));
      break;
    case "portability":
      findings.push(...analyzePortability(code, language));
      break;
    case "ux":
      findings.push(...analyzeUx(code, language));
      break;
    case "logging-privacy":
      findings.push(...analyzeLoggingPrivacy(code, language));
      break;
    case "rate-limiting":
      findings.push(...analyzeRateLimiting(code, language));
      break;
    case "ci-cd":
      findings.push(...analyzeCiCd(code, language));
      break;
    case "code-structure":
      findings.push(...analyzeCodeStructure(code, language));
      break;
    case "agent-instructions":
      findings.push(...analyzeAgentInstructions(code, language));
      break;
  }

  const score = calculateScore(findings);
  const verdict = deriveVerdict(findings, score);
  const summary = buildSummary(judge, findings, score, verdict);

  return {
    judgeId: judge.id,
    judgeName: judge.name,
    verdict,
    score,
    summary,
    findings,
  };
}

/**
 * Run the full tribunal — all judges evaluate the code.
 */
export function evaluateWithTribunal(
  code: string,
  language: string,
  context?: string
): TribunalVerdict {
  const evaluations = JUDGES.map((judge) =>
    evaluateWithJudge(judge, code, language, context)
  );

  const overallScore = Math.round(
    evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length
  );

  const overallVerdict: Verdict = evaluations.some((e) => e.verdict === "fail")
    ? "fail"
    : evaluations.some((e) => e.verdict === "warning")
    ? "warning"
    : "pass";

  const allFindings = evaluations.flatMap((e) => e.findings);
  const criticalCount = allFindings.filter(
    (f) => f.severity === "critical"
  ).length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  const summary = buildTribunalSummary(
    evaluations,
    overallVerdict,
    overallScore,
    criticalCount,
    highCount
  );

  return {
    overallVerdict,
    overallScore,
    summary,
    evaluations,
    criticalCount,
    highCount,
    timestamp: new Date().toISOString(),
  };
}

// ─── Project-level Multi-file Analysis ────────────────────────────────────────

/**
 * Evaluate multiple files as a project. Runs the full tribunal on each file,
 * then detects cross-file architectural issues.
 */
export function evaluateProject(
  files: Array<{ path: string; content: string; language: string }>,
  context?: string
): ProjectVerdict {
  // Per-file evaluations
  const fileResults = files.map((f) => {
    const verdict = evaluateWithTribunal(f.content, f.language, context);
    return {
      path: f.path,
      language: f.language,
      findings: verdict.evaluations.flatMap((e) => e.findings),
      score: verdict.overallScore,
    };
  });

  // Cross-file architectural findings
  const architecturalFindings: Finding[] = [];
  const allCode = files.map((f) => f.content).join("\n");
  let archRule = 1;

  // Check for duplicated logic across files
  const functionDefs = new Map<string, string[]>();
  for (const f of files) {
    const fns = f.content.match(/(?:function|def|fn|func)\s+(\w+)/g) ?? [];
    for (const fn of fns) {
      const name = fn.replace(/(?:function|def|fn|func)\s+/, "");
      const paths = functionDefs.get(name) ?? [];
      paths.push(f.path);
      functionDefs.set(name, paths);
    }
  }
  const duplicated = [...functionDefs.entries()].filter(
    ([, paths]) => paths.length > 1
  );
  if (duplicated.length > 0) {
    architecturalFindings.push({
      ruleId: `ARCH-${String(archRule++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potentially duplicated function names across files",
      description: `Functions with identical names found in multiple files: ${duplicated.slice(0, 5).map(([name, paths]) => `${name} (${paths.join(", ")})`).join("; ")}. This may indicate code duplication.`,
      recommendation:
        "Extract shared logic into a common module and import it where needed.",
    });
  }

  // Check for inconsistent error handling patterns
  const errorPatterns = files.map((f) => ({
    path: f.path,
    hasTryCatch: /try\s*\{/.test(f.content),
    hasResultType: /Result<|Result\(|Either/.test(f.content),
    hasExceptions: /throw\s+new|raise\s+|panic!/.test(f.content),
  }));
  const distinctPatterns = new Set(
    errorPatterns.map((e) =>
      [e.hasTryCatch, e.hasResultType, e.hasExceptions].toString()
    )
  );
  if (distinctPatterns.size > 1 && files.length > 2) {
    architecturalFindings.push({
      ruleId: `ARCH-${String(archRule++).padStart(3, "0")}`,
      severity: "low",
      title: "Inconsistent error handling patterns across files",
      description:
        "Different files use different error handling approaches (try/catch vs Result types vs raw throws). This makes the codebase harder to reason about.",
      recommendation:
        "Standardize on a single error handling strategy across the project.",
    });
  }

  // Check for circular-looking dependency indicators
  const importMap = new Map<string, string[]>();
  for (const f of files) {
    const imports =
      f.content.match(
        /(?:import|from|require)\s*[\s(]['"]\.{1,2}\/([^'"]+)['"]/g
      ) ?? [];
    importMap.set(
      f.path,
      imports.map((i) => i.replace(/.*['"]\.{1,2}\/([^'"]+)['"].*/, "$1"))
    );
  }

  // Overall scores
  const allFindings = fileResults.flatMap((f) => f.findings);
  const crossFindings = [...allFindings, ...architecturalFindings];
  const overallScore =
    fileResults.length > 0
      ? Math.round(
          fileResults.reduce((sum, f) => sum + f.score, 0) /
            fileResults.length
        )
      : 100;

  const criticalCount = crossFindings.filter(
    (f) => f.severity === "critical"
  ).length;
  const highCount = crossFindings.filter((f) => f.severity === "high").length;

  const overallVerdict: Verdict =
    criticalCount > 0 || overallScore < 60
      ? "fail"
      : highCount > 0 || overallScore < 80
      ? "warning"
      : "pass";

  const summary = `Project analysis: ${files.length} files, ${crossFindings.length} findings, score ${overallScore}/100 — ${overallVerdict.toUpperCase()}`;

  return {
    overallVerdict,
    overallScore,
    summary,
    evaluations: [],
    criticalCount,
    highCount,
    timestamp: new Date().toISOString(),
    fileResults,
    architecturalFindings,
  };
}

// ─── Diff-based Incremental Analysis ──────────────────────────────────────────

/**
 * Evaluate only the changed lines in a diff. Runs the full tribunal on the
 * new code but filters findings to only those affecting changed line ranges.
 */
export function evaluateDiff(
  code: string,
  language: string,
  changedLines: number[],
  context?: string
): DiffVerdict {
  const verdict = evaluateWithTribunal(code, language, context);
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);

  // Filter findings to only those touching changed lines
  const changedSet = new Set(changedLines);
  const diffFindings = allFindings.filter((f) => {
    if (!f.lineNumbers || f.lineNumbers.length === 0) return false;
    return f.lineNumbers.some((ln) => changedSet.has(ln));
  });

  const score = calculateScore(diffFindings);
  const diffVerdict = deriveVerdict(diffFindings, score);

  return {
    linesAnalyzed: changedLines.length,
    findings: diffFindings,
    score,
    verdict: diffVerdict,
    summary: `Diff analysis: ${changedLines.length} changed lines, ${diffFindings.length} findings in changed code, score ${score}/100 — ${diffVerdict.toUpperCase()}`,
  };
}

// ─── Dependency / Supply-chain Analysis ───────────────────────────────────────

/**
 * Parse a manifest file and analyze dependencies for supply-chain risks.
 */
export function analyzeDependencies(
  manifest: string,
  manifestType: string
): DependencyVerdict {
  const dependencies: DependencyEntry[] = [];
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "SUPPLY";

  // Parse manifest based on type
  if (manifestType === "package.json") {
    try {
      const pkg = JSON.parse(manifest);
      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        dependencies.push({
          name,
          version: String(version),
          isDev: false,
          source: manifestType,
        });
      }
      for (const [name, version] of Object.entries(
        pkg.devDependencies ?? {}
      )) {
        dependencies.push({
          name,
          version: String(version),
          isDev: true,
          source: manifestType,
        });
      }
    } catch {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Invalid package.json",
        description: "Failed to parse package.json. The file may be malformed.",
        recommendation: "Validate and fix the JSON structure.",
      });
    }
  } else if (manifestType === "requirements.txt") {
    for (const line of manifest.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*(?:[>=<~!]+\s*(.+))?$/);
      if (match) {
        dependencies.push({
          name: match[1],
          version: match[2] ?? "*",
          isDev: false,
          source: manifestType,
        });
      }
    }
  } else if (manifestType === "Cargo.toml") {
    // Match [dependencies] section up to the next [section] header or EOF
    const depSection = manifest.match(
      /\[dependencies\]\s*\n([\s\S]*?)(?=\n\s*\[|\s*$)/
    )?.[1];
    if (depSection) {
      for (const line of depSection.split("\n")) {
        // Simple: name = "version"
        const simple = line.match(/^(\w[\w-]*)\s*=\s*"([^"]+)"/);
        if (simple) {
          dependencies.push({
            name: simple[1],
            version: simple[2],
            isDev: false,
            source: manifestType,
          });
          continue;
        }
        // Inline table: name = { version = "...", ... }
        const table = line.match(
          /^(\w[\w-]*)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/
        );
        if (table) {
          dependencies.push({
            name: table[1],
            version: table[2],
            isDev: false,
            source: manifestType,
          });
        }
      }
    }
  } else if (manifestType === "go.mod") {
    for (const line of manifest.split("\n")) {
      const match = line
        .trim()
        .match(/^([\w./\-@]+)\s+(v[\d.]+(?:-[\w.]+)?)/);
      if (match) {
        dependencies.push({
          name: match[1],
          version: match[2],
          isDev: false,
          source: manifestType,
        });
      }
    }
  } else if (manifestType === "pom.xml") {
    const depRegex =
      /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?(?:<version>([^<]*)<\/version>)?[\s\S]*?<\/dependency>/g;
    let m;
    while ((m = depRegex.exec(manifest)) !== null) {
      dependencies.push({
        name: `${m[1]}:${m[2]}`,
        version: m[3] ?? "managed",
        isDev: false,
        source: manifestType,
      });
    }
  } else if (manifestType === "csproj") {
    const pkgRegex =
      /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]*)"/g;
    let m;
    while ((m = pkgRegex.exec(manifest)) !== null) {
      dependencies.push({
        name: m[1],
        version: m[2],
        isDev: false,
        source: manifestType,
      });
    }
  }

  // Supply-chain analysis rules
  // Wildcard / unpinned versions
  const unpinned = dependencies.filter(
    (d) =>
      d.version === "*" ||
      d.version === "latest" ||
      /^\^/.test(d.version) ||
      /^~/.test(d.version) ||
      />=/.test(d.version)
  );
  if (unpinned.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unpinned dependency versions",
      description: `${unpinned.length} dependencies use unpinned/loose version ranges: ${unpinned.slice(0, 5).map((d) => `${d.name}@${d.version}`).join(", ")}. This can lead to unexpected breaking changes and supply-chain attacks.`,
      recommendation:
        "Pin dependencies to exact versions or use a lockfile (package-lock.json, Cargo.lock, go.sum).",
      reference: "Supply Chain Security Best Practices",
    });
  }

  // Too many dependencies
  if (dependencies.filter((d) => !d.isDev).length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Large number of production dependencies",
      description: `${dependencies.filter((d) => !d.isDev).length} production dependencies detected. Each dependency increases attack surface and maintenance burden.`,
      recommendation:
        "Audit dependencies regularly. Remove unused packages. Consider inlining small utilities.",
      reference: "Dependency Minimization Best Practices",
    });
  }

  // Known risky package name patterns (typosquatting indicators)
  const knownPrefixes = [
    "lodash",
    "express",
    "react",
    "vue",
    "angular",
    "axios",
    "moment",
  ];
  const suspicious = dependencies.filter((d) =>
    knownPrefixes.some(
      (p) =>
        d.name !== p &&
        d.name.startsWith(p) &&
        d.name.length <= p.length + 3
    )
  );
  if (suspicious.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potentially typosquatted package names",
      description: `Suspicious package names detected that are similar to popular packages: ${suspicious.map((d) => d.name).join(", ")}. These may be typosquatting attempts.`,
      recommendation:
        "Verify these package names are intentional and not typos of well-known packages.",
      reference: "NPM Typosquatting / Supply Chain Attacks",
    });
  }

  // Dev dependencies in production flag
  const devInProd = dependencies.filter(
    (d) =>
      !d.isDev &&
      /test|jest|mocha|chai|sinon|eslint|prettier|typescript|ts-node|nodemon/i.test(
        d.name
      )
  );
  if (devInProd.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Development tools in production dependencies",
      description: `The following look like dev tools but are listed as production dependencies: ${devInProd.map((d) => d.name).join(", ")}. This inflates deployment size and attack surface.`,
      recommendation:
        "Move development tools to devDependencies (or equivalent dev scope).",
    });
  }

  // No lockfile hint
  if (
    manifestType === "package.json" &&
    !manifest.includes("lockfileVersion")
  ) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Reminder: ensure a lockfile is committed",
      description:
        "This analysis is based on the manifest. Ensure a lockfile (package-lock.json, yarn.lock) is committed for reproducible builds.",
      recommendation:
        "Commit your lockfile to version control. Run npm ci in CI/CD instead of npm install.",
    });
  }

  const score = calculateScore(findings);
  const verdict = deriveVerdict(findings, score);

  return {
    totalDependencies: dependencies.length,
    findings,
    dependencies,
    score,
    verdict,
    summary: `Dependency analysis: ${dependencies.length} dependencies, ${findings.length} findings, score ${score}/100 — ${verdict.toUpperCase()}`,
  };
}

// ─── App Builder Flow (Review → Translate → Task Plan) ─────────────────────

function severityRank(severity: Severity): number {
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
  }
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.ruleId}|${finding.title}|${finding.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }

  return result;
}

function decideRelease(
  criticalCount: number,
  highCount: number,
  score: number
): AppBuilderWorkflowResult["releaseDecision"] {
  if (criticalCount > 0 || score < 60) return "do-not-ship";
  if (highCount > 0 || score < 80) return "ship-with-caution";
  return "ship-now";
}

function toPlainLanguageFinding(finding: Finding): PlainLanguageFinding {
  const severityImpact: Record<Severity, string> = {
    critical:
      "This can directly cause security incidents, outages, or serious compliance exposure.",
    high: "This is likely to impact users or operations if left unresolved.",
    medium: "This can create reliability, maintainability, or quality issues over time.",
    low: "This is a quality improvement that reduces friction and future rework.",
    info: "This is guidance to strengthen consistency and engineering hygiene.",
  };

  return {
    ruleId: finding.ruleId,
    severity: finding.severity,
    title: finding.title,
    whatIsWrong: `${finding.title}: ${finding.description}`,
    whyItMatters: severityImpact[finding.severity],
    nextAction: finding.recommendation,
  };
}

function pickOwner(finding: Finding): WorkflowTask["owner"] {
  if (/^(UX|A11Y|I18N|ETHICS|COMPAT)-/.test(finding.ruleId)) return "product";
  if (/^(DOC|TEST|MAINT|ERR|CFG)-/.test(finding.ruleId)) return "ai";
  return "developer";
}

function pickPriority(severity: Severity): WorkflowTask["priority"] {
  if (severity === "critical") return "P0";
  if (severity === "high") return "P1";
  return "P2";
}

function pickEffort(finding: Finding): WorkflowTask["effort"] {
  if (finding.severity === "critical") return "L";
  if (finding.severity === "high") return "M";
  return finding.lineNumbers && finding.lineNumbers.length > 3 ? "M" : "S";
}

function toWorkflowTask(finding: Finding): WorkflowTask {
  const owner = pickOwner(finding);
  const priority = pickPriority(finding.severity);
  const effort = pickEffort(finding);
  const aiFixable = owner !== "product";

  return {
    priority,
    owner,
    effort,
    ruleId: finding.ruleId,
    task: `${finding.title} — ${finding.recommendation}`,
    doneWhen: `A follow-up review no longer reports ${finding.ruleId} and related tests/checks pass.`,
    aiFixable,
  };
}

export function runAppBuilderWorkflow(params: {
  code?: string;
  language?: string;
  files?: Array<{ path: string; content: string; language: string }>;
  changedLines?: number[];
  context?: string;
  maxFindings?: number;
  maxTasks?: number;
}): AppBuilderWorkflowResult {
  const maxFindings = Math.max(1, params.maxFindings ?? 10);
  const maxTasks = Math.max(1, params.maxTasks ?? 20);

  let mode: AppBuilderWorkflowResult["mode"];
  let verdict: Verdict;
  let score: number;
  let findings: Finding[];

  if (params.files && params.files.length > 0) {
    mode = "project";
    const result = evaluateProject(params.files, params.context);
    verdict = result.overallVerdict;
    score = result.overallScore;
    findings = [
      ...result.fileResults.flatMap((fr) => fr.findings),
      ...result.architecturalFindings,
    ];
  } else if (params.changedLines && params.changedLines.length > 0) {
    if (!params.code || !params.language) {
      throw new Error(
        "changedLines mode requires both code and language inputs"
      );
    }

    mode = "diff";
    const result = evaluateDiff(
      params.code,
      params.language,
      params.changedLines,
      params.context
    );
    verdict = result.verdict;
    score = result.score;
    findings = result.findings;
  } else {
    if (!params.code || !params.language) {
      throw new Error(
        "code mode requires both code and language, or provide files for project mode"
      );
    }

    mode = "code";
    const result = evaluateWithTribunal(params.code, params.language, params.context);
    verdict = result.overallVerdict;
    score = result.overallScore;
    findings = result.evaluations.flatMap((evaluation) => evaluation.findings);
  }

  const dedupedFindings = dedupeFindings(findings).sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  );

  const criticalCount = dedupedFindings.filter(
    (finding) => finding.severity === "critical"
  ).length;
  const highCount = dedupedFindings.filter(
    (finding) => finding.severity === "high"
  ).length;
  const mediumCount = dedupedFindings.filter(
    (finding) => finding.severity === "medium"
  ).length;

  const releaseDecision = decideRelease(criticalCount, highCount, score);
  const topFindings = dedupedFindings
    .filter((finding) => ["critical", "high", "medium"].includes(finding.severity))
    .slice(0, maxFindings);

  const plainLanguageFindings = topFindings.map(toPlainLanguageFinding);
  const tasks = dedupedFindings.slice(0, maxTasks).map(toWorkflowTask);
  const aiFixableNow = tasks.filter(
    (task) => task.aiFixable && (task.priority === "P0" || task.priority === "P1")
  );

  const summary =
    releaseDecision === "do-not-ship"
      ? "Do not ship yet. Resolve critical risks before release."
      : releaseDecision === "ship-with-caution"
      ? "Ship with caution. Address high-priority gaps and monitor closely."
      : "Ship now. No blocking risks were detected in this review pass.";

  return {
    mode,
    verdict,
    score,
    criticalCount,
    highCount,
    mediumCount,
    releaseDecision,
    summary,
    plainLanguageFindings,
    tasks,
    aiFixableNow,
  };
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { formatVerdictAsMarkdown, formatEvaluationAsMarkdown };
