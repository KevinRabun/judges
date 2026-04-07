/**
 * Prepare OpenSSF CVE cases for L2 LLM evaluation.
 *
 * Clones vulnerable code from 30 selected CVEs and produces a
 * BenchmarkCase[] JSON file that can be fed into the VS Code
 * LLM benchmark runner via the external benchmark command.
 *
 * Usage:
 *   npx tsx scripts/prepare-openssf-l2-cases.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join, resolve, extname } from "path";
import { execSync } from "child_process";

interface OpenSSFCve {
  CVE: string;
  state: string;
  repository: string;
  prePatch: {
    commit: string;
    weaknesses: Array<{ location: { file: string; line: number }; explanation: string }>;
  };
  postPatch: { commit: string };
  CWEs: string[];
}

interface BenchmarkCase {
  id: string;
  description: string;
  language: string;
  code: string;
  expectedRuleIds: string[];
  acceptablePrefixes?: string[];
  category: string;
  difficulty: "easy" | "medium" | "hard";
  aiSource?: string;
}

const CWE_TO_PREFIXES: Record<string, string[]> = {
  "CWE-078": ["CYBER", "SEC"],
  "CWE-079": ["CYBER", "SEC"],
  "CWE-088": ["CYBER", "SEC"],
  "CWE-089": ["CYBER", "SEC", "DB"],
  "CWE-094": ["CYBER", "SEC"],
  "CWE-116": ["SEC", "CYBER"],
  "CWE-020": ["SEC", "CYBER"],
  "CWE-022": ["CYBER", "SEC"],
  "CWE-023": ["CYBER", "SEC"],
  "CWE-036": ["CYBER", "SEC"],
  "CWE-073": ["CYBER", "SEC"],
  "CWE-099": ["CYBER", "SEC"],
  "CWE-400": ["RATE", "CYBER", "SEC"],
  "CWE-730": ["RATE", "CYBER"],
  "CWE-770": ["RATE"],
  "CWE-829": ["CYBER", "SEC"],
  "CWE-915": ["CYBER", "SEC"],
  "CWE-918": ["CYBER", "SEC"],
  "CWE-601": ["CYBER", "SEC"],
};

const CWE_CATEGORY: Record<string, string> = {
  "CWE-078": "command-injection",
  "CWE-079": "xss",
  "CWE-088": "command-injection",
  "CWE-089": "sql-injection",
  "CWE-094": "code-injection",
  "CWE-116": "xss",
  "CWE-020": "input-validation",
  "CWE-022": "path-traversal",
  "CWE-023": "path-traversal",
  "CWE-036": "path-traversal",
  "CWE-073": "path-traversal",
  "CWE-099": "path-traversal",
  "CWE-400": "denial-of-service",
  "CWE-730": "denial-of-service",
  "CWE-770": "denial-of-service",
  "CWE-829": "code-injection",
  "CWE-915": "prototype-pollution",
  "CWE-918": "ssrf",
  "CWE-601": "open-redirect",
};

function main(): void {
  const cveDir = resolve("C:/Source/ossf-cve-benchmark/CVEs");
  const sourcesDir = resolve("C:/Source/ossf-cve-benchmark/work/sources");
  const outputPath = resolve("C:/Source/judges/benchmarks/openssf-l2-cases.json");

  if (!existsSync(sourcesDir)) mkdirSync(sourcesDir, { recursive: true });

  // Load all CVEs
  const allCves: OpenSSFCve[] = readdirSync(cveDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(cveDir, f), "utf-8")));

  // Stratified selection: pick across CWE types
  const target: Record<string, number> = {
    "CWE-079": 6,
    "CWE-078": 5,
    "CWE-094": 4,
    "CWE-022": 4,
    "CWE-915": 3,
    "CWE-400": 3,
    "CWE-020": 2,
    "CWE-089": 2,
    "CWE-918": 1,
  };

  const byCwe = new Map<string, OpenSSFCve[]>();
  for (const cve of allCves) {
    for (const cwe of cve.CWEs) {
      if (!byCwe.has(cwe)) byCwe.set(cwe, []);
      byCwe.get(cwe)!.push(cve);
    }
  }

  const selectedIds = new Set<string>();
  const selected: OpenSSFCve[] = [];

  for (const [cwe, count] of Object.entries(target)) {
    const pool = (byCwe.get(cwe) ?? []).filter((c) => !selectedIds.has(c.CVE));
    // Deterministic selection — sort by CVE ID for reproducibility
    pool.sort((a, b) => a.CVE.localeCompare(b.CVE));
    for (let i = 0; i < Math.min(count, pool.length); i++) {
      selected.push(pool[i]);
      selectedIds.add(pool[i].CVE);
    }
  }

  console.log(`Selected ${selected.length} CVEs for L2 evaluation`);

  // Clone repos and extract vulnerable code
  const cases: BenchmarkCase[] = [];
  let cloned = 0;
  let failed = 0;

  for (const cve of selected) {
    const cveSourceDir = join(sourcesDir, cve.CVE);
    const mirrorUrl = `https://github.com/ossf-cve-benchmark/${cve.CVE}.git`;

    // Clone if needed
    if (!existsSync(cveSourceDir)) {
      try {
        console.log(`  Cloning ${cve.CVE}...`);
        execSync(`git clone --quiet "${mirrorUrl}" "${cveSourceDir}"`, {
          stdio: "pipe",
          timeout: 60_000,
        });
        cloned++;
      } catch {
        // Fallback to original repo
        try {
          execSync(`git clone --quiet "${cve.repository}" "${cveSourceDir}"`, {
            stdio: "pipe",
            timeout: 120_000,
          });
          cloned++;
        } catch {
          console.log(`  ❌ Failed to clone ${cve.CVE}`);
          failed++;
          continue;
        }
      }
    }

    // Checkout vulnerable commit
    try {
      execSync(`git checkout --quiet "${cve.prePatch.commit}"`, {
        cwd: cveSourceDir,
        stdio: "pipe",
        timeout: 30_000,
      });
    } catch {
      console.log(`  ❌ Failed to checkout ${cve.CVE} @ ${cve.prePatch.commit}`);
      failed++;
      continue;
    }

    // Read the vulnerable file
    const weakFile = cve.prePatch.weaknesses[0]?.location.file;
    if (!weakFile) continue;

    const filePath = join(cveSourceDir, weakFile);
    if (!existsSync(filePath)) {
      console.log(`  ❌ File not found: ${weakFile} in ${cve.CVE}`);
      failed++;
      continue;
    }

    let code = readFileSync(filePath, "utf-8");

    // Cap at 16KB
    if (code.length > 16_000) {
      // Try to extract just the area around the weakness
      const weakLine = cve.prePatch.weaknesses[0].location.line;
      const lines = code.split("\n");
      const start = Math.max(0, weakLine - 50);
      const end = Math.min(lines.length, weakLine + 50);
      code = lines.slice(start, end).join("\n");
      code = `// ${cve.CVE} — vulnerability at line ${weakLine} of ${weakFile}\n// Showing lines ${start + 1}–${end}\n\n${code}`;
    }

    // Build expected rule IDs from CWEs
    const expectedPrefixes = new Set<string>();
    for (const cwe of cve.CWEs) {
      const prefixes = CWE_TO_PREFIXES[cwe] ?? ["CYBER", "SEC"];
      for (const p of prefixes) expectedPrefixes.add(p);
    }
    const expectedRuleIds = [...expectedPrefixes].map((p) => `${p}-001`);

    // Determine category and language
    const ext = extname(weakFile).toLowerCase();
    const language = ext === ".ts" || ext === ".tsx" ? "typescript" : "javascript";
    const primaryCwe = cve.CWEs[0];
    const category = CWE_CATEGORY[primaryCwe] ?? "security";

    cases.push({
      id: `openssf-${cve.CVE.toLowerCase()}`,
      description: `Real-world ${cve.CVE} (${cve.CWEs.join(", ")}): ${cve.prePatch.weaknesses[0].explanation}`,
      language,
      code,
      expectedRuleIds,
      acceptablePrefixes: ["CYBER", "SEC", "AUTH", "ERR", "DB", "RATE", "CFG"],
      category: `openssf-${category}`,
      difficulty: "hard",
      aiSource: "openssf-cve-benchmark",
    });

    const icon = "✅";
    console.log(
      `  ${icon} ${cve.CVE} (${cve.CWEs.join(",")}): ${weakFile}:${cve.prePatch.weaknesses[0].location.line} — ${code.length} chars`,
    );
  }

  console.log(`\nResults: ${cases.length} cases prepared, ${cloned} cloned, ${failed} failed`);

  // Write output
  writeFileSync(outputPath, JSON.stringify(cases, null, 2), "utf-8");
  console.log(`Wrote to: ${outputPath}`);

  // Summary by category
  const catCounts = new Map<string, number>();
  for (const c of cases) {
    catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  }
  console.log("\nBy category:");
  for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
}

main();
