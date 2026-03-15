import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-similar-match ──────────────────────────────────────────
   Find similar findings across reviews by comparing rule IDs,
   titles, severity, and descriptions to identify recurring
   patterns that may indicate systemic issues.
   ─────────────────────────────────────────────────────────────────── */

interface SimilarGroup {
  anchor: string;
  anchorTitle: string;
  severity: string;
  similarFindings: Array<{ ruleId: string; title: string; similarity: number }>;
  recommendation: string;
}

function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const total = Math.max(wordsA.size, wordsB.size);
  return total > 0 ? overlap / total : 0;
}

function findSimilar(findings: Finding[], threshold: number): SimilarGroup[] {
  const groups: SimilarGroup[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < findings.length; i++) {
    if (processed.has(i)) continue;

    const anchor = findings[i];
    const similar: Array<{ ruleId: string; title: string; similarity: number }> = [];

    for (let j = i + 1; j < findings.length; j++) {
      if (processed.has(j)) continue;

      const other = findings[j];
      const titleSim = computeSimilarity(anchor.title, other.title);
      const descSim = computeSimilarity(anchor.description, other.description);
      const combined = titleSim * 0.6 + descSim * 0.4;

      if (combined >= threshold || anchor.ruleId === other.ruleId) {
        processed.add(j);
        similar.push({
          ruleId: other.ruleId,
          title: other.title,
          similarity: Math.round(combined * 100),
        });
      }
    }

    processed.add(i);

    if (similar.length > 0) {
      groups.push({
        anchor: anchor.ruleId,
        anchorTitle: anchor.title,
        severity: anchor.severity,
        similarFindings: similar,
        recommendation:
          similar.length >= 3
            ? "Recurring pattern — consider a project-wide fix"
            : "Similar findings found — review together",
      });
    }
  }

  return groups;
}

export function runFindingSimilarMatch(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-similar-match [options]

Find similar findings across reviews.

Options:
  --report <path>      Path to verdict JSON file
  --threshold <n>      Similarity threshold 0-100 (default: 50)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const threshIdx = argv.indexOf("--threshold");
  const threshold = threshIdx !== -1 && argv[threshIdx + 1] ? parseInt(argv[threshIdx + 1], 10) / 100 : 0.5;

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    console.log("Run a review first or provide --report.");
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length < 2) {
    console.log("Need at least 2 findings for similarity analysis.");
    return;
  }

  const groups = findSimilar(findings, threshold);

  if (format === "json") {
    console.log(JSON.stringify(groups, null, 2));
    return;
  }

  console.log("\n=== Similar Findings ===\n");
  console.log(`Analyzed: ${findings.length} findings`);
  console.log(`Similar groups: ${groups.length}\n`);

  if (groups.length === 0) {
    console.log("No similar findings found at current threshold.");
    return;
  }

  for (const g of groups) {
    console.log(`[${g.severity.toUpperCase()}] ${g.anchor}: ${g.anchorTitle}`);
    console.log(`  Similar matches (${g.similarFindings.length}):`);
    for (const s of g.similarFindings) {
      console.log(`    ${s.ruleId} (${s.similarity}% similar): ${s.title}`);
    }
    console.log(`  → ${g.recommendation}`);
    console.log();
  }
}
