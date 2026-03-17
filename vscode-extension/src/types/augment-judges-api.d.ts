declare module "@kevinrabun/judges/api" {
  // Minimal type augmentation to keep VS Code extension compiling against local workspace
  export interface JudgeDefinition {
    id: string;
    name: string;
    rulePrefix: string;
  }

  export interface BenchmarkCase {
    id: string;
    code: string;
    language: string;
    category: string;
    difficulty: string;
    expectedRuleIds: string[];
  }

  export interface LlmCaseResult {
    caseId: string;
    category: string;
    difficulty: string;
    passed: boolean;
    expectedRuleIds: string[];
    detectedRuleIds: string[];
    missedRuleIds: string[];
    falsePositiveRuleIds: string[];
    rawResponse: string;
    tokensUsed?: number;
  }

  export interface LlmBenchmarkSnapshot {
    timestamp: string;
    version: string;
    model: string;
    provider: string;
    promptMode: "tribunal" | "per-judge";
    totalCases: number;
    detected: number;
    missed: number;
    totalExpected: number;
    truePositives: number;
    falseNegatives: number;
    falsePositives: number;
    precision: number;
    recall: number;
    f1Score: number;
    detectionRate: number;
    perCategory: Record<string, unknown>;
    perJudge: Record<string, unknown>;
    perDifficulty: Record<string, unknown>;
    cases: LlmCaseResult[];
    totalTokensUsed?: number;
    durationSeconds: number;
  }

  export const JUDGES: JudgeDefinition[];
  export const BENCHMARK_CASES: BenchmarkCase[];

  export function parseLlmRuleIds(response: string): string[];
  export function constructPerJudgePrompt(judge: JudgeDefinition, code: string, language: string): string;
  export function constructTribunalPrompt(code: string, language: string, contextSnippets?: string[]): string;
  export function selectStratifiedSample(cases: BenchmarkCase[], targetSize: number): BenchmarkCase[];
  export function scoreLlmCase(
    tc: BenchmarkCase,
    detectedRuleIds: string[],
    rawResponse: string,
    tokensUsed?: number,
  ): LlmCaseResult;
  export function computeLlmMetrics(
    rawCases: LlmCaseResult[],
    version: string,
    model: string,
    provider: string,
    promptMode: "tribunal" | "per-judge",
    durationSeconds: number,
    totalTokensUsed?: number,
  ): LlmBenchmarkSnapshot;

  export function extractValidatedLlmFindings(
    response: string,
    prefixes?: ReadonlySet<string>,
  ): { ruleIds: string[]; errors: string[]; findings?: unknown[] };
  export function getValidRulePrefixes(): Set<string>;
}
