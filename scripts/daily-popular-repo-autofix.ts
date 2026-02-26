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
  "https://github.com/OpenClawAI/OpenClaw",
  "https://github.com/All-Hands-AI/OpenHands",
  "https://github.com/OpenDevin/OpenDevin",
  "https://github.com/Significant-Gravitas/AutoGPT",
  "https://github.com/microsoft/autogen",
  "https://github.com/microsoft/semantic-kernel",
  "https://github.com/microsoft/promptflow",
  "https://github.com/microsoft/graphrag",
  "https://github.com/microsoft/onnxruntime",
  "https://github.com/microsoft/Olive",
  "https://github.com/microsoft/markitdown",
  "https://github.com/microsoft/vscode",
  "https://github.com/microsoft/vscode-copilot-release",
  "https://github.com/langchain-ai/langchain",
  "https://github.com/langchain-ai/langgraph",
  "https://github.com/langchain-ai/langchainjs",
  "https://github.com/langchain-ai/langserve",
  "https://github.com/run-llama/llama_index",
  "https://github.com/crewAIInc/crewAI",
  "https://github.com/crewAIInc/crewAI-tools",
  "https://github.com/BerriAI/litellm",
  "https://github.com/camel-ai/camel",
  "https://github.com/stanfordnlp/dspy",
  "https://github.com/OpenInterpreter/open-interpreter",
  "https://github.com/Aider-AI/aider",
  "https://github.com/continue-rev/continue",
  "https://github.com/Codium-ai/pr-agent",
  "https://github.com/SweepAI/sweep",
  "https://github.com/TabbyML/tabby",
  "https://github.com/cline/cline",
  "https://github.com/stackblitz-labs/bolt.diy",
  "https://github.com/browser-use/browser-use",
  "https://github.com/assafelovic/gpt-researcher",
  "https://github.com/langgenius/dify",
  "https://github.com/FlowiseAI/Flowise",
  "https://github.com/open-webui/open-webui",
  "https://github.com/lobehub/lobe-chat",
  "https://github.com/ChatGPTNextWeb/NextChat",
  "https://github.com/mckaywrigley/chatbot-ui",
  "https://github.com/Mintplex-Labs/anything-llm",
  "https://github.com/vercel/ai",
  "https://github.com/modelcontextprotocol/servers",
  "https://github.com/modelcontextprotocol/specification",
  "https://github.com/langfuse/langfuse",
  "https://github.com/Arize-ai/phoenix",
  "https://github.com/traceloop/openllmetry",
  "https://github.com/promptfoo/promptfoo",
  "https://github.com/mlflow/mlflow",
  "https://github.com/wandb/wandb",
  "https://github.com/openai/openai-python",
  "https://github.com/openai/openai-node",
  "https://github.com/openai/openai-cookbook",
  "https://github.com/openai/whisper",
  "https://github.com/anthropics/anthropic-sdk-python",
  "https://github.com/huggingface/transformers",
  "https://github.com/huggingface/diffusers",
  "https://github.com/huggingface/text-generation-inference",
  "https://github.com/huggingface/accelerate",
  "https://github.com/huggingface/peft",
  "https://github.com/huggingface/trl",
  "https://github.com/huggingface/tokenizers",
  "https://github.com/ggerganov/llama.cpp",
  "https://github.com/abetlen/llama-cpp-python",
  "https://github.com/ollama/ollama",
  "https://github.com/vllm-project/vllm",
  "https://github.com/ray-project/ray",
  "https://github.com/pytorch/pytorch",
  "https://github.com/Lightning-AI/litgpt",
  "https://github.com/NVIDIA/TensorRT-LLM",
  "https://github.com/NVIDIA/NeMo",
  "https://github.com/NVIDIA/Megatron-LM",
  "https://github.com/deepspeedai/DeepSpeed",
  "https://github.com/mlc-ai/mlc-llm",
  "https://github.com/apache/tvm",
  "https://github.com/tensorflow/tensorflow",
  "https://github.com/keras-team/keras",
  "https://github.com/jax-ml/jax",
  "https://github.com/google/flax",
  "https://github.com/google-deepmind/alphafold",
  "https://github.com/lm-sys/FastChat",
  "https://github.com/Dao-AILab/flash-attention",
  "https://github.com/SYSTRAN/faster-whisper",
  "https://github.com/karpathy/llm.c",
  "https://github.com/karpathy/minGPT",
  "https://github.com/karpathy/nanoGPT",
  "https://github.com/deepset-ai/haystack",
  "https://github.com/infiniflow/ragflow",
  "https://github.com/Qdrant/qdrant",
  "https://github.com/chroma-core/chroma",
  "https://github.com/milvus-io/milvus",
  "https://github.com/weaviate/weaviate",
  "https://github.com/lancedb/lancedb",
  "https://github.com/jina-ai/reader",
  "https://github.com/jina-ai/serve",
  "https://github.com/instructor-ai/instructor",
  "https://github.com/guidance-ai/guidance",
  "https://github.com/dottxt-ai/outlines",
  "https://github.com/mem0ai/mem0",
  "https://github.com/e2b-dev/E2B",
  "https://github.com/exa-labs/exa-py",
  "https://github.com/composiohq/composio",
  "https://github.com/supabase/supabase",
  "https://github.com/n8n-io/n8n",
  "https://github.com/vercel/next.js",
  "https://github.com/remix-run/remix",
  "https://github.com/nuxt/nuxt",
  "https://github.com/sveltejs/kit",
  "https://github.com/fastapi/fastapi",
  "https://github.com/tiangolo/fastapi",
  "https://github.com/expressjs/express",
  "https://github.com/nestjs/nest",
  "https://github.com/django/django",
  "https://github.com/pallets/flask",
  "https://github.com/nodejs/node",
  "https://github.com/python/cpython",
  "https://github.com/golang/go",
  "https://github.com/rust-lang/rust",
  "https://github.com/microsoft/TypeScript",
  "https://github.com/denoland/deno",
  "https://github.com/astral-sh/uv",
  "https://github.com/docker/cli",
  "https://github.com/kubernetes/kubernetes",
  "https://github.com/hashicorp/terraform",
  "https://github.com/prometheus/prometheus",
  "https://github.com/grafana/grafana",
];

const DEFAULT_MAX_REPOS_PER_DAY = 10;
const DEFAULT_MAX_PRS_PER_REPO = 5;

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
  confidence: number;
  title: string;
  previousLine: string;
  replacementLine: string;
  reason: string;
};

type RepoRunSummary = {
  repoUrl: string;
  defaultBranch: string;
  candidateConfidenceUsed: number;
  fallbackUsed: boolean;
  priorityRulePrefixesUsed: string[];
  judgesFindingsScanned: number;
  candidatesDiscovered: number;
  candidatesAfterLocationDedupe: number;
  candidatesInspected: number;
  prioritizedRuleCounts: Array<{
    ruleId: string;
    count: number;
  }>;
  topPrioritizedRuleCounts: Array<{
    ruleId: string;
    count: number;
  }>;
  topPrioritizedCandidates: Array<{
    ruleId: string;
    severity: Finding["severity"];
    confidence: number;
    filePath: string;
    line: number;
    priorityScore: number;
  }>;
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

type Summary = {
  selectedRepos: string[];
  generatedAt: string;
  dryRun: boolean;
  maxPrsPerRepo: number;
  maxReposPerDay: number;
  runAggregate: {
    reposProcessed: number;
    reposWithPrioritizedCandidates: number;
    reposWithOpenedPrs: number;
    totalCandidatesDiscovered: number;
    totalCandidatesAfterLocationDedupe: number;
    dedupeReductionPercent: number;
    totalPrioritizedCandidates: number;
    totalPrioritizedRuleOccurrences: number;
    topPrioritizedRules: Array<{
      ruleId: string;
      count: number;
    }>;
  };
  repoRuns: RepoRunSummary[];
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
  if (process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()) {
    return true;
  }

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

function listPublicReposForOwner(owner: string): string[] {
  const output = run("gh", [
    "api",
    "--paginate",
    `users/${owner}/repos?per_page=100&type=public&sort=updated`,
    "--jq",
    '.[] | select((.private == false) and (.archived == false) and (.fork == false)) | .html_url',
  ]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function selectRepositories(maxReposPerDay: number): string[] {
  const forced = process.env.TARGET_REPO_URL?.trim();
  if (forced) {
    return [forced];
  }

  const targetOwner = process.env.TARGET_REPO_OWNER?.trim();
  if (targetOwner) {
    const ownerRepos = [...new Set(listPublicReposForOwner(targetOwner))];
    if (ownerRepos.length === 0) {
      throw new Error(`No public non-fork repositories found for TARGET_REPO_OWNER=${targetOwner}.`);
    }

    const reposToPick = Math.max(1, Math.min(maxReposPerDay, ownerRepos.length));
    const startIndex = dayOfYear(new Date()) % ownerRepos.length;
    const selected: string[] = [];
    for (let offset = 0; offset < reposToPick; offset += 1) {
      selected.push(ownerRepos[(startIndex + offset) % ownerRepos.length]);
    }
    return selected;
  }

  const fromEnv = process.env.POPULAR_REPOS
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const repos = [...new Set(fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_POPULAR_REPOS)];

  const reposToPick = Math.max(1, Math.min(maxReposPerDay, repos.length));
  const startIndex = dayOfYear(new Date()) % repos.length;
  const selected: string[] = [];
  for (let offset = 0; offset < reposToPick; offset += 1) {
    selected.push(repos[(startIndex + offset) % repos.length]);
  }
  return selected;
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

function severityPriority(severity: Finding["severity"]): number {
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

function normalizeConfidence(confidence?: number): number {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    return 0.75;
  }

  return Math.max(0, Math.min(1, confidence));
}

function parsePriorityRulePrefixes(): string[] {
  const configured = process.env.AUTOFIX_PRIORITY_RULE_PREFIXES
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return [...new Set(configured)];
  }

  return ["AUTH", "CYBER", "DATA", "CFG", "COMP"];
}

function candidatePriorityScore(candidate: CandidateFix, priorityPrefixes: string[]): number {
  const prefix = candidate.ruleId.split("-")[0].toUpperCase();
  const prefixBoost = priorityPrefixes.includes(prefix) ? 3 : 0;
  return severityPriority(candidate.severity) * 100 + prefixBoost * 100 + Math.round(candidate.confidence * 100);
}

function prioritizeCandidates(candidates: CandidateFix[], priorityPrefixes: string[]): CandidateFix[] {
  return [...candidates].sort((left, right) => {
    const scoreDiff = candidatePriorityScore(right, priorityPrefixes) - candidatePriorityScore(left, priorityPrefixes);
    if (scoreDiff !== 0) return scoreDiff;

    const severityDiff = severityPriority(right.severity) - severityPriority(left.severity);
    if (severityDiff !== 0) return severityDiff;

    const confidenceDiff = right.confidence - left.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    return left.ruleId.localeCompare(right.ruleId);
  });
}

function summarizePrioritizedRuleCounts(candidates: CandidateFix[]): Array<{ ruleId: string; count: number }> {
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    counts.set(candidate.ruleId, (counts.get(candidate.ruleId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.ruleId.localeCompare(right.ruleId);
    });
}

function summarizeTopPrioritizedCandidates(
  candidates: CandidateFix[],
  priorityPrefixes: string[]
): RepoRunSummary["topPrioritizedCandidates"] {
  return candidates.slice(0, 10).map((candidate) => ({
    ruleId: candidate.ruleId,
    severity: candidate.severity,
    confidence: candidate.confidence,
    filePath: candidate.filePath,
    line: candidate.line,
    priorityScore: candidatePriorityScore(candidate, priorityPrefixes),
  }));
}

function dedupeCandidatesByLocation(
  candidates: CandidateFix[],
  priorityPrefixes: string[]
): CandidateFix[] {
  const byLocation = new Map<string, CandidateFix>();

  for (const candidate of candidates) {
    const key = `${candidate.filePath}:${candidate.line}`;
    const existing = byLocation.get(key);

    if (!existing) {
      byLocation.set(key, candidate);
      continue;
    }

    const nextScore = candidatePriorityScore(candidate, priorityPrefixes);
    const existingScore = candidatePriorityScore(existing, priorityPrefixes);
    if (nextScore > existingScore) {
      byLocation.set(key, candidate);
    }
  }

  return prioritizeCandidates([...byLocation.values()], priorityPrefixes);
}

function buildRunAggregate(repoRuns: RepoRunSummary[]): Summary["runAggregate"] {
  const topRuleCounts = new Map<string, number>();

  for (const repoRun of repoRuns) {
    for (const entry of repoRun.prioritizedRuleCounts) {
      topRuleCounts.set(entry.ruleId, (topRuleCounts.get(entry.ruleId) ?? 0) + entry.count);
    }
  }

  const topPrioritizedRules = [...topRuleCounts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.ruleId.localeCompare(right.ruleId);
    })
    .slice(0, 10);

  const reposWithPrioritizedCandidates = repoRuns.filter((repoRun) => repoRun.candidatesInspected > 0).length;
  const reposWithOpenedPrs = repoRuns.filter((repoRun) => repoRun.prsOpened.length > 0).length;
  const totalCandidatesDiscovered = repoRuns.reduce(
    (sum, repoRun) => sum + repoRun.candidatesDiscovered,
    0
  );
  const totalCandidatesAfterLocationDedupe = repoRuns.reduce(
    (sum, repoRun) => sum + repoRun.candidatesAfterLocationDedupe,
    0
  );
  const totalPrioritizedCandidates = repoRuns.reduce(
    (sum, repoRun) => sum + repoRun.candidatesInspected,
    0
  );
  const dedupeReductionPercent =
    totalCandidatesDiscovered > 0
      ? Number((((totalCandidatesDiscovered - totalCandidatesAfterLocationDedupe) / totalCandidatesDiscovered) * 100).toFixed(2))
      : 0;
  const totalPrioritizedRuleOccurrences = [...topRuleCounts.values()].reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    reposProcessed: repoRuns.length,
    reposWithPrioritizedCandidates,
    reposWithOpenedPrs,
    totalCandidatesDiscovered,
    totalCandidatesAfterLocationDedupe,
    dedupeReductionPercent,
    totalPrioritizedCandidates,
    totalPrioritizedRuleOccurrences,
    topPrioritizedRules,
  };
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
        confidence: normalizeConfidence(finding.confidence),
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

function processRepository(
  selectedRepo: string,
  dryRun: boolean,
  maxPrs: number,
  minConfidence: number,
  includeTotalFindingsScan: boolean,
  fallbackEnabled: boolean,
  fallbackMinConfidence: number,
  fallbackHighCriticalOnly: boolean
): RepoRunSummary {
  const { owner, repo } = parseRepoFromUrl(selectedRepo);
  const repoRun: RepoRunSummary = {
    repoUrl: selectedRepo,
    defaultBranch: "",
    candidateConfidenceUsed: minConfidence,
    fallbackUsed: false,
    priorityRulePrefixesUsed: [],
    judgesFindingsScanned: 0,
    candidatesDiscovered: 0,
    candidatesAfterLocationDedupe: 0,
    candidatesInspected: 0,
    prioritizedRuleCounts: [],
    topPrioritizedRuleCounts: [],
    topPrioritizedCandidates: [],
    prsOpened: [],
    skipped: [],
  };
  const priorityRulePrefixes = parsePriorityRulePrefixes();
  repoRun.priorityRulePrefixesUsed = [...priorityRulePrefixes];

  const workspace = mkdtempSync(join(tmpdir(), "judges-daily-autofix-"));
  const clonePath = join(workspace, `${owner}-${repo}`);

  try {
    if (!isPublicRepo(owner, repo)) {
      repoRun.skipped.push("Target repository is not public. Skipping run.");
      return repoRun;
    }

    const prEligibility = canSubmitPrWithoutExtraAuth(owner, repo);
    if (!prEligibility.allowed) {
      repoRun.skipped.push(prEligibility.reason ?? "Current auth cannot create PRs for this repository.");
      return repoRun;
    }

    run("git", ["clone", "--depth", "1", selectedRepo, clonePath]);
    const defaultBranch = detectDefaultBranch(clonePath);
    repoRun.defaultBranch = defaultBranch;

    run("git", ["config", "user.name", "judges-bot"], clonePath);
    run("git", ["config", "user.email", "judges-bot@users.noreply.github.com"], clonePath);

    const login = run("gh", ["api", "user", "--jq", ".login"]);
    ensureFork(owner, repo, login);
    ensureForkRemote(clonePath, login, repo);

    if (includeTotalFindingsScan) {
      repoRun.judgesFindingsScanned = countTotalFindings(clonePath, 0);
    }

    let candidates = discoverFixCandidates(clonePath, {
      minConfidence,
      highCriticalOnly: false,
    });

    repoRun.candidatesDiscovered = candidates.length;

    candidates = prioritizeCandidates(candidates, priorityRulePrefixes);
    candidates = dedupeCandidatesByLocation(candidates, priorityRulePrefixes);
    repoRun.candidatesAfterLocationDedupe = candidates.length;

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
        candidates = prioritizeCandidates(fallbackCandidates, priorityRulePrefixes);
        repoRun.candidatesDiscovered = fallbackCandidates.length;
        candidates = dedupeCandidatesByLocation(candidates, priorityRulePrefixes);
        repoRun.candidatesAfterLocationDedupe = candidates.length;
        repoRun.candidateConfidenceUsed = fallbackMinConfidence;
        repoRun.fallbackUsed = true;
        repoRun.skipped.push(
          `Fallback mode engaged at confidence ${fallbackMinConfidence} (${fallbackHighCriticalOnly ? "high/critical only" : "all severities"}).`
        );
      } else {
        repoRun.skipped.push(
          `Fallback mode found no safe candidates at confidence ${fallbackMinConfidence}.`
        );
      }
    }

    repoRun.candidatesInspected = candidates.length;
    repoRun.prioritizedRuleCounts = summarizePrioritizedRuleCounts(candidates);
    repoRun.topPrioritizedRuleCounts = repoRun.prioritizedRuleCounts.slice(0, 10);
    repoRun.topPrioritizedCandidates = summarizeTopPrioritizedCandidates(
      candidates,
      priorityRulePrefixes
    );

    if (candidates.length === 0) {
      repoRun.skipped.push("No safe auto-fix candidates found at configured confidence threshold.");
    }

    for (let index = 0; index < candidates.length; index += 1) {
      if (repoRun.prsOpened.length >= maxPrs) break;

      const candidate = candidates[index];
      checkoutDefault(clonePath, defaultBranch);

      const branchName = `judges-autofix-${new Date().toISOString().slice(0, 10)}-${index + 1}`;
      run("git", ["checkout", "-b", branchName], clonePath);

      const changed = applySingleLineFix(clonePath, candidate, repoRun.candidateConfidenceUsed);
      if (!changed) {
        repoRun.skipped.push(
          `Skipped ${candidate.ruleId} (${candidate.severity}) ${candidate.filePath}:${candidate.line} (did not improve finding count).`
        );
        continue;
      }

      if (dryRun) {
        repoRun.skipped.push(
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

        repoRun.prsOpened.push({
          branch: branchName,
          title: `fix: ${candidate.ruleId} remediation in ${candidate.filePath}`,
          url: prUrl,
          ruleId: candidate.ruleId,
          filePath: candidate.filePath,
          line: candidate.line,
        });
      } catch (error) {
        repoRun.skipped.push(
          `Failed PR for ${candidate.ruleId} (${candidate.severity}) ${candidate.filePath}:${candidate.line}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return repoRun;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function main() {
  if (!hasGitHubAuth()) {
    throw new Error("GitHub CLI is not authenticated. Set GH_TOKEN/GITHUB_TOKEN before running.");
  }

  const dryRun = (process.env.DRY_RUN ?? "false").toLowerCase() === "true";
  const parsedMaxPrs = Number.parseInt(process.env.MAX_PRS ?? `${DEFAULT_MAX_PRS_PER_REPO}`, 10);
  const parsedMaxReposPerDay = Number.parseInt(
    process.env.MAX_REPOS_PER_DAY ?? `${DEFAULT_MAX_REPOS_PER_DAY}`,
    10
  );
  const parsedMinConfidence = Number.parseFloat(process.env.MIN_CONFIDENCE ?? "0.9");
  const includeTotalFindingsScan = (process.env.INCLUDE_TOTAL_FINDINGS_SCAN ?? "false").toLowerCase() === "true";
  const fallbackEnabled = (process.env.ENABLE_FALLBACK ?? "true").toLowerCase() === "true";
  const parsedFallbackMinConfidence = Number.parseFloat(process.env.FALLBACK_MIN_CONFIDENCE ?? "0.8");
  const fallbackHighCriticalOnly = (process.env.FALLBACK_HIGH_CRITICAL_ONLY ?? "true").toLowerCase() !== "false";
  const requestedMaxPrs = Number.isFinite(parsedMaxPrs) && parsedMaxPrs > 0
    ? parsedMaxPrs
    : DEFAULT_MAX_PRS_PER_REPO;
  const maxPrs = Math.min(DEFAULT_MAX_PRS_PER_REPO, requestedMaxPrs);
  const requestedMaxReposPerDay = Number.isFinite(parsedMaxReposPerDay) && parsedMaxReposPerDay > 0
    ? parsedMaxReposPerDay
    : DEFAULT_MAX_REPOS_PER_DAY;
  const maxReposPerDay = Math.min(DEFAULT_MAX_REPOS_PER_DAY, requestedMaxReposPerDay);
  const minConfidence = Number.isFinite(parsedMinConfidence) ? parsedMinConfidence : 0.9;
  const fallbackMinConfidence = Number.isFinite(parsedFallbackMinConfidence)
    ? parsedFallbackMinConfidence
    : 0.8;

  const selectedRepos = selectRepositories(maxReposPerDay);
  const summary: Summary = {
    selectedRepos,
    generatedAt: new Date().toISOString(),
    dryRun,
    maxPrsPerRepo: maxPrs,
    maxReposPerDay,
    runAggregate: {
      reposProcessed: 0,
      reposWithPrioritizedCandidates: 0,
      reposWithOpenedPrs: 0,
      totalCandidatesDiscovered: 0,
      totalCandidatesAfterLocationDedupe: 0,
      dedupeReductionPercent: 0,
      totalPrioritizedCandidates: 0,
      totalPrioritizedRuleOccurrences: 0,
      topPrioritizedRules: [],
    },
    repoRuns: [],
    skipped: [],
  };

  try {
    for (const selectedRepo of selectedRepos) {
      try {
        const repoRun = processRepository(
          selectedRepo,
          dryRun,
          maxPrs,
          minConfidence,
          includeTotalFindingsScan,
          fallbackEnabled,
          fallbackMinConfidence,
          fallbackHighCriticalOnly
        );
        summary.repoRuns.push(repoRun);
      } catch (error) {
        summary.repoRuns.push({
          repoUrl: selectedRepo,
          defaultBranch: "",
          candidateConfidenceUsed: minConfidence,
          fallbackUsed: false,
          priorityRulePrefixesUsed: [],
          judgesFindingsScanned: 0,
          candidatesDiscovered: 0,
          candidatesAfterLocationDedupe: 0,
          candidatesInspected: 0,
          prioritizedRuleCounts: [],
          topPrioritizedRuleCounts: [],
          topPrioritizedCandidates: [],
          prsOpened: [],
          skipped: [
            `Repository run failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
        });
      }
    }
  } finally {
    summary.runAggregate = buildRunAggregate(summary.repoRuns);
    const outputPath = resolve(process.env.SUMMARY_PATH ?? "daily-autofix-summary.json");
    writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
  }
}

main();
