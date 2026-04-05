/**
 * `judges codify-amendments` — Bake benchmark-learned amendments into judge source files.
 *
 * Reads amendments from either:
 *   - The VS Code global storage (llm-benchmark-amendments.json)
 *   - A specified JSON file (--file path)
 *
 * For each amendment, appends a BENCHMARK-LEARNED section to the judge's
 * FALSE POSITIVE AVOIDANCE block in the agent .judge.md file. Then runs
 * generate:agents to sync .ts files.
 *
 * This makes self-teaching improvements part of the distributed package
 * rather than local-only amendment files.
 *
 * Usage:
 *   judges codify-amendments                    # from VS Code global storage
 *   judges codify-amendments --file amend.json  # from file
 *   judges codify-amendments --dry-run          # preview without writing
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import type { AmendmentStore, PromptAmendment } from "./llm-benchmark-optimizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the agents directory relative to this source file.
 */
function findAgentsDir(): string {
  // In dist/commands/ → go up to repo root
  const candidates = [
    resolve(__dirname, "..", "..", "agents"),
    resolve(__dirname, "..", "agents"),
    resolve(process.cwd(), "agents"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error("Cannot find agents/ directory. Run from the repo root.");
}

/**
 * Load amendments from a file or the default VS Code global storage location.
 */
function loadAmendments(filePath?: string): PromptAmendment[] {
  if (filePath) {
    const store: AmendmentStore = JSON.parse(readFileSync(resolve(filePath), "utf8"));
    return store.amendments;
  }

  const globalPath = getAmendmentStorePath();
  if (!existsSync(globalPath)) {
    throw new Error(`No amendments found at ${globalPath}. Run an LLM benchmark first, or use --file.`);
  }
  const store: AmendmentStore = JSON.parse(readFileSync(globalPath, "utf8"));
  return store.amendments;
}

/**
 * Resolve the path to the VS Code global storage amendment file.
 */
function getAmendmentStorePath(filePath?: string): string {
  if (filePath) return resolve(filePath);
  const appdata = process.env.APPDATA || process.env.HOME;
  if (!appdata) throw new Error("Cannot determine global storage path. Use --file to specify.");
  return join(appdata, "Code", "User", "globalStorage", "kevinrabun.judges-panel", "llm-benchmark-amendments.json");
}

/**
 * Clear the amendment store after codification to prevent double-application.
 * Codified amendments live in the .judge.md files; keeping the runtime store
 * causes them to be injected twice into LLM benchmark prompts.
 */
function clearAmendmentStore(filePath?: string): void {
  const storePath = getAmendmentStorePath(filePath);
  if (existsSync(storePath)) {
    const emptyStore: AmendmentStore = { amendments: [], version: 1, history: [] };
    writeFileSync(storePath, JSON.stringify(emptyStore, null, 2), "utf8");
    console.log(`  🧹 Cleared amendment store at ${storePath}`);
  }
}

/**
 * Codify a single amendment into a judge's .judge.md file by appending
 * to the FALSE POSITIVE AVOIDANCE section (or creating one if missing).
 */
function codifyAmendment(agentsDir: string, amendment: PromptAmendment, dryRun: boolean): boolean {
  // Map prefix to judge file
  const files = existsSync(agentsDir) ? readdirSync(agentsDir) : [];
  let targetFile: string | undefined;

  for (const file of files) {
    if (!file.endsWith(".judge.md")) continue;
    const content = readFileSync(join(agentsDir, file), "utf8");
    // Match judge by rule prefix in frontmatter
    if (
      content.includes(`rulePrefix: ${amendment.judgePrefix}`) ||
      content.includes(`rulePrefix: "${amendment.judgePrefix}"`)
    ) {
      targetFile = file;
      break;
    }
  }

  if (!targetFile) {
    console.error(`  ⚠ No agent file found for prefix ${amendment.judgePrefix} — skipping`);
    return false;
  }

  const filePath = join(agentsDir, targetFile);
  let content = readFileSync(filePath, "utf8");

  // Build the codified section
  const codifiedBlock = [
    "",
    `BENCHMARK-LEARNED PRECISION GUIDANCE (${amendment.judgePrefix}):`,
    `- ${amendment.amendment}`,
    `- Source: ${amendment.generatedFrom} | FP rate: ${(amendment.fpRate * 100).toFixed(0)}% | Generated: ${amendment.timestamp.slice(0, 10)}`,
  ].join("\n");

  // Check if already codified for this prefix
  if (content.includes(`BENCHMARK-LEARNED PRECISION GUIDANCE (${amendment.judgePrefix})`)) {
    console.log(`  ♻ ${targetFile} — already has codified amendment for ${amendment.judgePrefix}, replacing`);
    // Replace existing block
    content = content.replace(
      new RegExp(`\\nBENCHMARK-LEARNED PRECISION GUIDANCE \\(${amendment.judgePrefix}\\):[\\s\\S]*?(?=\\n[A-Z]|$)`),
      codifiedBlock,
    );
  } else {
    // Insert before ADVERSARIAL MANDATE if exists, otherwise append
    if (content.includes("ADVERSARIAL MANDATE:")) {
      content = content.replace("ADVERSARIAL MANDATE:", codifiedBlock + "\n\nADVERSARIAL MANDATE:");
    } else {
      content = content.trimEnd() + "\n" + codifiedBlock + "\n";
    }
  }

  if (dryRun) {
    console.log(`  📝 [DRY RUN] Would update ${targetFile}`);
    console.log(`     ${codifiedBlock.split("\n").slice(1, 3).join("\n     ")}`);
  } else {
    writeFileSync(filePath, content);
    console.log(`  ✅ Updated ${targetFile}`);
  }

  return true;
}

import { readdirSync } from "fs";

export function runCodifyAmendments(argv: string[]): void {
  const dryRun = argv.includes("--dry-run");
  const fileIdx = argv.indexOf("--file");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        Judges — Codify Benchmark Amendments                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  let amendments: PromptAmendment[];
  try {
    amendments = loadAmendments(filePath);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (amendments.length === 0) {
    console.log("  No amendments to codify. Run an LLM benchmark to generate them.");
    process.exit(0);
  }

  console.log(`  Found ${amendments.length} amendment(s) to codify${dryRun ? " (dry run)" : ""}:`);
  for (const a of amendments) {
    console.log(`    ${a.judgePrefix}: ${a.reason}`);
  }
  console.log("");

  const agentsDir = findAgentsDir();
  let codified = 0;

  for (const amendment of amendments) {
    if (codifyAmendment(agentsDir, amendment, dryRun)) {
      codified++;
    }
  }

  console.log("");
  console.log(
    `  ${dryRun ? "Would codify" : "Codified"} ${codified}/${amendments.length} amendment(s) into agent files.`,
  );
  if (!dryRun && codified > 0) {
    // Clear the amendment store so codified amendments aren't double-applied
    // at runtime during the next LLM benchmark run
    clearAmendmentStore(filePath);

    console.log("  Next steps:");
    console.log("    1. npm run generate:agents:force  — sync .ts files from .judge.md");
    console.log("    2. npm run build                  — rebuild");
    console.log("    3. npm test                       — verify");
    console.log("    4. Commit and release");
  }
  console.log("");
}
