#!/usr/bin/env tsx

import { execFileSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { extname, join, resolve } from "path";

import { evaluateWithTribunal } from "../src/evaluators/index.js";
import { Finding } from "../src/types.js";

const DEFAULT_POPULAR_REPOS = [
  "https://github.com/microsoft/vscode",
  "https://github.com/vercel/next.js",
  "https://github.com/facebook/react",
  "https://github.com/fastapi/fastapi",
  "https://github.com/tensorflow/tensorflow",
  "https://github.com/astral-sh/uv",
  "https://github.com/denoland/deno",
];

const SOURCE_EXTENSIONS = new Set([
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

type CandidateFix = {
  filePath: string;
  line: number;
  language: string;
  ruleId: string;
  severity: Finding["severity"];
  title: string;
  previousLine: string;
  replacementLine: string;
  reason: string;
};

type Summary = {
  selectedRepo: string;
  defaultBranch: string;
  generatedAt: string;
  dryRun: boolean;
  maxPrs: number;
  candidateConfidenceUsed: number;
  fallbackUsed: boolean;
  judgesFindingsScanned: number;
  candidatesInspected: number;
  prsOpened: Array<{
    branch: string;
    title: string;
    url: string;
    ruleId: string;
    filePath: string;
    line: number;
  }>;
  skipped: string[];
};

type CandidateDiscoveryOptions = {
  minConfidence: number;
  highCriticalOnly: boolean;
};

function run(command: string, args: string[], cwd?: string): string {
  return execFileSync(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

function hasGitHubAuth(): boolean {
  try {
    run("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

function parseRepoFromUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git|\/)?$/i);
  if (!match) {
    throw new Error(`Unsupported repo URL: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

function isPublicRepo(owner: string, repo: string): boolean {
  const isPrivate = run("gh", ["api", `repos/${owner}/${repo}`, "--jq", ".private"]);
  return isPrivate.trim() === "false";
}

function canSubmitPrWithoutExtraAuth(owner: string, repo: string): { allowed: boolean; reason?: string } {
  try {
    const visibility = run("gh", ["api", `repos/${owner}/${repo}`, "--jq", "[.private,.archived,.allow_forking] | @tsv"])
      .split("\t")
      .map((value) => value.trim());

    const [privateValue, archivedValue, allowForkingValue] = visibility;
    if (privateValue !== "false") {
      return { allowed: false, reason: "Repository is not public." };
    }
    if (archivedValue === "true") {
      return { allowed: false, reason: "Repository is archived." };
    }
    if (allowForkingValue === "false") {
      return { allowed: false, reason: "Repository does not allow forking." };
    }

    const login = run("gh", ["api", "user", "--jq", ".login"]);
    try {
      run("gh", ["repo", "view", `${login}/${repo}`]);
    } catch {
      run("gh", ["repo", "fork", `${owner}/${repo}`, "--clone=false"]);
    }

    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      reason: `Unable to verify PR eligibility with current auth: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function dayOfYear(now: Date): number {
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

function selectRepository(): string {
  const fromEnv = process.env.POPULAR_REPOS
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const repos = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_POPULAR_REPOS;
  const forced = process.env.TARGET_REPO_URL?.trim();
  if (forced) {
    return forced;
  }

  const index = dayOfYear(new Date()) % repos.length;
  return repos[index];
}

function detectDefaultBranch(clonePath: string): string {
  const ref = run("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], clonePath);
  return ref.replace("refs/remotes/origin/", "");
}

function collectSourceFiles(rootPath: string): string[] {
  const results: string[] = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const item of readdirSync(current)) {
      const absolute = join(current, item);
      const relative = absolute.slice(rootPath.length + 1).replace(/\\/g, "/");
      const stat = statSync(absolute);

      if (stat.isDirectory()) {
        if (EXCLUDED_DIRS.has(item) || item === "coverage") {
          continue;
        }
        stack.push(absolute);
        continue;
      }

      const ext = extname(item).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext)) {
        results.push(relative);
      }
    }
  }

  return results;
}

function languageFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  if (ext === ".rs") return "rust";
  if (ext === ".java") return "java";
  if (ext === ".cs") return "csharp";
  if (
    ext === ".cpp" ||
    ext === ".cc" ||
    ext === ".cxx" ||
    ext === ".c" ||
    ext === ".h" ||
    ext === ".hpp" ||
    ext === ".hh" ||
    ext === ".inl"
  ) {
    return "cpp";
  }
  return "unknown";
}

function countRule(findings: Finding[], ruleId: string): number {
  return findings.filter((finding) => finding.ruleId === ruleId).length;
}

function countHighOrCritical(findings: Finding[]): number {
  return findings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length;
}

function isNonProductionPath(path: string): boolean {
  return /(^|\/)(test|tests|__tests__|spec|specs|e2e|docs|examples?|fixtures?|mocks?)(\/|\.|$)|\.(test|spec)\./i.test(path);
}

function flattenFindings(source: string, language: string, minConfidence: number): Finding[] {
  const verdict = evaluateWithTribunal(source, language, undefined, {
    includeAstFindings: true,
    minConfidence,
  });
  return verdict.evaluations.flatMap((evaluation) => evaluation.findings);
}

function redactLogLine(line: string): string | undefined {
  const hasSensitiveSignal = /(password|passwd|token|secret|authorization|api[_-]?key|credit.?card|ssn)/i.test(line);
  if (!hasSensitiveSignal) return undefined;

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const hasSemicolon = /;\s*$/.test(line);

  if (/console\.(log|info|warn|error|debug)\(/.test(line) || /\blogger\.(info|warn|error|debug|log)\(/.test(line)) {
    return `${indent}console.warn("[judges] redacted sensitive log payload")${hasSemicolon ? ";" : ""}`;
  }

  if (/^\s*print\s*\(/.test(line)) {
    return `${indent}print("[judges] redacted sensitive log payload")`;
  }

  return undefined;
}

function strengthenWeakHashLine(line: string): string | undefined {
  if (!/(createHash\(("|')(md5|sha1|sha256)\2\)|hashlib\.(md5|sha1|sha256)\s*\()/i.test(line)) return undefined;
  return line
    .replace(/createHash\(("|')md5\1\)/gi, "createHash($1sha512$1)")
    .replace(/createHash\(("|')sha1\1\)/gi, "createHash($1sha512$1)")
    .replace(/createHash\(("|')sha256\1\)/gi, "createHash($1sha512$1)")
    .replace(/hashlib\.md5\s*\(/gi, "hashlib.sha512(")
    .replace(/hashlib\.sha1\s*\(/gi, "hashlib.sha512(")
    .replace(/hashlib\.sha256\s*\(/gi, "hashlib.sha512(");
}

function remediateTlsDisabledLine(line: string): string | undefined {
  let next = line;
  next = next.replace(/NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["'`]?0["'`]?/gi, "NODE_TLS_REJECT_UNAUTHORIZED=1");
  next = next.replace(/rejectUnauthorized\s*:\s*false/gi, "rejectUnauthorized: true");
  next = next.replace(/verify\s*=\s*False/g, "verify=True");
  next = next.replace(/InsecureSkipVerify\s*:\s*true/g, "InsecureSkipVerify: false");
  return next === line ? undefined : next;
}

function remediateTokenQueryLine(line: string): string | undefined {
  let next = line;
  next = next.replace(/req\.query\.(token|api_?key|auth|secret|password|access_token)/gi, "req.headers.authorization");
  return next === line ? undefined : next;
}

function remediateCorsWildcardLine(line: string): string | undefined {
  if (!/(origin\s*:\s*["'`]\*["'`]|Access-Control-Allow-Origin["'`]?,\s*["'`]\*["'`])/.test(line)) {
    return undefined;
  }

  let next = line;
  next = next.replace(/origin\s*:\s*["'`]\*["'`]/g, 'origin: (process.env.ALLOWED_ORIGIN ?? "https://example.com")');
  next = next.replace(/(Access-Control-Allow-Origin["'`]?,\s*)["'`]\*["'`]/g, '$1(process.env.ALLOWED_ORIGIN ?? "https://example.com")');
  return next === line ? undefined : next;
}

function remediateHardcodedSecretLine(line: string): string | undefined {
  const assignment = line.match(/\b(password|passwd|pwd|secret|api_?key|apikey|token|auth_?token|private_?key)\b\s*[:=]\s*(["'`])([^"'`]{3,})\2/i);
  if (!assignment) return undefined;

  const keyName = assignment[1];
  const envKey = keyName.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
  const replacement = `process.env.${envKey} ?? ""`;

  return line.replace(assignment[0], assignment[0].replace(/(["'`])([^"'`]{3,})\1/i, replacement));
}

function remediateHardcodedConfigLine(line: string): string | undefined {
  const match = line.match(/^(\s*)(const|let|var)\s+(PORT|HOST|DATABASE|REDIS|MONGO|API_URL|BASE_URL|TIMEOUT|INTERVAL)\s*=\s*([^;]+)(;?\s*)$/i);
  if (!match) return undefined;

  const indent = match[1] ?? "";
  const decl = match[2] ?? "const";
  const key = match[3] ?? "CONFIG";
  const rawValue = (match[4] ?? "").trim();
  const suffix = match[5] ?? "";
  const envKey = key.toUpperCase();

  const numericKeys = new Set(["PORT", "TIMEOUT", "INTERVAL"]);
  if (numericKeys.has(envKey)) {
    const fallback = /^\d+$/.test(rawValue) ? rawValue : "0";
    return `${indent}${decl} ${key} = Number(process.env.${envKey} ?? ${fallback})${suffix || ";"}`;
  }

  const fallback = rawValue.replace(/^(['"`])|(['"`])$/g, "") || "";
  return `${indent}${decl} ${key} = process.env.${envKey} ?? "${fallback}"${suffix || ";"}`;
}

function remediateCookieSecurityFlagsLine(line: string): string | undefined {
  if (/res\.cookie\s*\(/.test(line) && !/(httpOnly|secure|sameSite)/i.test(line)) {
    const replaced = line.replace(/res\.cookie\s*\(([^)]+)\)/, "res.cookie($1, { httpOnly: true, secure: true, sameSite: \"strict\" })");
    return replaced === line ? undefined : replaced;
  }

  if (/set_cookie\s*\(/.test(line) && !/(httponly|secure|samesite)/i.test(line)) {
    const replaced = line.replace(/set_cookie\s*\(([^)]+)\)/, "set_cookie($1, httponly=True, secure=True, samesite=\"Strict\")");
    return replaced === line ? undefined : replaced;
  }

  if (/Set-Cookie/i.test(line) && !/(HttpOnly|Secure|SameSite)/i.test(line)) {
    const replaced = line.replace(/(["'][^"']*Set-Cookie[^"']*["']\s*,\s*["'][^"']+)(["'])/, "$1; HttpOnly; Secure; SameSite=Strict$2");
    return replaced === line ? undefined : replaced;
  }

  return undefined;
}

function generateReplacement(
  finding: Finding,
  previousLine: string,
  language: string
): { replacementLine?: string; reason?: string } {
  const title = finding.title.toLowerCase();
  const rulePrefix = finding.ruleId.split("-")[0];

  if (rulePrefix === "AUTH" && /weak hashing algorithm/.test(title)) {
    const replacementLine = strengthenWeakHashLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Upgrade weak credential hash primitive to a stronger alternative." };
    }
  }

  if ((rulePrefix === "LOGPRIV" || rulePrefix === "COMP") && /log/.test(title)) {
    const replacementLine = redactLogLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Redact potentially sensitive values from logs." };
    }
  }

  if ((rulePrefix === "AUTH" || rulePrefix === "CYBER") && /tls certificate validation disabled/.test(title)) {
    const replacementLine = remediateTlsDisabledLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Re-enable TLS certificate validation." };
    }
  }

  if (rulePrefix === "AUTH" && /query parameters/.test(title) && (language === "typescript" || language === "javascript")) {
    const replacementLine = remediateTokenQueryLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Move token source away from query parameters." };
    }
  }

  if (rulePrefix === "CYBER" && /cors/.test(title) && (language === "typescript" || language === "javascript")) {
    const replacementLine = remediateCorsWildcardLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Tighten permissive CORS wildcard origin." };
    }
  }

  if ((rulePrefix === "CFG" || rulePrefix === "AUTH" || rulePrefix === "DATA") && /hardcoded|secret|credential/.test(title) && (language === "typescript" || language === "javascript")) {
    const replacementLine = remediateHardcodedSecretLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Externalize hardcoded secret to environment variable." };
    }
  }

  if (rulePrefix === "CFG" && /configuration values hardcoded|no environment variable usage/.test(title) && (language === "typescript" || language === "javascript")) {
    const replacementLine = remediateHardcodedConfigLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Externalize hardcoded configuration to environment variable fallback." };
    }
  }

  if (rulePrefix === "COMP" && /cookies set without security flags/.test(title)) {
    const replacementLine = remediateCookieSecurityFlagsLine(previousLine);
    if (replacementLine && replacementLine !== previousLine) {
      return { replacementLine, reason: "Add secure cookie flags for compliance and session safety." };
    }
  }

  return {};
}

function discoverFixCandidates(rootPath: string, options: CandidateDiscoveryOptions): CandidateFix[] {
  const files = collectSourceFiles(rootPath);
  const candidates: CandidateFix[] = [];
  const seen = new Set<string>();

  for (const relativePath of files) {
    if (isNonProductionPath(relativePath)) {
      continue;
    }

    const absolutePath = join(rootPath, ...relativePath.split("/"));
    const source = readFileSync(absolutePath, "utf8");
    const language = languageFromPath(relativePath);

    const findings = flattenFindings(source, language, options.minConfidence);
    if (findings.length === 0) continue;

    const lines = source.split("\n");
    for (const finding of findings) {
      if (
        options.highCriticalOnly &&
        finding.severity !== "critical" &&
        finding.severity !== "high"
      ) {
        continue;
      }

      const line = finding.lineNumbers?.[0];
      if (!line || line < 1 || line > lines.length) continue;

      const previousLine = lines[line - 1];
      const { replacementLine, reason } = generateReplacement(finding, previousLine, language);

      if (!replacementLine || replacementLine === previousLine || !reason) continue;

      const candidateKey = `${relativePath}:${line}:${finding.ruleId}`;
      if (seen.has(candidateKey)) continue;
      seen.add(candidateKey);

      candidates.push({
        filePath: relativePath,
        line,
        language,
        ruleId: finding.ruleId,
        severity: finding.severity,
        title: finding.title,
        previousLine,
        replacementLine,
        reason,
      });
    }
  }

  return candidates;
}

function countTotalFindings(rootPath: string, minConfidence: number): number {
  const files = collectSourceFiles(rootPath);
  let total = 0;

  for (const relativePath of files) {
    const absolutePath = join(rootPath, ...relativePath.split("/"));
    const source = readFileSync(absolutePath, "utf8");
    const language = languageFromPath(relativePath);

    const findings = flattenFindings(source, language, minConfidence);
    total += findings.length;
  }

  return total;
}

function ensureFork(owner: string, repo: string, login: string): void {
  try {
    run("gh", ["repo", "view", `${login}/${repo}`]);
  } catch {
    run("gh", ["repo", "fork", `${owner}/${repo}`, "--clone=false"]);
  }
}

function ensureForkRemote(clonePath: string, login: string, repo: string): void {
  try {
    run("git", ["remote", "get-url", "fork"], clonePath);
  } catch {
    run("git", ["remote", "add", "fork", `https://github.com/${login}/${repo}.git`], clonePath);
  }
}

function checkoutDefault(clonePath: string, defaultBranch: string): void {
  run("git", ["checkout", defaultBranch], clonePath);
  run("git", ["reset", "--hard", `origin/${defaultBranch}`], clonePath);
  run("git", ["clean", "-fd"], clonePath);
}

function applySingleLineFix(clonePath: string, candidate: CandidateFix, minConfidence: number): boolean {
  const absolutePath = join(clonePath, ...candidate.filePath.split("/"));
  if (!existsSync(absolutePath)) return false;

  const source = readFileSync(absolutePath, "utf8");
  const lines = source.split("\n");
  if (candidate.line < 1 || candidate.line > lines.length) return false;

  if (lines[candidate.line - 1] !== candidate.previousLine) {
    return false;
  }

  const before = source;
  lines[candidate.line - 1] = candidate.replacementLine;
  const after = lines.join("\n");
  if (before === after) return false;

  const beforeFindings = flattenFindings(before, candidate.language, minConfidence);
  const afterFindings = flattenFindings(after, candidate.language, minConfidence);

  const beforeCount = countRule(beforeFindings, candidate.ruleId);
  const afterCount = countRule(afterFindings, candidate.ruleId);
  if (afterCount >= beforeCount) {
    return false;
  }

  const beforeHighCritical = countHighOrCritical(beforeFindings);
  const afterHighCritical = countHighOrCritical(afterFindings);
  if (afterHighCritical > beforeHighCritical) {
    return false;
  }

  writeFileSync(absolutePath, after, "utf8");
  return true;
}

function createPullRequest(
  clonePath: string,
  owner: string,
  repo: string,
  login: string,
  defaultBranch: string,
  branchName: string,
  candidate: CandidateFix
): string {
  run("git", ["add", candidate.filePath], clonePath);
  run(
    "git",
    [
      "commit",
      "-m",
      `fix(${candidate.ruleId.toLowerCase()}): ${candidate.reason}`,
      "-m",
      `Automated remediation for Judges finding ${candidate.ruleId} in ${candidate.filePath}:${candidate.line}.`,
    ],
    clonePath
  );

  run("git", ["push", "-u", "fork", branchName], clonePath);

  const title = `fix: ${candidate.ruleId} remediation in ${candidate.filePath}`;
  const body = [
    "## Automated Judges Remediation",
    "",
    `- Source analyzer: [Judges repository](https://github.com/KevinRabun/judges)`,
    `- Source analyzer package: [@kevinrabun/judges on npm](https://www.npmjs.com/package/@kevinrabun/judges)`,
    `- Source repository: [${owner}/${repo}](https://github.com/${owner}/${repo})`,
    `- Rule: \`${candidate.ruleId}\``,
    `- File: \`${candidate.filePath}:${candidate.line}\``,
    "",
    "This PR was generated by the Judges daily automation workflow after a high-confidence finding and applies a minimal targeted fix.",
  ].join("\n");

  return run(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      `${owner}/${repo}`,
      "--base",
      defaultBranch,
      "--head",
      `${login}:${branchName}`,
      "--title",
      title,
      "--body",
      body,
    ],
    clonePath
  );
}

function main() {
  if (!hasGitHubAuth()) {
    throw new Error("GitHub CLI is not authenticated. Set GH_TOKEN/GITHUB_TOKEN before running.");
  }

  const selectedRepo = selectRepository();
  const { owner, repo } = parseRepoFromUrl(selectedRepo);
  const dryRun = (process.env.DRY_RUN ?? "false").toLowerCase() === "true";
  const parsedMaxPrs = Number.parseInt(process.env.MAX_PRS ?? "5", 10);
  const parsedMinConfidence = Number.parseFloat(process.env.MIN_CONFIDENCE ?? "0.9");
  const fallbackEnabled = (process.env.ENABLE_FALLBACK ?? "true").toLowerCase() === "true";
  const parsedFallbackMinConfidence = Number.parseFloat(process.env.FALLBACK_MIN_CONFIDENCE ?? "0.8");
  const fallbackHighCriticalOnly = (process.env.FALLBACK_HIGH_CRITICAL_ONLY ?? "true").toLowerCase() !== "false";
  const maxPrs = Number.isFinite(parsedMaxPrs) && parsedMaxPrs > 0 ? parsedMaxPrs : 5;
  const minConfidence = Number.isFinite(parsedMinConfidence) ? parsedMinConfidence : 0.9;
  const fallbackMinConfidence = Number.isFinite(parsedFallbackMinConfidence)
    ? parsedFallbackMinConfidence
    : 0.8;

  let candidateConfidenceUsed = minConfidence;
  let fallbackUsed = false;

  const summary: Summary = {
    selectedRepo,
    defaultBranch: "",
    generatedAt: new Date().toISOString(),
    dryRun,
    maxPrs,
    candidateConfidenceUsed,
    fallbackUsed,
    judgesFindingsScanned: 0,
    candidatesInspected: 0,
    prsOpened: [],
    skipped: [],
  };

  const workspace = mkdtempSync(join(tmpdir(), "judges-daily-autofix-"));
  const clonePath = join(workspace, repo);

  try {
    if (!isPublicRepo(owner, repo)) {
      summary.skipped.push("Target repository is not public. Skipping run.");
      return;
    }

    const prEligibility = canSubmitPrWithoutExtraAuth(owner, repo);
    if (!prEligibility.allowed) {
      summary.skipped.push(prEligibility.reason ?? "Current auth cannot create PRs for this repository.");
      return;
    }

    run("git", ["clone", "--depth", "1", selectedRepo, clonePath]);
    const defaultBranch = detectDefaultBranch(clonePath);
    summary.defaultBranch = defaultBranch;

    run("git", ["config", "user.name", "judges-bot"], clonePath);
    run("git", ["config", "user.email", "judges-bot@users.noreply.github.com"], clonePath);

    const login = run("gh", ["api", "user", "--jq", ".login"]);
    ensureFork(owner, repo, login);
    ensureForkRemote(clonePath, login, repo);

    summary.judgesFindingsScanned = countTotalFindings(clonePath, 0);

    let candidates = discoverFixCandidates(clonePath, {
      minConfidence,
      highCriticalOnly: false,
    });

    if (
      candidates.length === 0 &&
      fallbackEnabled &&
      fallbackMinConfidence > 0 &&
      fallbackMinConfidence < minConfidence
    ) {
      const fallbackCandidates = discoverFixCandidates(clonePath, {
        minConfidence: fallbackMinConfidence,
        highCriticalOnly: fallbackHighCriticalOnly,
      });

      if (fallbackCandidates.length > 0) {
        candidates = fallbackCandidates;
        candidateConfidenceUsed = fallbackMinConfidence;
        fallbackUsed = true;
        summary.skipped.push(
          `Fallback mode engaged at confidence ${fallbackMinConfidence} (${fallbackHighCriticalOnly ? "high/critical only" : "all severities"}).`
        );
      } else {
        summary.skipped.push(
          `Fallback mode found no safe candidates at confidence ${fallbackMinConfidence}.`
        );
      }
    }

    summary.candidateConfidenceUsed = candidateConfidenceUsed;
    summary.fallbackUsed = fallbackUsed;
    summary.candidatesInspected = candidates.length;

    if (candidates.length === 0) {
      summary.skipped.push("No safe auto-fix candidates found at configured confidence threshold.");
    }

    for (let index = 0; index < candidates.length; index += 1) {
      if (summary.prsOpened.length >= maxPrs) break;

      const candidate = candidates[index];
      checkoutDefault(clonePath, defaultBranch);

      const branchName = `judges-autofix-${new Date().toISOString().slice(0, 10)}-${index + 1}`;
      run("git", ["checkout", "-b", branchName], clonePath);

      const changed = applySingleLineFix(clonePath, candidate, candidateConfidenceUsed);
      if (!changed) {
        summary.skipped.push(
          `Skipped ${candidate.ruleId} (${candidate.severity}) ${candidate.filePath}:${candidate.line} (did not improve finding count).`
        );
        continue;
      }

      if (dryRun) {
        summary.skipped.push(
          `Dry run: prepared ${candidate.ruleId} (${candidate.severity}) fix for ${candidate.filePath}:${candidate.line} on branch ${branchName}.`
        );
        continue;
      }

      try {
        const prUrl = createPullRequest(
          clonePath,
          owner,
          repo,
          login,
          defaultBranch,
          branchName,
          candidate
        );

        summary.prsOpened.push({
          branch: branchName,
          title: `fix: ${candidate.ruleId} remediation in ${candidate.filePath}`,
          url: prUrl,
          ruleId: candidate.ruleId,
          filePath: candidate.filePath,
          line: candidate.line,
        });
      } catch (error) {
        summary.skipped.push(
          `Failed PR for ${candidate.ruleId} (${candidate.severity}) ${candidate.filePath}:${candidate.line}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } finally {
    const outputPath = resolve(process.env.SUMMARY_PATH ?? "daily-autofix-summary.json");
    writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
    rmSync(workspace, { recursive: true, force: true });
  }
}

main();
