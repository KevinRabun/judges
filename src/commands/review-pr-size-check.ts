import { readFileSync, existsSync } from "fs";
import { join } from "path";

/* ── review-pr-size-check ───────────────────────────────────────────
   Check PR size and complexity to suggest splitting large PRs
   into smaller, more reviewable chunks. Large PRs reduce review
   quality and increase defect escape rates.
   ─────────────────────────────────────────────────────────────────── */

interface SizeCheck {
  fileCount: number;
  totalLines: number;
  category: string;
  recommendation: string;
  splitSuggestions: string[];
}

function checkPrSize(files: string[]): SizeCheck {
  let totalLines = 0;
  const fileGroups = new Map<string, string[]>();

  for (const file of files) {
    const parts = file.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    const group = fileGroups.get(dir);
    if (group !== undefined) {
      group.push(file);
    } else {
      fileGroups.set(dir, [file]);
    }
    totalLines += 50;
  }

  let category: string;
  let recommendation: string;

  if (files.length > 20 || totalLines > 1000) {
    category = "too-large";
    recommendation = "PR is too large for effective review — strongly recommend splitting";
  } else if (files.length > 10 || totalLines > 500) {
    category = "large";
    recommendation = "Large PR — consider splitting for better review quality";
  } else if (files.length > 5) {
    category = "medium";
    recommendation = "Moderate size — reviewable but could benefit from split";
  } else {
    category = "small";
    recommendation = "Good size for thorough review";
  }

  const splitSuggestions: string[] = [];
  if (fileGroups.size > 3 && files.length > 10) {
    for (const [dir, dirFiles] of fileGroups) {
      if (dirFiles.length >= 3) {
        splitSuggestions.push(`Split ${dir}/ changes (${dirFiles.length} files) into separate PR`);
      }
    }
  }

  const hasTests = files.some((f) => f.includes("test") || f.includes("spec"));
  const hasSource = files.some((f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".py") || f.endsWith(".go"));
  if (hasTests && hasSource && files.length > 8) {
    splitSuggestions.push("Consider separating test changes from source changes");
  }

  const hasConfig = files.some((f) => f.endsWith(".json") || f.endsWith(".yml") || f.endsWith(".yaml"));
  if (hasConfig && hasSource && files.length > 8) {
    splitSuggestions.push("Consider separating config changes from source changes");
  }

  return { fileCount: files.length, totalLines, category, recommendation, splitSuggestions };
}

export function runReviewPrSizeCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-pr-size-check [options]

Check PR size and suggest splitting.

Options:
  --files <path>     File listing changed files (one per line)
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const filesIdx = argv.indexOf("--files");
  const filesPath = filesIdx !== -1 && argv[filesIdx + 1] ? join(process.cwd(), argv[filesIdx + 1]) : null;

  let changedFiles: string[] = [];
  if (filesPath !== null && existsSync(filesPath)) {
    changedFiles = readFileSync(filesPath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  if (changedFiles.length === 0) {
    console.log("No changed files found. Provide --files with a list of changed files.");
    return;
  }

  const result = checkPrSize(changedFiles);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("\n=== PR Size Check ===\n");
  console.log(`Files: ${result.fileCount}`);
  console.log(`Estimated lines: ${result.totalLines}`);
  console.log(`Category: ${result.category.toUpperCase()}`);
  console.log(`\n${result.recommendation}`);

  if (result.splitSuggestions.length > 0) {
    console.log("\nSplit Suggestions:");
    for (const s of result.splitSuggestions) {
      console.log(`  • ${s}`);
    }
  }
}
