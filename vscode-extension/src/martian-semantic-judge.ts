/**
 * Martian-Compatible Semantic Judge
 *
 * Implements the same matching logic as Martian's step3_judge_comments
 * but using the VS Code Language Model API (Copilot Chat) instead of
 * a direct LLM API key.
 *
 * For each golden comment × candidate pair, asks the LLM:
 *   "Do these describe the same underlying code issue?"
 *
 * This produces precision/recall/F1 scores comparable to the Martian
 * leaderboard at codereview.withmartian.com.
 */

import * as vscode from "vscode";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GoldenComment {
  comment: string;
  severity: string;
}

interface MartianPr {
  pr_title: string;
  url: string;
  comments: GoldenComment[];
}

interface MatchResult {
  goldenIdx: number;
  candidateIdx: number;
  matched: boolean;
  explanation: string;
}

interface PrEvaluation {
  prUrl: string;
  prTitle: string;
  repo: string;
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  matches: Array<{ golden: string; candidate: string }>;
  missedGolden: string[];
  falseCandidates: string[];
}

// ─── LLM Judge ──────────────────────────────────────────────────────────────

const JUDGE_PROMPT = `You are an expert code review evaluator. Given a "golden" comment (a real issue found by a human reviewer) and a "candidate" comment (an issue found by an AI tool), determine if they describe the SAME underlying code issue.

Rules:
- Match on the substance of the issue, not wording. Different terminology is fine.
- The candidate does not need to be identical — it should identify roughly the same bug, risk, or concern.
- If the candidate identifies a SUBSET of the golden issue (e.g., identifies the null check but not the race condition that causes it), that still counts as a partial match — answer YES.
- If the candidate identifies a completely different issue in the same file, answer NO.

Respond with EXACTLY one line: "YES" or "NO"

Golden comment: {golden}

Candidate comment: {candidate}

Answer (YES or NO):`;

async function judgeMatch(
  model: vscode.LanguageModelChat,
  golden: string,
  candidate: string,
  token: vscode.CancellationToken,
): Promise<boolean> {
  const prompt = JUDGE_PROMPT.replace("{golden}", golden.slice(0, 500)).replace("{candidate}", candidate.slice(0, 500));

  try {
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {}, token);

    let text = "";
    for await (const chunk of response.text) {
      text += chunk;
    }

    return text.trim().toUpperCase().startsWith("YES");
  } catch {
    return false;
  }
}

// ─── Candidate Extraction ───────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** Maximum candidates to keep per PR — mirrors production review comment limits. */
const MAX_CANDIDATES_PER_PR = 8;

interface RankedCandidate {
  text: string;
  severity: number;
  ruleId: string;
}

function extractCandidatesFromResponse(rawResponse: string): string[] {
  const ranked: RankedCandidate[] = [];
  const seen = new Set<string>();

  // Split on finding headers
  const blocks = rawResponse.split(/(?=###?\s+\*?\*?[A-Z]{2,}-\d{3})/g);

  for (const block of blocks) {
    const headerMatch = block.match(/^###?\s+\*?\*?([A-Z]{2,}-\d{3})[:\s—\-]+(.+?)(?:\*\*)?$/m);
    if (!headerMatch) continue;

    const ruleId = headerMatch[1];
    const title = headerMatch[2].trim().replace(/\*+$/g, "").trim();

    // Extract severity
    const sevMatch = block.match(/\*?\*?Severity\*?\*?[:\s]+\*?\*?(\w+)/i);
    const severity = SEVERITY_RANK[(sevMatch?.[1] ?? "medium").toLowerCase()] ?? 2;

    // Extract description
    let description = "";
    const descMatch = block.match(
      /\*?\*?(?:Description|Evidence|Details?|Issue)\*?\*?[:\s]+(.+?)(?=\n\*?\*?(?:Severity|Recommendation|Remediation|Location|Impact|Score|Verdict|\n##|\n---)|$)/is,
    );
    if (descMatch) {
      description = descMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
    }

    const text = description ? `${title}: ${description}` : title;

    const key = text.toLowerCase().replace(/\s+/g, " ").slice(0, 100);
    if (!seen.has(key) && text.length > 10) {
      seen.add(key);
      ranked.push({ text, severity, ruleId });
    }
  }

  // Sort by severity (highest first), then keep top N
  ranked.sort((a, b) => b.severity - a.severity);
  return ranked.slice(0, MAX_CANDIDATES_PER_PR).map((r) => r.text);
}

// ─── Main Evaluation ────────────────────────────────────────────────────────

export async function runMartianSemanticJudge(token: vscode.CancellationToken, storageUri: vscode.Uri): Promise<void> {
  const channel = vscode.window.createOutputChannel("Judges Martian Scoring");
  channel.show(true);

  const log = (msg: string) => channel.appendLine(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

  log("Starting Martian-compatible semantic judge evaluation");

  // 1. Resolve LLM model
  const models = await vscode.lm.selectChatModels({});
  if (models.length === 0) {
    vscode.window.showErrorMessage("No language models available. Ensure GitHub Copilot is signed in.");
    return;
  }
  const model = models[0];
  log(`Using model: ${model.name || model.id}`);

  // 2. Load our snapshot
  const snapshotPath = join(
    process.env.APPDATA || process.env.HOME || "",
    "Code",
    "User",
    "globalStorage",
    "kevinrabun.judges-panel",
    "martian-code-review-snapshot-latest.json",
  );

  if (!existsSync(snapshotPath)) {
    vscode.window.showErrorMessage("No Martian benchmark results found. Run the external benchmark first.");
    return;
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  log(`Loaded ${snapshot.cases.length} cases from snapshot`);

  // 3. Load golden comments
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const goldenDir = resolve(workspaceRoot, "..", "code-review-benchmark", "offline", "golden_comments");

  if (!existsSync(goldenDir)) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      title: "Select the code-review-benchmark/offline/golden_comments directory",
    });
    if (!picked) return;
  }

  const goldenByRepo = new Map<string, MartianPr[]>();
  for (const file of readdirSync(goldenDir).filter((f: string) => f.endsWith(".json"))) {
    const repoName = file.replace(".json", "");
    goldenByRepo.set(repoName, JSON.parse(readFileSync(join(goldenDir, file), "utf-8")));
  }

  // 4. Match cases to PRs and run semantic judge
  const evaluations: PrEvaluation[] = [];
  let totalLlmCalls = 0;
  let prIdx = 0;
  const totalPrs = snapshot.cases.length;

  for (const [repoName, prs] of goldenByRepo) {
    for (const pr of prs) {
      if (token.isCancellationRequested) break;

      prIdx++;
      const casePrefix = `martian-${repoName}-${pr.pr_title
        .slice(0, 40)
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase()}`;

      const matchingCase = snapshot.cases.find((c: any) => c.caseId.startsWith(casePrefix));

      if (!matchingCase) continue;

      log(`\n[${prIdx}/${totalPrs}] ${repoName}: ${pr.pr_title.slice(0, 50)}`);

      // Extract candidates from our LLM response
      const candidates = extractCandidatesFromResponse(matchingCase.rawResponse);
      log(`  Candidates: ${candidates.length}, Golden: ${pr.comments.length}`);

      if (candidates.length === 0) {
        evaluations.push({
          prUrl: pr.url,
          prTitle: pr.pr_title,
          repo: repoName,
          precision: 1,
          recall: 0,
          f1: 0,
          truePositives: 0,
          falsePositives: 0,
          falseNegatives: pr.comments.length,
          matches: [],
          missedGolden: pr.comments.map((g) => g.comment.slice(0, 80)),
          falseCandidates: [],
        });
        continue;
      }

      // Pairwise matching: for each golden, find if any candidate matches
      const matchedGoldenIdx = new Set<number>();
      const matchedCandidateIdx = new Set<number>();
      const matches: Array<{ golden: string; candidate: string }> = [];

      for (let gi = 0; gi < pr.comments.length; gi++) {
        if (token.isCancellationRequested) break;

        for (let ci = 0; ci < candidates.length; ci++) {
          if (matchedCandidateIdx.has(ci)) continue; // already matched

          totalLlmCalls++;
          const isMatch = await judgeMatch(model, pr.comments[gi].comment, candidates[ci], token);

          if (isMatch) {
            matchedGoldenIdx.add(gi);
            matchedCandidateIdx.add(ci);
            matches.push({
              golden: pr.comments[gi].comment.slice(0, 80),
              candidate: candidates[ci].slice(0, 80),
            });
            log(`  ✅ Match: "${pr.comments[gi].comment.slice(0, 50)}" ↔ "${candidates[ci].slice(0, 50)}"`);
            break; // move to next golden
          }
        }
      }

      const tp = matches.length;
      const fp = candidates.length - matchedCandidateIdx.size;
      const fn = pr.comments.length - matchedGoldenIdx.size;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      log(
        `  TP=${tp} FP=${fp} FN=${fn} Prec=${(precision * 100).toFixed(0)}% Rec=${(recall * 100).toFixed(0)}% F1=${(f1 * 100).toFixed(0)}%`,
      );

      evaluations.push({
        prUrl: pr.url,
        prTitle: pr.pr_title,
        repo: repoName,
        precision,
        recall,
        f1,
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn,
        matches,
        missedGolden: pr.comments.filter((_, i) => !matchedGoldenIdx.has(i)).map((g) => g.comment.slice(0, 80)),
        falseCandidates: candidates.filter((_, i) => !matchedCandidateIdx.has(i)).map((c) => c.slice(0, 80)),
      });
    }
  }

  // 5. Compute aggregate metrics
  let aggTP = 0,
    aggFP = 0,
    aggFN = 0;
  for (const e of evaluations) {
    aggTP += e.truePositives;
    aggFP += e.falsePositives;
    aggFN += e.falseNegatives;
  }

  const aggPrecision = aggTP + aggFP > 0 ? aggTP / (aggTP + aggFP) : 1;
  const aggRecall = aggTP + aggFN > 0 ? aggTP / (aggTP + aggFN) : 1;
  const aggF1 = aggPrecision + aggRecall > 0 ? (2 * aggPrecision * aggRecall) / (aggPrecision + aggRecall) : 0;

  log(`\n${"═".repeat(60)}`);
  log(`MARTIAN-COMPATIBLE RESULTS (semantic LLM judge)`);
  log(`${"═".repeat(60)}`);
  log(`PRs Evaluated: ${evaluations.length}`);
  log(`Total LLM Calls: ${totalLlmCalls}`);
  log(`TP: ${aggTP}  FP: ${aggFP}  FN: ${aggFN}`);
  log(`Precision: ${(aggPrecision * 100).toFixed(1)}%`);
  log(`Recall:    ${(aggRecall * 100).toFixed(1)}%`);
  log(`F1 Score:  ${(aggF1 * 100).toFixed(1)}%`);
  log(`${"═".repeat(60)}`);

  // Per-repo breakdown
  const perRepo = new Map<string, { tp: number; fp: number; fn: number }>();
  for (const e of evaluations) {
    const r = perRepo.get(e.repo) || { tp: 0, fp: 0, fn: 0 };
    r.tp += e.truePositives;
    r.fp += e.falsePositives;
    r.fn += e.falseNegatives;
    perRepo.set(e.repo, r);
  }
  log("\nPer-Repo:");
  for (const [repo, r] of perRepo) {
    const p = r.tp + r.fp > 0 ? r.tp / (r.tp + r.fp) : 1;
    const rc = r.tp + r.fn > 0 ? r.tp / (r.tp + r.fn) : 1;
    const f = p + rc > 0 ? (2 * p * rc) / (p + rc) : 0;
    log(
      `  ${repo}: Prec=${(p * 100).toFixed(0)}% Rec=${(rc * 100).toFixed(0)}% F1=${(f * 100).toFixed(0)}% (TP=${r.tp} FP=${r.fp} FN=${r.fn})`,
    );
  }

  // Save results
  const resultsJson = JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      model: model.name || model.id,
      judgeMethod: "semantic-llm-match",
      totalPrs: evaluations.length,
      precision: aggPrecision,
      recall: aggRecall,
      f1Score: aggF1,
      truePositives: aggTP,
      falsePositives: aggFP,
      falseNegatives: aggFN,
      totalLlmCalls,
      evaluations,
    },
    null,
    2,
  );

  const enc = new TextEncoder();
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(storageUri, "martian-semantic-judge-results.json"),
    enc.encode(resultsJson),
  );

  // Generate report
  const reportLines = [
    "# Martian Code Review Benchmark — Semantic Judge Results",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Model:** ${model.name || model.id}`,
    `**Judge Method:** Semantic LLM match (Martian-compatible)`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| PRs Evaluated | ${evaluations.length} |`,
    `| Precision | ${(aggPrecision * 100).toFixed(1)}% |`,
    `| Recall | ${(aggRecall * 100).toFixed(1)}% |`,
    `| **F1 Score** | **${(aggF1 * 100).toFixed(1)}%** |`,
    `| True Positives | ${aggTP} |`,
    `| False Positives | ${aggFP} |`,
    `| False Negatives | ${aggFN} |`,
    "",
    "## Comparison with Martian Leaderboard (Offline, Claude Opus 4.5 judge)",
    "",
    "| Rank | Tool | F1 | Precision | Recall |",
    "|------|------|-----|-----------|--------|",
    `| ? | **Judges Panel** | **${(aggF1 * 100).toFixed(1)}%** | **${(aggPrecision * 100).toFixed(1)}%** | **${(aggRecall * 100).toFixed(1)}%** |`,
    "| #1 | Cubic Dev | 61.8% | 56.3% | 68.6% |",
    "| #2 | Qodo Extended | 57.9% | 54.9% | 61.3% |",
    "| #3 | Augment | 53.5% | 47.5% | 61.3% |",
    "",
  ];

  const doc = await vscode.workspace.openTextDocument({
    content: reportLines.join("\n"),
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });

  vscode.window.showInformationMessage(
    `Martian Semantic Judge: F1=${(aggF1 * 100).toFixed(1)}% Prec=${(aggPrecision * 100).toFixed(1)}% Rec=${(aggRecall * 100).toFixed(1)}%`,
  );
}
