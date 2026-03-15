/**
 * Review-token-budget — Estimate and manage token budgets for review sessions.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TokenEstimate {
  component: string;
  tokens: number;
  percentage: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  // rough estimate: ~4 chars per token for English/code
  return Math.ceil(text.length / 4);
}

function analyzeTokenBudget(
  verdict: TribunalVerdict,
  sourceFile?: string,
  maxBudget?: number,
): { estimates: TokenEstimate[]; total: number; budget: number; overBudget: boolean } {
  const estimates: TokenEstimate[] = [];
  let total = 0;

  // source code tokens
  if (sourceFile && existsSync(sourceFile)) {
    const source = readFileSync(sourceFile, "utf-8");
    const tokens = estimateTokens(source);
    estimates.push({ component: "source-code", tokens, percentage: 0 });
    total += tokens;
  }

  // system prompts for active judges
  const judges = defaultRegistry.getJudges();
  let promptTokens = 0;
  for (const j of judges) {
    promptTokens += estimateTokens(j.systemPrompt);
  }
  estimates.push({ component: "system-prompts", tokens: promptTokens, percentage: 0 });
  total += promptTokens;

  // findings output
  const findingsText = JSON.stringify(verdict.findings);
  const findingsTokens = estimateTokens(findingsText);
  estimates.push({ component: "findings-output", tokens: findingsTokens, percentage: 0 });
  total += findingsTokens;

  // evaluations
  const evalsText = JSON.stringify(verdict.evaluations);
  const evalsTokens = estimateTokens(evalsText);
  estimates.push({ component: "evaluations", tokens: evalsTokens, percentage: 0 });
  total += evalsTokens;

  // summary
  const summaryTokens = estimateTokens(verdict.summary || "");
  estimates.push({ component: "summary", tokens: summaryTokens, percentage: 0 });
  total += summaryTokens;

  // compute percentages
  for (const e of estimates) {
    e.percentage = total > 0 ? (e.tokens / total) * 100 : 0;
  }

  const budget = maxBudget !== undefined && maxBudget > 0 ? maxBudget : 128000;
  return { estimates, total, budget, overBudget: total > budget };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTokenBudget(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const budgetIdx = argv.indexOf("--budget");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const budget = budgetIdx >= 0 ? parseInt(argv[budgetIdx + 1], 10) : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-token-budget — Estimate token budget usage

Usage:
  judges review-token-budget --file <verdict.json> [--source <src.ts>]
                             [--budget <max-tokens>] [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --source <path>    Source file for token estimation
  --budget <n>       Maximum token budget (default: 128000)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const result = analyzeTokenBudget(verdict, sourceFile, budget);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nToken Budget Analysis`);
  console.log("═".repeat(60));
  console.log(`  Total estimated tokens: ${result.total.toLocaleString()}`);
  console.log(`  Budget:                 ${result.budget.toLocaleString()}`);
  console.log(`  Status:                 ${result.overBudget ? "OVER BUDGET" : "Within budget"}`);
  console.log("─".repeat(60));
  console.log(`${"Component".padEnd(20)} ${"Tokens".padEnd(12)} ${"% of Total".padEnd(12)}`);
  console.log("─".repeat(60));

  for (const e of result.estimates) {
    console.log(
      `${e.component.padEnd(20)} ${e.tokens.toLocaleString().padEnd(12)} ${e.percentage.toFixed(1).padEnd(12)}`,
    );
  }
  console.log("═".repeat(60));

  if (result.overBudget) {
    console.log(`\nWarning: Estimated tokens exceed budget by ${(result.total - result.budget).toLocaleString()}`);
    console.log("Consider: reducing judges, splitting files, or increasing budget");
  }
}
