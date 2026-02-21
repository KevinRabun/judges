import { execFileSync } from "child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, extname, join, resolve } from "path";

import { evaluateWithTribunal } from "../evaluators/index.js";
import { Finding, JudgeEvaluation, Severity, Verdict } from "../types.js";

type SourceFile = {
  absolutePath: string;
  relativePath: string;
  language: string;
  content: string;
};

type FileEvaluation = {
  path: string;
  language: string;
  score: number;
  verdict: Verdict;
  judgeEvaluations: JudgeEvaluation[];
  findings: Finding[];
};

type CredentialMode = "standard" | "strict";

export interface PublicRepoReportOptions {
  repoUrl: string;
  branch?: string;
  maxFiles?: number;
  maxFileBytes?: number;
  maxFindingsInReport?: number;
  excludePathRegexes?: string[];
  credentialMode?: CredentialMode;
  includeAstFindings?: boolean;
  minConfidence?: number;
  outputPath?: string;
  keepClone?: boolean;
}

export interface PublicRepoReportResult {
  markdown: string;
  outputPath?: string;
  analyzedFileCount: number;
  totalFindings: number;
  averageScore: number;
  overallVerdict: Verdict;
  clonePath: string;
}

export interface LocalRepoReportOptions {
  repoPath: string;
  repoLabel?: string;
  branch?: string;
  maxFiles?: number;
  maxFileBytes?: number;
  maxFindingsInReport?: number;
  excludePathRegexes?: string[];
  credentialMode?: CredentialMode;
  includeAstFindings?: boolean;
  minConfidence?: number;
  outputPath?: string;
}

const DEFAULT_MAX_FILE_BYTES = 300_000;
const DEFAULT_MAX_FILES = 600;
const DEFAULT_MAX_FINDINGS_IN_REPORT = 150;
const DEFAULT_CREDENTIAL_MODE: CredentialMode = "standard";

const INCLUDE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".h",
  ".hpp",
  ".hh",
  ".inl",
]);

const EXCLUDED_DIRS = new Set([
  ".git",
  ".github",
  ".vscode",
  "node_modules",
  "build",
  "dist",
  "bin",
  "obj",
  "out",
  "third_party",
  "extern",
  "external",
  "deps",
  "vendor",
  "vcpkg_installed",
  "cmake-build-debug",
  "cmake-build-release",
]);

function normalizeLanguageFromExtension(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  switch (extension) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
      return "python";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    case ".java":
      return "java";
    case ".cs":
      return "csharp";
    case ".cpp":
    case ".cc":
    case ".cxx":
    case ".c":
    case ".h":
    case ".hpp":
    case ".hh":
    case ".inl":
      return "cpp";
    default:
      return "unknown";
  }
}

function severityOrder(severity: Severity): number {
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

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function compileExcludeRegexes(patterns?: string[]): RegExp[] {
  if (!patterns || patterns.length === 0) return [];
  return patterns.map((pattern) => new RegExp(pattern, "i"));
}

function isLikelyNonProductionPath(path: string): boolean {
  return /(^|\/)(test|tests|__tests__|spec|specs|e2e)(\/|\.|$)|\.(?:test|tests|spec|specs|e2e)\.[^/]+$|mock|fixture|fixtures|(^|\/)docs(-|\/)i18n(\/|$)|(^|\/)docs(\/|$)/i.test(path);
}

function shouldSuppressFindingForPath(path: string, finding: Finding): boolean {
  if (!isLikelyNonProductionPath(path)) {
    return false;
  }

  const nonProdSuppressPrefixes = [
    "A11Y-",
    "API-",
    "AUTH-",
    "CACHE-",
    "CFG-",
    "CICD-",
    "CLOUD-",
    "COMP-",
    "COMPAT-",
    "CONC-",
    "COST-",
    "CYBER-",
    "DATA-",
    "DEPS-",
    "DB-",
    "DOC-",
    "ERR-",
    "ETHICS-",
    "I18N-",
    "LOGPRIV-",
    "MAINT-",
    "OBS-",
    "PERF-",
    "PORTA-",
    "RATE-",
    "REL-",
    "SCALE-",
    "SOV-",
    "STRUCT-",
    "SWDEV-",
    "TEST-",
    "UX-",
  ];

  if (nonProdSuppressPrefixes.some((prefix) => finding.ruleId.startsWith(prefix))) {
    return true;
  }

  if (/^AUTH-/.test(finding.ruleId) && /hardcoded credentials/i.test(finding.title)) {
    return true;
  }

  if (/^DATA-/.test(finding.ruleId) && /hardcoded/i.test(finding.title)) {
    return true;
  }

  if (finding.ruleId === "STRUCT-008") {
    return true;
  }

  return false;
}

function withCredentialMode<T>(mode: CredentialMode, action: () => T): T {
  const previous = process.env.JUDGES_CREDENTIAL_MODE;

  if (mode === "strict") {
    process.env.JUDGES_CREDENTIAL_MODE = "strict";
  } else {
    delete process.env.JUDGES_CREDENTIAL_MODE;
  }

  try {
    return action();
  } finally {
    if (typeof previous === "string") {
      process.env.JUDGES_CREDENTIAL_MODE = previous;
    } else {
      delete process.env.JUDGES_CREDENTIAL_MODE;
    }
  }
}

function walkSourceFiles(
  repoPath: string,
  maxFileBytes: number,
  maxFiles: number,
  excludePathRegexes: RegExp[] = []
): SourceFile[] {
  const files: SourceFile[] = [];

  const visit = (currentPath: string, relativePrefix = "") => {
    if (files.length >= maxFiles) return;

    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) return;

      const absolutePath = join(currentPath, entry.name);
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

      if (excludePathRegexes.some((regex) => regex.test(relativePath))) {
        continue;
      }

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        visit(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      if (!INCLUDE_EXTENSIONS.has(extension)) continue;

      const stat = statSync(absolutePath);
      if (stat.size > maxFileBytes) continue;

      const content = readFileSync(absolutePath, "utf8");
      files.push({
        absolutePath,
        relativePath,
        language: normalizeLanguageFromExtension(absolutePath),
        content,
      });
    }
  };

  visit(repoPath);
  return files;
}

function buildMarkdownReport(params: {
  repoUrl: string;
  branch?: string;
  commitSha?: string;
  analyzedFiles: SourceFile[];
  evaluations: FileEvaluation[];
  maxFindingsInReport: number;
}): {
  markdown: string;
  overallVerdict: Verdict;
  averageScore: number;
  totalFindings: number;
} {
  const { repoUrl, branch, commitSha, analyzedFiles, evaluations, maxFindingsInReport } = params;

  const allFindings = evaluations.flatMap((entry) =>
    entry.findings.map((finding) => ({ ...finding, file: entry.path }))
  );

  const findingsSorted = allFindings.sort((a, b) => {
    const severityDiff = severityOrder(b.severity) - severityOrder(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return a.ruleId.localeCompare(b.ruleId);
  });

  const averageScore =
    evaluations.length > 0
      ? Math.round(
          evaluations.reduce((sum, entry) => sum + entry.score, 0) / evaluations.length
        )
      : 100;

  const failCount = evaluations.filter((entry) => entry.verdict === "fail").length;
  const warningCount = evaluations.filter((entry) => entry.verdict === "warning").length;
  const passCount = evaluations.filter((entry) => entry.verdict === "pass").length;

  const overallVerdict: Verdict = failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";

  const severityCounts = countBySeverity(allFindings);

  const judgeScoreAverages = new Map<string, { name: string; scores: number[]; findings: Finding[] }>();
  for (const fileEvaluation of evaluations) {
    for (const evaluation of fileEvaluation.judgeEvaluations) {
      const aggregate =
        judgeScoreAverages.get(evaluation.judgeId) ??
        { name: evaluation.judgeName, scores: [], findings: [] };
      aggregate.scores.push(evaluation.score);
      aggregate.findings.push(...evaluation.findings);
      judgeScoreAverages.set(evaluation.judgeId, aggregate);
    }
  }

  const judgeRows = [...judgeScoreAverages.entries()]
    .map(([judgeId, aggregate]) => {
      const avgScore = Math.round(
        aggregate.scores.reduce((sum, value) => sum + value, 0) / aggregate.scores.length
      );
      const findingCounts = countBySeverity(aggregate.findings);
      return {
        judgeId,
        judgeName: aggregate.name,
        avgScore,
        findingCounts,
      };
    })
    .sort((a, b) => a.avgScore - b.avgScore);

  const worstFiles = [...evaluations]
    .sort((a, b) => a.score - b.score)
    .slice(0, 80);

  let md = `# Public Repository Full Judges Report\n\n`;
  md += `Generated from **${repoUrl}**`;
  if (branch) md += ` (branch: \`${branch}\`)`;
  if (commitSha) md += ` at commit \`${commitSha}\``;
  md += ` on ${new Date().toISOString()}.\n\n`;

  md += `## Scope\n\n`;
  md += `- Files analyzed: **${analyzedFiles.length}**\n`;
  md += `- Judges applied: **full tribunal (${judgeRows.length})**\n\n`;

  md += `## Executive Summary\n\n`;
  md += `- Overall verdict: **${overallVerdict.toUpperCase()}**\n`;
  md += `- Average file score: **${averageScore}/100**\n`;
  md += `- File verdict distribution: PASS ${passCount}, WARNING ${warningCount}, FAIL ${failCount}\n`;
  md += `- Total findings: **${allFindings.length}** (critical ${severityCounts.critical}, high ${severityCounts.high}, medium ${severityCounts.medium}, low ${severityCounts.low}, info ${severityCounts.info})\n\n`;

  md += `## Per-Judge Breakdown\n\n`;
  md += `| Judge | Avg Score | Critical | High | Medium | Low | Info |\n`;
  md += `|---|---:|---:|---:|---:|---:|---:|\n`;
  for (const row of judgeRows) {
    md += `| ${row.judgeName} | ${row.avgScore} | ${row.findingCounts.critical} | ${row.findingCounts.high} | ${row.findingCounts.medium} | ${row.findingCounts.low} | ${row.findingCounts.info} |\n`;
  }
  md += `\n`;

  md += `## Highest-Risk Findings (Top ${Math.min(maxFindingsInReport, findingsSorted.length)})\n\n`;
  for (const finding of findingsSorted.slice(0, maxFindingsInReport)) {
    const lines = finding.lineNumbers?.length ? ` (lines ${finding.lineNumbers.join(", ")})` : "";
    md += `### [${finding.severity.toUpperCase()}] ${finding.ruleId} — ${finding.title}\n`;
    md += `- File: \`${finding.file}\`${lines}\n`;
    md += `- Description: ${finding.description}\n`;
    md += `- Recommendation: ${finding.recommendation}\n`;
    if (finding.reference) {
      md += `- Reference: ${finding.reference}\n`;
    }
    md += `\n`;
  }

  md += `## Lowest-Scoring Files (Top ${Math.min(80, worstFiles.length)})\n\n`;
  md += `| File | Language | Score | Verdict | Findings |\n`;
  md += `|---|---|---:|---|---:|\n`;
  for (const entry of worstFiles) {
    md += `| \`${entry.path}\` | ${entry.language} | ${entry.score} | ${entry.verdict.toUpperCase()} | ${entry.findings.length} |\n`;
  }

  md += `\n## Notes and Limitations\n\n`;
  md += `- This report is based on static heuristic and structural analysis of repository source files.\n`;
  md += `- Runtime behavior, production telemetry, and deployment controls should be reviewed separately.\n`;
  md += `- Large/binary/generated/vendor files are intentionally excluded for signal quality.\n`;

  return {
    markdown: md,
    overallVerdict,
    averageScore,
    totalFindings: allFindings.length,
  };
}

function clonePublicRepo(repoUrl: string, branch?: string): string {
  const safeName = basename(repoUrl).replace(/\.git$/i, "") || "repo";
  const parentDir = mkdtempSync(join(tmpdir(), "judges-public-repo-"));
  const targetDir = join(parentDir, safeName);

  const args = ["clone", "--depth", "1"];
  if (branch) {
    args.push("--branch", branch, "--single-branch");
  }
  args.push(repoUrl, targetDir);

  execFileSync("git", args, { stdio: "pipe" });
  return targetDir;
}

function getCommitSha(repoPath: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoPath,
      stdio: "pipe",
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export function generateRepoReportFromLocalPath(
  options: LocalRepoReportOptions
): Omit<PublicRepoReportResult, "clonePath"> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFindingsInReport = options.maxFindingsInReport ?? DEFAULT_MAX_FINDINGS_IN_REPORT;
  const credentialMode = options.credentialMode ?? DEFAULT_CREDENTIAL_MODE;
  const includeAstFindings = options.includeAstFindings ?? true;
  const minConfidence = options.minConfidence;
  const repoPath = resolve(options.repoPath);
  const excludePathRegexes = compileExcludeRegexes(options.excludePathRegexes);

  const files = walkSourceFiles(repoPath, maxFileBytes, maxFiles, excludePathRegexes);
  if (files.length === 0) {
    throw new Error("No eligible source files found in the repository path.");
  }

  const evaluations: FileEvaluation[] = withCredentialMode(credentialMode, () =>
    files.map((file) => {
      const verdict = evaluateWithTribunal(file.content, file.language, undefined, {
        includeAstFindings,
        minConfidence,
      });
      const judgeEvaluations = verdict.evaluations.map((evaluation) => ({
        ...evaluation,
        findings: evaluation.findings.filter(
          (finding) => !shouldSuppressFindingForPath(file.relativePath, finding)
        ),
      }));

      const findings = judgeEvaluations.flatMap((evaluation) => evaluation.findings);
      return {
        path: file.relativePath,
        language: file.language,
        score: verdict.overallScore,
        verdict: verdict.overallVerdict,
        judgeEvaluations,
        findings,
      };
    })
  );

  const commitSha = getCommitSha(repoPath);
  const report = buildMarkdownReport({
    repoUrl: options.repoLabel ?? repoPath,
    branch: options.branch,
    commitSha,
    analyzedFiles: files,
    evaluations,
    maxFindingsInReport,
  });

  let outputPath: string | undefined;
  if (options.outputPath) {
    outputPath = resolve(options.outputPath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, report.markdown, "utf8");
  }

  return {
    markdown: report.markdown,
    outputPath,
    analyzedFileCount: files.length,
    totalFindings: report.totalFindings,
    averageScore: report.averageScore,
    overallVerdict: report.overallVerdict,
  };
}

export function generatePublicRepoReport(options: PublicRepoReportOptions): PublicRepoReportResult {
  if (!/^https?:\/\//i.test(options.repoUrl)) {
    throw new Error("repoUrl must be a public HTTP(S) repository URL.");
  }

  const clonePath = clonePublicRepo(options.repoUrl, options.branch);

  try {
    const report = generateRepoReportFromLocalPath({
      repoPath: clonePath,
      repoLabel: options.repoUrl,
      branch: options.branch,
      maxFiles: options.maxFiles,
      maxFileBytes: options.maxFileBytes,
      maxFindingsInReport: options.maxFindingsInReport,
      excludePathRegexes: options.excludePathRegexes,
      credentialMode: options.credentialMode,
      includeAstFindings: options.includeAstFindings,
      minConfidence: options.minConfidence,
      outputPath: options.outputPath,
    });

    return {
      markdown: report.markdown,
      outputPath: report.outputPath,
      analyzedFileCount: report.analyzedFileCount,
      totalFindings: report.totalFindings,
      averageScore: report.averageScore,
      overallVerdict: report.overallVerdict,
      clonePath,
    };
  } finally {
    if (!options.keepClone) {
      rmSync(clonePath, { recursive: true, force: true });
    }
  }
}
