/**
 * sync-wiki.ts — Generate the wiki Home.md from the main README.md.
 *
 * Extracts key sections from README.md, condenses them, and writes
 * to the wiki repo (../judges.wiki/Home.md). This ensures the wiki
 * never drifts from the main README.
 *
 * Also syncs the test count badge and benchmark table.
 *
 * Usage:
 *   npx tsx scripts/sync-wiki.ts              # generate + write
 *   npx tsx scripts/sync-wiki.ts --dry-run    # preview only
 *   npx tsx scripts/sync-wiki.ts --push       # also git commit + push wiki
 *
 * Run this as part of each release to keep wiki in sync.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const WIKI_DIR = resolve(ROOT, "..", "judges.wiki");
const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_PUSH = process.argv.includes("--push");

const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");

// ─── Extract sections from README ───────────────────────────────────────────

function extractSection(heading: string, endBefore?: string): string {
  const headingPattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")}`, "m");
  const start = readme.search(headingPattern);
  if (start < 0) return "";

  let end: number;
  if (endBefore) {
    const endPattern = new RegExp(`^##\\s+${endBefore.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")}`, "m");
    const endMatch = readme.slice(start + 1).search(endPattern);
    end = endMatch >= 0 ? start + 1 + endMatch : readme.length;
  } else {
    // Find next ## heading
    const nextH2 = readme.slice(start + 1).search(/^## /m);
    end = nextH2 >= 0 ? start + 1 + nextH2 : readme.length;
  }

  return readme.slice(start, end).trim();
}

// Extract badge line from README
const badgeLine = readme.match(/\[!\[Tests\].*?\n/)?.[0]?.trim() ?? "";
const npmBadge = readme.match(/\[!\[npm\]\(https:\/\/img\.shields\.io\/npm\/v.*?\n/)?.[0]?.trim() ?? "";
const licenseBadge = readme.match(/\[!\[License.*?\n/)?.[0]?.trim() ?? "";

// Extract test count for the benchmark table
const testCountMatch = readme.match(/tests-(\d+)-brightgreen/);
const testCount = testCountMatch ? testCountMatch[1] : "0";

// Extract the judges table from "The 45 Judges" or similar section
const judgesSection = extractSection("The 45 Judges") || extractSection("Judge Taxonomy");

// Extract key features
const featuresSection = extractSection("Key Features") || extractSection("Features");

// Build wiki Home.md
const wiki = `# Judges Panel

<!-- AUTO-GENERATED from README.md by scripts/sync-wiki.ts — do not edit manually -->

**Judges Panel** is an open-source MCP server that provides **45 specialized judges** to evaluate AI-generated code — acting as an independent quality gate regardless of which project is being reviewed.

It combines **deterministic pattern matching & AST analysis** (instant, offline, zero LLM calls) with **LLM-powered deep-review prompts** that let your AI assistant perform expert-persona analysis across all 45 domains.

${npmBadge}
${licenseBadge}
${badgeLine}

---

## Why Judges?

AI code generators (Copilot, Cursor, Claude, ChatGPT, etc.) write code fast — but they routinely produce insecure defaults, missing auth, hardcoded secrets, and poor error handling. Human reviewers catch some of this, but nobody reviews 45 dimensions consistently.

**Judges doesn't replace linters** — it covers the dimensions linters don't: authentication strategy, data sovereignty, cost patterns, accessibility, framework-specific anti-patterns, and architectural issues across multiple files.

---

${judgesSection}

---

${featuresSection}

---

## Quick Start

\`\`\`bash
# Install globally
npm install -g @kevinrabun/judges-cli

# Evaluate any file
judges eval src/app.ts

# Single judge
judges eval --judge cybersecurity server.ts

# SARIF output for CI
judges eval --file app.ts --format sarif > results.sarif

# List all judges and regulatory frameworks
judges list
judges list --frameworks
\`\`\`

Or use as an MCP server with any compatible client:

\`\`\`json
{
  "command": "npx",
  "args": ["-y", "@kevinrabun/judges"]
}
\`\`\`

---

## Benchmark Results

The deterministic benchmark suite (L1) tests all 45 judges across **1,048 test cases** — including 191 clean-code false-positive tests.

| Metric | Result |
|---|---|
| **Overall Grade** | 🟢 **A** |
| **Test Suite** | ${Number(testCount).toLocaleString()} tests passing |

👉 **[View the full Benchmark Report](Benchmark-Report)**

---

## Resources

- [GitHub Repository](https://github.com/KevinRabun/judges)
- [npm Package](https://www.npmjs.com/package/@kevinrabun/judges)
- [CLI Package](https://www.npmjs.com/package/@kevinrabun/judges-cli)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=kevinrabun.judges-panel)
- [API Reference](https://github.com/KevinRabun/judges/blob/main/docs/api-reference.md)
- [Plugin Guide](https://github.com/KevinRabun/judges/blob/main/docs/plugin-guide.md)
- [Migration Guides](https://github.com/KevinRabun/judges/blob/main/docs/migration-guides.md)
- [JetBrains Setup](https://github.com/KevinRabun/judges/blob/main/docs/jetbrains-setup.md)
`;

if (!existsSync(WIKI_DIR)) {
  console.error(`Wiki repo not found at ${WIKI_DIR}. Clone it first:`);
  console.error(`  git clone https://github.com/KevinRabun/judges.wiki.git ../judges.wiki`);
  process.exit(1);
}

const outPath = resolve(WIKI_DIR, "Home.md");
if (DRY_RUN) {
  console.log("=== DRY RUN — would write to", outPath, "===");
  console.log(wiki.slice(0, 500) + "\n...");
} else {
  writeFileSync(outPath, wiki);
  console.log(`✅ Written ${outPath} (${wiki.length} chars)`);

  if (AUTO_PUSH) {
    console.log("Pushing wiki...");
    try {
      execSync('git add -A && git diff --cached --quiet || git commit -m "docs: auto-sync from README"', {
        cwd: WIKI_DIR,
        stdio: "inherit",
      });
      execSync("git push", { cwd: WIKI_DIR, stdio: "inherit" });
      console.log("✅ Wiki pushed");
    } catch {
      console.log("Wiki already up to date or push failed — check manually");
    }
  } else {
    console.log(
      "Run with --push to auto-commit, or manually: cd ../judges.wiki && git add -A && git commit && git push",
    );
  }
}
