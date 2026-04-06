/**
 * Export Judges LLM benchmark results to Martian's benchmark_data.json format.
 *
 * Reads the latest Martian external benchmark snapshot and converts each case's
 * LLM findings into the candidate format expected by Martian's evaluation pipeline.
 *
 * Usage:
 *   npx tsx scripts/export-to-martian.ts --snapshot <path> --golden <path> --output <path>
 *
 * Then run Martian's pipeline:
 *   cd ../code-review-benchmark/offline
 *   uv run python -m code_review_benchmark.step2_extract_comments --tool judges
 *   uv run python -m code_review_benchmark.step3_judge_comments --tool judges
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LlmCaseResult {
  caseId: string;
  category: string;
  difficulty: string;
  passed: boolean;
  expectedRuleIds: string[];
  detectedRuleIds: string[];
  missedRuleIds: string[];
  falsePositiveRuleIds: string[];
  rawResponse: string;
}

interface LlmSnapshot {
  model: string;
  totalCases: number;
  f1Score: number;
  precision: number;
  recall: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  cases: LlmCaseResult[];
}

interface MartianGoldenComment {
  comment: string;
  severity: "Low" | "Medium" | "High" | "Critical";
}

interface MartianPr {
  pr_title: string;
  url: string;
  original_url?: string;
  comments: MartianGoldenComment[];
}

interface MartianBenchmarkEntry {
  pr_title: string;
  original_url?: string;
  source_repo: string;
  golden_comments: MartianGoldenComment[];
  reviews: Array<{
    tool: string;
    pr_url: string;
    review_comments: Array<{ path: string; line: number; body: string }>;
    candidates?: string[];
  }>;
}

// ─── Finding Extraction ─────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** Maximum candidates to keep per PR — top tools on the Martian benchmark post 3-5 comments. */
const MAX_CANDIDATES_PER_PR = 5;

interface RankedCandidate {
  text: string;
  severity: number;
}

/**
 * Extract individual issue candidates from a multi-judge LLM response.
 * Ranks by severity and caps at MAX_CANDIDATES_PER_PR to match how
 * production code review tools limit their output.
 */
function extractCandidatesFromResponse(rawResponse: string): string[] {
  const ranked: RankedCandidate[] = [];
  const seen = new Set<string>();

  // Pattern 1: "### RULE-NNN: Title" or "**RULE-NNN: Title**" or "RULE-NNN — Title"
  const findingBlocks = rawResponse.split(/(?=###?\s+\*?\*?[A-Z]{2,}-\d{3})/g);

  for (const block of findingBlocks) {
    // Match the rule ID and title
    const headerMatch = block.match(/^###?\s+\*?\*?([A-Z]{2,}-\d{3})[:\s—-]+(.+?)(?:\*\*)?$/m);
    if (!headerMatch) continue;

    const title = headerMatch[2].trim().replace(/\*+$/g, "").trim();

    // Extract severity
    const sevMatch = block.match(/\*?\*?Severity\*?\*?[:\s]+\*?\*?(\w+)/i);
    const severity = SEVERITY_RANK[(sevMatch?.[1] ?? "medium").toLowerCase()] ?? 2;

    // Extract the description/evidence section
    let description = "";

    // Look for "Description:", "Evidence:", "**Description:**" etc.
    const descMatch = block.match(
      /\*?\*?(?:Description|Evidence|Details?|Issue)\*?\*?[:\s]+(.+?)(?=\n\*?\*?(?:Severity|Recommendation|Remediation|Location|Impact|Score|Verdict|\n##|\n---)|$)/is,
    );
    if (descMatch) {
      description = descMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
    }

    // Build the candidate string
    const candidate = description ? `${title}: ${description}` : title;

    // Deduplicate by normalized content
    const key = candidate.toLowerCase().replace(/\s+/g, " ").slice(0, 100);
    if (!seen.has(key) && candidate.length > 10) {
      seen.add(key);
      ranked.push({ text: candidate, severity });
    }
  }

  // Pattern 2: Fallback — extract from "Findings" sections if pattern 1 found nothing
  if (ranked.length === 0) {
    const findingsMatch = rawResponse.match(/##?\s*Findings\s*\n([\s\S]*?)(?=\n##?\s|$)/gi);
    if (findingsMatch) {
      for (const section of findingsMatch) {
        const items = section.match(/[-*]\s+\*?\*?([A-Z]{2,}-\d{3})[:\s—-]+(.+)/g);
        if (items) {
          for (const item of items) {
            const cleaned = item
              .replace(/^[-*]\s+\*?\*?/, "")
              .replace(/\*+/g, "")
              .trim();
            const key = cleaned.toLowerCase().slice(0, 100);
            if (!seen.has(key) && cleaned.length > 10) {
              seen.add(key);
              ranked.push({ text: cleaned, severity: 2 }); // default medium
            }
          }
        }
      }
    }
  }

  // Sort by severity (highest first), cap at MAX_CANDIDATES_PER_PR
  ranked.sort((a, b) => b.severity - a.severity);
  return ranked.slice(0, MAX_CANDIDATES_PER_PR).map((r) => r.text);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  let snapshotPath: string | undefined;
  let goldenDir: string | undefined;
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--snapshot") snapshotPath = args[++i];
    else if (args[i] === "--golden") goldenDir = args[++i];
    else if (args[i] === "--output") outputPath = args[++i];
  }

  // Default paths
  if (!snapshotPath) {
    const storageDir = join(
      process.env.APPDATA || process.env.HOME || "",
      "Code",
      "User",
      "globalStorage",
      "kevinrabun.judges-panel",
    );
    snapshotPath = join(storageDir, "martian-code-review-snapshot-latest.json");
  }
  if (!goldenDir) {
    goldenDir = resolve("..", "code-review-benchmark", "offline", "golden_comments");
  }
  if (!outputPath) {
    outputPath = resolve("..", "code-review-benchmark", "offline", "results", "benchmark_data.json");
  }

  console.log(`Snapshot: ${snapshotPath}`);
  console.log(`Golden:   ${goldenDir}`);
  console.log(`Output:   ${outputPath}`);

  // Load snapshot
  const snapshot: LlmSnapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  console.log(`\nLoaded ${snapshot.cases.length} cases from snapshot (F1: ${(snapshot.f1Score * 100).toFixed(1)}%)`);

  // Load golden comments
  const goldenByRepo = new Map<string, MartianPr[]>();
  const goldenFiles = readdirSync(goldenDir).filter((f) => f.endsWith(".json"));
  for (const file of goldenFiles) {
    const repoName = file.replace(".json", "");
    const prs: MartianPr[] = JSON.parse(readFileSync(join(goldenDir, file), "utf-8"));
    goldenByRepo.set(repoName, prs);
  }

  // Load existing benchmark_data.json if it exists (to preserve other tools' reviews)
  let benchmarkData: Record<string, MartianBenchmarkEntry> = {};
  try {
    benchmarkData = JSON.parse(readFileSync(outputPath, "utf-8"));
    console.log(`Loaded existing benchmark_data.json with ${Object.keys(benchmarkData).length} PRs`);
  } catch {
    console.log("No existing benchmark_data.json — creating new one");
  }

  // Map our cases back to golden PRs
  let exported = 0;
  let totalCandidates = 0;

  for (const [repoName, prs] of goldenByRepo) {
    for (const pr of prs) {
      // Find matching case in our snapshot
      const casePrefix = `martian-${repoName}-${pr.pr_title
        .slice(0, 40)
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase()}`;

      const matchingCase = snapshot.cases.find((c) => c.caseId.startsWith(casePrefix));

      if (!matchingCase) {
        console.log(`  ⚠ No matching case for: ${repoName} / ${pr.pr_title.slice(0, 50)}`);
        continue;
      }

      // Extract candidates from the raw LLM response
      const candidates = extractCandidatesFromResponse(matchingCase.rawResponse);
      totalCandidates += candidates.length;

      // Ensure PR entry exists in benchmark data
      const prKey = pr.url;
      if (!benchmarkData[prKey]) {
        benchmarkData[prKey] = {
          pr_title: pr.pr_title,
          original_url: pr.original_url,
          source_repo: repoName,
          golden_comments: pr.comments,
          reviews: [],
        };
      }

      // Remove any existing "judges" review
      benchmarkData[prKey].reviews = benchmarkData[prKey].reviews.filter((r) => r.tool !== "judges");

      // Add our review
      benchmarkData[prKey].reviews.push({
        tool: "judges",
        pr_url: pr.url,
        review_comments: candidates.map((c, i) => ({
          path: "review",
          line: i + 1,
          body: c,
        })),
        candidates,
      });

      exported++;
    }
  }

  console.log(`\nExported ${exported} PRs with ${totalCandidates} total candidates`);
  console.log(`Average candidates per PR: ${(totalCandidates / Math.max(exported, 1)).toFixed(1)}`);

  // Write output
  writeFileSync(outputPath, JSON.stringify(benchmarkData, null, 2), "utf-8");
  console.log(`\nWrote to: ${outputPath}`);

  console.log(`
Next steps:
  cd ../code-review-benchmark/offline

  # Step 2.5: Deduplicate candidates
  uv run python -m code_review_benchmark.step2_5_dedup_candidates --tool judges

  # Step 3: Run Martian's LLM judge
  uv run python -m code_review_benchmark.step3_judge_comments --tool judges \\
    --dedup-groups results/anthropic_claude-opus-4-5-20251101/dedup_groups.json

  # Step 4: Generate dashboard
  uv run python analysis/benchmark_dashboard.py
`);
}

main();
