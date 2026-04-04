/**
 * sync-test-count.ts — Update test count badges across README and wiki.
 *
 * Reads the actual test count by running `npm test`, then updates:
 * 1. README.md badge: tests-NNNN-brightgreen
 * 2. CHANGELOG.md latest entry: Total: NNNN pass
 * 3. Wiki Home.md (if wiki repo exists at ../judges.wiki)
 *
 * Usage:
 *   npx tsx scripts/sync-test-count.ts          # auto-detect from npm test
 *   npx tsx scripts/sync-test-count.ts --count 3614  # manual count
 *   npx tsx scripts/sync-test-count.ts --dry-run
 *
 * This ensures test counts stay consistent across all documentation surfaces.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const WIKI_DIR = resolve(ROOT, "..", "judges.wiki");
const DRY_RUN = process.argv.includes("--dry-run");

// Get test count
let testCount: number;
const countArgIdx = process.argv.indexOf("--count");
if (countArgIdx >= 0) {
  testCount = parseInt(process.argv[countArgIdx + 1], 10);
} else {
  console.log("Running npm test to get current count...");
  const output = execSync("npm test 2>&1", { cwd: ROOT, encoding: "utf8", timeout: 180_000 });
  const match = output.match(/# pass (\d+)/);
  if (!match) {
    console.error("Could not parse test count from npm test output");
    process.exit(1);
  }
  testCount = parseInt(match[1], 10);
}

console.log(`Test count: ${testCount}`);

function updateFile(filePath: string, label: string): boolean {
  if (!existsSync(filePath)) {
    console.log(`  SKIP: ${label} — file not found`);
    return false;
  }

  let content = readFileSync(filePath, "utf8");
  let changed = false;

  // Badge: tests-NNNN-brightgreen
  const badgePattern = /tests-\d+-brightgreen/g;
  if (badgePattern.test(content)) {
    content = content.replace(badgePattern, `tests-${testCount}-brightgreen`);
    changed = true;
  }

  // Table row: | **Test Suite** | N,NNN tests passing |
  const tablePattern = /\*\*Test Suite\*\*\s*\|\s*[\d,]+\s*tests passing/g;
  if (tablePattern.test(content)) {
    content = content.replace(tablePattern, `**Test Suite** | ${testCount.toLocaleString()} tests passing`);
    changed = true;
  }

  if (changed) {
    if (DRY_RUN) {
      console.log(`  DRY RUN: would update ${label}`);
    } else {
      writeFileSync(filePath, content);
      console.log(`  ✅ Updated ${label}`);
    }
  } else {
    console.log(`  OK: ${label} — already current`);
  }

  return changed;
}

console.log(`\nUpdating test counts to ${testCount}:`);
updateFile(resolve(ROOT, "README.md"), "README.md");
updateFile(resolve(WIKI_DIR, "Home.md"), "Wiki Home.md");

console.log("\nDone. Remember to commit + push both repos if changed.");
